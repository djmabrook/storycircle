import type { Project } from '../types'
import { HUES } from '../circle/StoryWheel'
import { STEPS, stepStatus } from '../scene/SceneWorkspace'

interface Props {
  project: Project
  stageIndex: number
  onIdea: (text: string) => void
  onOpenScene: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onAddScene: () => void
  onSuggest: () => void
  onMinimize: () => void
}

const WORLD = { familiar: 'Familiar world', threshold: 'Threshold', unfamiliar: 'Unfamiliar world' }

export function StageCard({ project, stageIndex, onIdea, onOpenScene, onMove, onAddScene, onSuggest, onMinimize }: Props) {
  const st = project.stages[stageIndex]
  return (
    <section className="panel stage-card glass" style={{ ['--h' as string]: HUES[stageIndex] }} aria-label={`Stage ${st.number}: ${st.name}`}>
      <header className="panel-head">
        <span className="stage-chip"><i />Stage {st.number} of 8 · {WORLD[st.world]}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={onMinimize} aria-label="Minimise stage card" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <h2 className="stage-name">{st.name}</h2>
      <p className="step-intro">{st.question}</p>
      <label className="field">
        <span>Your interpretation</span>
        <textarea id={`stage-idea-${st.key}`} rows={2} value={st.idea} placeholder="Blank, partial or deliberately unusual is fine." onChange={(e) => onIdea(e.target.value)} />
      </label>
      <div className="list-head">
        <strong>Scenes</strong>
        <span className="meta">{st.sceneIds.length}</span>
        <span className="spacer" />
        <button className="btn assist-inline small" onClick={onSuggest}>✦ Suggest scenes</button>
      </div>
      <ol className="scene-list">
        {st.sceneIds.map((id, k) => {
          const sc = project.scenes[id]
          const s = stepStatus(sc)
          return (
            <li key={id}>
              <button className="scene-row" onClick={() => onOpenScene(id)}>
                <span className="scene-row-text">
                  <strong>{sc.title}</strong>
                  <span className="meta">{sc.purpose || sc.heading || 'No brief yet'}</span>
                </span>
                <span className="progress-dots" aria-label={STEPS.map((x) => `${x.label} ${s[x.key].done ? 'done' : 'open'}`).join(', ')}>
                  {STEPS.map((x) => <i key={x.key} className={s[x.key].done ? 'on' : ''} title={`${x.label}: ${s[x.key].summary}`} />)}
                </span>
              </button>
              <span className="reorder">
                <button className="icon-btn" disabled={k === 0} onClick={() => onMove(id, -1)} aria-label="Move earlier">↑</button>
                <button className="icon-btn" disabled={k === st.sceneIds.length - 1} onClick={() => onMove(id, 1)} aria-label="Move later">↓</button>
              </span>
            </li>
          )
        })}
      </ol>
      <button className="btn secondary wide" onClick={onAddScene}>+ New scene in {st.name}</button>
    </section>
  )
}
