# StoryCircle

A screenwriting app whose main interface is Dan Harmon's eight-stage Story Circle. Each stage holds its own scenes, the wheel twirls and zooms like a lens so you can work on one slice, and a built-in Claude assistant drafts, rewrites and reviews scenes while you keep control of the text.

Status: **prototype v0.1** (23 Oct 2026).

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

## What's in the prototype

- **The circle.** Eight stages, coloured by where they sit relative to Harmon's threshold: familiar world (You, Need, Change), threshold (Go, Return) and unfamiliar world (Search, Find, Take). The dashed line through Go and Return is the threshold. The outer ring shows each stage's scenes; filled slices have a draft, and a gold dot means the scene also serves another stage.
- **Stage panel.** The stage's craft question, your interpretation (blank or unusual is allowed), and its scenes, which you can reorder or add to.
- **Scene editor.** Title, scene heading, a short brief (contributes / attempt / resistance / turn), "also serves" links to other stages, beat slices, and a Fountain draft in Courier with a word and page estimate.
- **Assist button.** In the hub of the wheel and on every panel. With a scene open it offers *Draft scene*, *Rewrite* (the whole scene, or just the passage you selected), *Review* (choose a focus such as character or continuity) and *Ask*. On a stage it offers *Suggest scenes*, which you can add with one click.
- **Writer control.** Claude's output never overwrites your text silently. You choose *Use as draft*, *Keep as alternative* or *Discard*; every replacement saves the earlier version to History, which you can restore. If you edit the draft while a passage rewrite is running, the result is kept as an alternative rather than spliced into changed text.
- **Export.** Fountain export of the whole script in circle order, with stage sections and synopses.
- **Saving.** Autosaves locally. Ships with the "The Last Broadcast" example from the project brief.

## AI connection

| Where it runs | Who answers |
| --- | --- |
| Desktop or web with an API key (Settings, the status pill top right) | Claude API: `claude-opus-5-5` for drafting, rewriting and ideas; `claude-haiku-5-5` for reviews. Server-side refusal fallback is on for Opus requests. |
| Inside Claude as an Artifact | The viewer's own Claude account, with no key needed. |
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
  editor/StagePanel.tsx  stage view
  editor/SceneEditor.tsx scene brief, beats, draft, history
  ai/assistant.ts        prompt and context assembly, providers (API, Claude host, demo)
  ai/AssistPanel.tsx     the Assist UI and accept / keep / discard flow
  store.ts               project state, autosave, Fountain export
  data/seed.ts           Story Circle stages and the sample project
src-tauri/               desktop shell
```

## Next steps (proposed)

1. Save projects as files on disk through Tauri (a project folder with a `.fountain` script plus a JSON sidecar for stages, beats and versions), and keep the API key in the OS keychain.
2. A proper screenplay editor: auto-format elements as you type (CodeMirror with a Fountain mode), pagination, and PDF export.
3. Drag scenes between stages on the wheel, and show many-to-many links as arcs across the circle.
4. Character panel and per-character arcs as extra rings.
5. Sign-in with a Claude subscription, once the right route is confirmed against current Anthropic docs.
6. Branching alternatives (for example the "Mara refuses to share control" ending) shown side by side.
