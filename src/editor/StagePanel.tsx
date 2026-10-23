import type { Project } from '../types'

interface Props {
  project: Project
  stageIndex: number
  onIdea: (text: string) => void
  onOpenScene: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onAddScene: () => void
  onAssist: () => void
}

const WORLD_LABEL = { familiar: 'Familiar world', threshold: 'Threshold', unfamiliar: 'Unfamiliar world' }

export function StagePanel({ project, stageIndex, onIdea, onOpenScene, onMove, onAddScene, onAssist }: Props) {
  const st = project.stages[stageIndex]
  return (
    <article className="stage-panel">
      <header className="editor-head">
        <span className="eyebrow">
          Stage {st.number} of 8 · {WORLD_LABEL[st.world]}
        </span>
        <button className="assist-btn" onClick={onAssist}>
          <span aria-hidden>✦</span> Assist
        </button>
      </header>
      <h2>{st.name}</h2>
      <p className="question">{st.question}</p>
      <label className="field">
        <span>Your interpretation</span>
        <textarea id={`stage-idea-${st.key}`} rows={3} value={st.idea} placeholder="Blank, partial or deliberately unusual is fine." onChange={(e) => onIdea(e.target.value)} />
      </label>

      <div className="draft-head">
        <h3>Scenes</h3>
        <span className="muted">{st.sceneIds.length}</span>
      </div>
      <ol className="scene-list">
        {st.sceneIds.map((id, k) => {
          const sc = project.scenes[id]
          return (
            <li key={id}>
              <button className="scene-row" onClick={() => onOpenScene(id)}>
                <span className={sc.draft.trim() ? 'dot drafted' : 'dot'} aria-label={sc.draft.trim() ? 'Drafted' : 'Not drafted'} />
                <span className="scene-row-text">
                  <strong>{sc.title}</strong>
                  <span className="muted">{sc.purpose || sc.heading}</span>
                </span>
              </button>
              <span className="reorder">
                <button className="ghost" disabled={k === 0} onClick={() => onMove(id, -1)} aria-label="Move earlier">↑</button>
                <button className="ghost" disabled={k === st.sceneIds.length - 1} onClick={() => onMove(id, 1)} aria-label="Move later">↓</button>
              </span>
            </li>
          )
        })}
      </ol>
      <button className="secondary wide" onClick={onAddScene}>
        + New scene in {st.name}
      </button>
    </article>
  )
}
