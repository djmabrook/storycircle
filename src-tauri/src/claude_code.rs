//! Runs Assist through the writer's own Claude Code install, so drafting uses
//! their Claude subscription instead of an API key. Each request is one
//! `claude -p` call with tools off; its stream-json lines are forwarded to the
//! page as they arrive.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

use tauri::ipc::Channel;

#[derive(Default)]
pub struct Running(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

/// PATH as the writer's login shell sets it. Apps opened from Finder get a bare
/// PATH, which misses Homebrew, npm and the node that an npm-installed `claude` needs.
fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let base = std::env::var("PATH").unwrap_or_default();
        #[cfg(unix)]
        {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            if let Ok(out) = Command::new(shell).args(["-lc", "printf %s \"$PATH\""]).stdin(Stdio::null()).output() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() {
                    return format!("{p}:{base}");
                }
            }
        }
        base
    })
}

fn home() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default()
}

fn find_claude() -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    let sep = if cfg!(windows) { ';' } else { ':' };
    let h = home();
    let mut dirs: Vec<PathBuf> = vec![h.join(".claude/local"), h.join(".local/bin"), h.join(".npm-global/bin"), h.join(".bun/bin")];
    if cfg!(windows) {
        if let Some(app) = std::env::var_os("APPDATA") {
            dirs.push(Path::new(&app).join("npm"));
        }
    } else {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].map(PathBuf::from));
    }
    dirs.extend(login_path().split(sep).filter(|d| !d.is_empty()).map(PathBuf::from));
    dirs.iter().flat_map(|d| names.iter().map(move |n| d.join(n))).find(|p| p.is_file())
}

/// Where Claude Code is installed, or None when it isn't found.
#[tauri::command]
pub fn claude_code_path() -> Option<String> {
    find_claude().map(|p| p.to_string_lossy().into_owned())
}

/// Run one Assist request. Each stdout line (stream-json) goes to `on_line`;
/// resolves when the process ends, with its stderr on failure.
#[tauri::command]
pub async fn claude_code_run(
    state: tauri::State<'_, Arc<Running>>,
    id: String,
    prompt: String,
    system: String,
    model: String,
    on_line: Channel<String>,
) -> Result<(), String> {
    let exe = find_claude().ok_or("Claude Code isn't installed on this computer.")?;
    let mut cmd = Command::new(&exe);
    cmd.args([
        "-p",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--model",
        &model,
        "--system-prompt",
        &system,
    ])
    // A neutral folder, so no project's CLAUDE.md or settings shape the screenplay.
    .current_dir(std::env::temp_dir())
    .env("PATH", login_path())
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start Claude Code: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let child = Arc::new(Mutex::new(child));
    state.0.lock().unwrap().insert(id.clone(), child.clone());

    let running = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // The prompt goes in on stdin: screenplay context is too long for a command line.
        let _ = stdin.write_all(prompt.as_bytes());
        drop(stdin);
        let err = std::thread::spawn(move || {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s);
            s
        });
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if on_line.send(line).is_err() {
                break;
            }
        }
        let status = child.lock().unwrap().wait();
        running.0.lock().unwrap().remove(&id);
        let err = err.join().unwrap_or_default();
        match status {
            Ok(s) if s.success() => Ok(()),
            Ok(_) => Err(err.trim().lines().last().unwrap_or("Claude Code stopped with an error.").to_string()),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop a running request (the writer pressed Stop).
#[tauri::command]
pub fn claude_code_cancel(state: tauri::State<'_, Arc<Running>>, id: String) {
    if let Some(child) = state.0.lock().unwrap().remove(&id) {
        let _ = child.lock().unwrap().kill();
    }
}
