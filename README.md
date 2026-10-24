# StoryCircle

A screenwriting app whose main interface is Dan Harmon's eight-stage Story Circle. Each stage holds its own scenes, the wheel twirls and zooms like a lens so you can work on one slice, and a built-in Claude assistant drafts, rewrites and reviews scenes while you keep control of the text.

Status: **prototype v0.2** (23 Oct 2026).

## Run it

```bash
npm install
npm run dev        # web version at http://localhost:5173
npm run desktop    # desktop window via Tauri (needs Rust; see tauri.app/start/prerequisites)
npm run build:single   # one-file HTML preview in dist-single/
```

## Controls

| Gesture | What it does |
| --- | --- |
| Two-finger scroll (trackpad) or mouse wheel | Twirl the circle. Rotation slows as you zoom in, so you can land on a single scene. |
| Pinch (trackpad), or ↑ / ↓ | Zoom into the slice under the needle. The focused stage opens up; the rest compress. |
| Two-finger rotate (Safari; expected in the macOS desktop app, not yet tested there) | Twirl and zoom together, using the real rotate gesture. |
| Drag around the centre | Spin with a mouse or touch screen. |
| ← / → | Step to the previous or next stage, or scene when zoomed. |
| Enter / click a scene | Open it in the editor. Esc zooms back out. |

When you stop, the wheel settles on the nearest stage (zoomed out) or the nearest scene (zoomed in).

## What's in the prototype (v0.2)

The circle is always there as the bottom layer. Views float above it as glass panels and recede into the dock when minimised; when a panel is up, the wheel fades back but still responds to twirl and pinch.

- **Circle view.** The wheel in full, with a stage card for whatever stage sits under the needle: its craft question, your interpretation, and its scenes with a four-dot progress marker.
- **Scene view.** Opens at the first step that still needs work, then moves forward one step at a time: **Brief** (heading, contributes / attempt / resistance / turn, "also serves" links) → **Beats** (a board of draggable beat cards) → **Draft** (the scene as a formatted screenplay page) → **Review** (saved reading passes by focus). Each step shows a one-line summary on the rail, so the other steps stay collapsed.
- **Screenplay view.** The whole script in circle order on a formatted page: scene numbers in both margins, stage markers between movements, a title page, and every scene editable in place. Scroll the script and the wheel turns to the scene you're reading; twirl the wheel and the script scrolls to match. Edits update the circle straight away (drafted slices fill in).
- **Screenplay editing.** Each line knows its element type. `Enter` starts the natural next element (character → dialogue → character, heading → action), `Tab` / `Shift+Tab` cycles the type, typing `INT.` or `EXT.` turns a line into a scene heading. Stored as Fountain.
- **Dock.** Circle, the open scene and Screenplay appear as tabs as you reach them. Click the active tab again to toggle full screen for that view (Esc exits); the minimise button on each panel sends it to the dock.
- **Light and dark.** A switch in the top bar; it follows your system setting until you use it.
- **Assist.** Lives in the dock and in the hub of the wheel. It adapts to where you are: Suggest scenes on a stage, Suggest beats on the board, Draft / Rewrite on a page (select lines to rewrite a passage), Review with a chosen focus, and Ask anywhere. Results never overwrite silently: *Use as draft*, *Keep as alternative* or *Discard*, with every replaced version kept in History.
- **Projects.** New, open, save and switch projects from the title menu (see below). Ships with "The Last Broadcast" from the project brief.

## Projects and files

Click the arrow next to the project title in the top bar.

| Action | What it does |
| --- | --- |
| **New project** | Starts an empty circle: eight stages, no scenes. |
| **New from sample** | A fresh copy of "The Last Broadcast". |
| **Open file…** (`⌘O` / `Ctrl+O`) | Opens a `.storycircle` project file, or imports a `.fountain` script. Scenes are split at their headings; a script exported from StoryCircle goes back onto the right stages with titles and briefs intact. |
| **Save to file…** (`⌘S` / `Ctrl+S`) | Writes the whole project (stages, scenes, beats, drafts, history, reviews) to a `.storycircle` file. |
| **Export Fountain…** | The screenplay as a `.fountain` file for other screenwriting apps. |
| **Projects on this device** | Every project autosaves locally as you type; switch between them or delete old ones here. |

In the desktop app, Open and Save use the native file dialogs. Inside Claude, Save asks before downloading. In a plain browser, files go to your Downloads folder.

## AI connection

| Where it runs | Who answers |
| --- | --- |
| Desktop or web with an API key (Settings, the status pill top right) | Claude API: `claude-opus-5-5` for drafting, rewriting and ideas; `claude-haiku-5-5` for reviews. Server-side refusal fallback is on for Opus requests. |
| Inside Claude as an Artifact | The viewer's own Claude account, with no key needed. Reviews request `claude-haiku-5-5`. |
| Neither | Scripted demo responses, so the flow can be tried. |

Context sent with each request: project frame, characters, your reading of all eight stages, the focused stage, the neighbouring scenes (with the end of their drafts), and the scene's brief, beats and current draft.

## Stack and why

- **Tauri 2 + React + TypeScript + Vite.** The whole UI is a web app, so the web port is the same code with a different storage backend. Tauri gives a small native desktop app and on macOS its WKWebView should pass through the trackpad rotate gesture.
- **SVG wheel** with a fisheye layout (`src/circle/geometry.ts`): each stage's angle is weighted by its distance from the needle, so zoom opens one slice while keeping the whole circle visible.
- **`@anthropic-ai/sdk`** with streaming.

## Layout

```
src/
  circle/geometry.ts     fisheye angle maths, arcs, snapping
  circle/StoryWheel.tsx  the wheel, trackpad / gesture / drag / keyboard input
  stage/StageCard.tsx    stage card for the circle view
  scene/SceneWorkspace.tsx  Brief → Beats → Draft → Review steps
  script/ScriptView.tsx  whole screenplay, synced with the wheel
  script/ScreenplayEditor.tsx  element-based screenplay editor
  script/fountain.ts     Fountain parse / serialize, page estimate
  ai/assistant.ts        prompt and context assembly, providers (API, Claude host, demo)
  ai/AssistPanel.tsx     floating Assist and the accept / keep / discard flow
  store.ts               project state, autosave, Fountain export
  data/seed.ts           Story Circle stages and the sample project
src-tauri/               desktop shell
```

## Next steps (proposed)

1. Keep the API key in the OS keychain, and remember the last file path so `⌘S` saves in place on desktop.
2. Real pagination (page breaks, MORE / CONT'D) and PDF export.
3. Drag scenes between stages on the wheel, and show many-to-many links as arcs across the circle.
4. Character panel and per-character arcs as extra rings.
5. Sign-in with a Claude subscription, once the right route is confirmed against current Anthropic docs.
6. Branching alternatives (for example the "Mara refuses to share control" ending) shown side by side.
