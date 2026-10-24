import type { Project } from '../types'
import { HUES } from '../circle/StoryWheel'
import { STEPS, stepStatus } from '../scene/SceneWorkspace'
import { fmt, fmtMinutes, hourLoad, mirrorOf, rangeLabel, sceneTime, threadsIn, timeline } from '../clock'

interface Props {
  project: Project
  stageIndex: number
  onIdea: (text: string) => void
  onOpenScene: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onAddScene: () => void
  onSuggest: () => void
  onGoToHour: (i: number) => void
  onMinimize: () => void
}

const QUARTER = { q1: 'First quarter · 12 to 3', q2: 'Second quarter · 3 to 6', q3: 'Third quarter · 6 to 9', q4: 'Final quarter · 9 to 12' }
const LOAD = { empty: 'Empty hour', long: 'Runs long', short: 'Room to spare', fits: 'Fits its hour' }

export function StageCard({ project, stageIndex, onIdea, onOpenScene, onMove, onAddScene, onSuggest, onGoToHour, onMinimize }: Props) {
  const st = project.stages[stageIndex]
  const load = hourLoad(project, stageIndex)
  const { start } = timeline(project)
  const mirror = mirrorOf(stageIndex)
  const threads = threadsIn(project, stageIndex)
  const ids = new Set(st.sceneIds)
  const title = (id: string) => project.scenes[id]?.title ?? 'Missing scene'
  return (
    <section className="panel stage-card glass" style={{ ['--h' as string]: HUES[stageIndex] }} aria-label={`Hour ${st.name}`}>
      <header className="panel-head">
        <span className="stage-chip"><i />{QUARTER[st.world]}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={onMinimize} aria-label="Minimise hour card" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <h2 className="stage-name">{st.name} <span className="hour-range">{rangeLabel(project, stageIndex)}</span></h2>
      <p className="step-intro">{st.question}</p>

      <div className={`load-meter ${load.state}`} title={`${fmtMinutes(load.used)} estimated in a ${fmtMinutes(load.slot)} hour`}>
        <span className="load-bar"><i style={{ width: `${Math.min(100, (load.used / load.slot) * 100)}%` }} />{load.used > load.slot && <b style={{ width: `${Math.min(100, ((load.used - load.slot) / load.slot) * 100)}%` }} />}</span>
        <span className="meta">{load.state === 'empty' ? `${LOAD.empty}. Fill it from ideas you already have.` : `${LOAD[load.state]} · ${fmtMinutes(load.used)} of ${fmtMinutes(load.slot)}`}</span>
      </div>

      <label className="field">
        <span>What happens in this hour</span>
        <textarea id={`stage-idea-${st.key}`} rows={2} value={st.idea} placeholder="A lightning-strike idea, a fragment, a question." onChange={(e) => onIdea(e.target.value)} />
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
          const t = sceneTime(project, sc)
          return (
            <li key={id}>
              <button className="scene-row" onClick={() => onOpenScene(id)}>
                <span className="scene-time" title={t.source === 'set' ? 'Runtime you set' : t.source === 'pages' ? 'Estimated from the draft’s page count' : 'Even share of the hour until it’s drafted or set'}>
                  <strong>{fmt(start[id])}</strong>
                  <small className={t.source}>{t.source === 'share' ? '~' : ''}{fmtMinutes(t.minutes)}</small>
                </span>
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
      <button className="btn secondary wide" onClick={onAddScene}>+ New scene at {st.name}</button>

      <div className="list-head threads-head">
        <strong>Threads</strong>
        <span className="meta">{threads.length}</span>
      </div>
      {threads.length ? (
        <ul className="thread-list">
          {threads.map((c) => {
            const out = ids.has(c.from)
            const other = out ? c.to : c.from
            return (
              <li key={c.id}>
                <button className="thread-row" onClick={() => onOpenScene(other)}>
                  <span className={`thread-dir ${out ? 'out' : 'in'}`}>{out ? 'Sets up' : 'Pays off'}</span>
                  <span className="scene-row-text">
                    <strong>{title(c.from)} → {title(c.to)}</strong>
                    {c.note && <span className="meta">{c.note}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="meta">Nothing set up or paid off here yet. Open a scene to connect it to another moment on the clock.</p>
      )}
      <button className="btn ghost small mirror-hint" onClick={() => onGoToHour(mirror)} title="Across the 12–6 line. Threads can land anywhere; this is just a place to look.">
        Look across the clock: {project.stages[mirror].name} ({project.stages[mirror].sceneIds.length} scene{project.stages[mirror].sceneIds.length === 1 ? '' : 's'})
      </button>
    </section>
  )
}
