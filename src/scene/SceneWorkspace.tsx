import { useState } from 'react'
import type { Project, Scene, StageKey } from '../types'
import { uid } from '../data/seed'
import { ScreenplayEditor } from '../script/ScreenplayEditor'
import { parse, pageEstimate } from '../script/fountain'
import { FOCI, Notes, type AssistPreset } from '../ai/AssistPanel'
import { HUES } from '../circle/StoryWheel'

export type Step = 'brief' | 'beats' | 'draft' | 'review'
export const STEPS: { key: Step; label: string }[] = [
  { key: 'brief', label: 'Brief' },
  { key: 'beats', label: 'Beats' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
]

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

export function stepStatus(sc: Scene) {
  const briefCount = [sc.purpose, sc.attempt, sc.resistance, sc.turn].filter((x) => x.trim()).length
  const reviews = sc.reviews?.length ?? 0
  return {
    brief: { done: !!sc.purpose.trim(), summary: `${briefCount} of 4` },
    beats: { done: sc.beats.length > 0, summary: sc.beats.length ? `${sc.beats.length} slice${sc.beats.length === 1 ? '' : 's'}` : 'None yet' },
    draft: { done: !!sc.draft.trim(), summary: sc.draft.trim() ? `${words(sc.draft)} words` : 'Not started' },
    review: { done: reviews > 0, summary: reviews ? `${reviews} pass${reviews === 1 ? '' : 'es'}` : 'Not reviewed' },
  }
}

/** The step a scene naturally opens at: the first one that still needs work. */
export function firstOpenStep(sc: Scene): Step {
  const s = stepStatus(sc)
  return (STEPS.find((x) => !s[x.key].done)?.key ?? 'review') as Step
}

interface Props {
  project: Project
  scene: Scene
  stageIndex: number
  step: Step
  onStep: (s: Step) => void
  onChange: (fn: (s: Scene) => void) => void
  onSelectText: (t: string | null) => void
  onAssist: (p: Omit<AssistPreset, 'nonce'>) => void
  onRestore: (versionId: string) => void
  onDelete: () => void
  onOpenInScript: () => void
  onMinimize: () => void
  onClose: () => void
}

export function SceneWorkspace(props: Props) {
  const { project, scene, stageIndex, step, onStep, onChange } = props
  const stage = project.stages[stageIndex]
  const status = stepStatus(scene)
  const idx = STEPS.findIndex((s) => s.key === step)
  const next = STEPS[idx + 1]

  return (
    <section className="panel scene-panel glass" style={{ ['--h' as string]: HUES[stageIndex] }} aria-label={`Scene: ${scene.title}`}>
      <header className="panel-head">
        <span className="stage-chip"><i />{stage.number} · {stage.name}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={props.onMinimize} aria-label="Minimise scene" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close scene" title="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <input id="scene-title" className="scene-title" value={scene.title} onChange={(e) => onChange((s) => void (s.title = e.target.value))} aria-label="Scene title" />

      <nav className="rail" aria-label="Scene steps">
        {STEPS.map((s, i) => {
          const st = status[s.key]
          const state = s.key === step ? 'current' : st.done ? 'done' : i < idx ? 'skipped' : 'upcoming'
          return (
            <button key={s.key} className={`rail-step ${state}`} onClick={() => onStep(s.key)} aria-current={s.key === step ? 'step' : undefined}>
              <span className="rail-dot">{st.done && s.key !== step ? <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}</span>
              <span className="rail-text">
                <strong>{s.label}</strong>
                <small>{st.summary}</small>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="panel-body" key={step}>
        {step === 'brief' && <BriefStep {...props} />}
        {step === 'beats' && <BeatBoard {...props} />}
        {step === 'draft' && <DraftStep {...props} />}
        {step === 'review' && <ReviewStep {...props} />}
      </div>

      {next && (
        <footer className="panel-foot">
          <button className="btn next" onClick={() => onStep(next.key)}>
            Continue to {next.label}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </footer>
      )}
    </section>
  )
}

function BriefStep({ project, scene, stageIndex, onChange, onDelete }: Props) {
  const [confirm, setConfirm] = useState(false)
  const stage = project.stages[stageIndex]
  const field = (key: 'purpose' | 'attempt' | 'resistance' | 'turn', label: string, placeholder: string) => (
    <label className="field">
      <span>{label}</span>
      <textarea id={`scene-${key}`} rows={1} value={scene[key]} placeholder={placeholder} onChange={(e) => onChange((s) => void (s[key] = e.target.value))} />
    </label>
  )
  const toggle = (k: StageKey) =>
    onChange((s) => void (s.alsoServes = s.alsoServes.includes(k) ? s.alsoServes.filter((x) => x !== k) : [...s.alsoServes, k]))
  return (
    <div className="step">
      <p className="step-intro">{stage.question}</p>
      <label className="field">
        <span>Scene heading</span>
        <input id="scene-heading" className="slug-input" value={scene.heading} placeholder="INT. LOCATION - TIME" onChange={(e) => onChange((s) => void (s.heading = e.target.value.toUpperCase()))} />
      </label>
      {field('purpose', 'What it contributes', 'What does this scene do for the story?')}
      <div className="field-row">
        {field('attempt', 'Attempt', 'Who wants what?')}
        {field('resistance', 'Resistance', 'What gets in the way?')}
      </div>
      {field('turn', 'Turn', 'What is different by the end?')}
      <div className="field">
        <span>Also serves</span>
        <div className="chips">
          {project.stages.filter((s) => s.key !== stage.key).map((s) => (
            <button key={s.key} className={scene.alsoServes.includes(s.key) ? 'chip on' : 'chip'} onClick={() => toggle(s.key)}>
              {s.number} {s.name}
            </button>
          ))}
        </div>
      </div>
      <div className="danger-zone">
        {confirm ? (
          <>
            <span>Delete this scene and its history?</span>
            <button className="btn danger small" onClick={onDelete}>Delete</button>
            <button className="btn ghost small" onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <button className="btn ghost small danger-text" onClick={() => setConfirm(true)}>Delete scene</button>
        )}
      </div>
    </div>
  )
}

function BeatBoard({ scene, onChange, onAssist }: Props) {
  const [draftBeat, setDraftBeat] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const move = (from: string, to: string) =>
    onChange((s) => {
      const a = s.beats.findIndex((b) => b.id === from)
      const b = s.beats.findIndex((x) => x.id === to)
      if (a < 0 || b < 0 || a === b) return
      const [item] = s.beats.splice(a, 1)
      s.beats.splice(b, 0, item)
    })
  return (
    <div className="step">
      <div className="step-toolbar">
        <p className="step-intro">Raw material for the scene: actions, lines, images, facts. Drag to reorder.</p>
        <button className="btn assist-inline" onClick={() => onAssist({ kind: 'beats', autoRun: true })}>✦ Suggest beats</button>
      </div>
      <ol className="beat-board">
        {scene.beats.map((b, i) => (
          <li
            key={b.id}
            className={`beat-card${dragId === b.id ? ' dragging' : ''}${overId === b.id && dragId !== b.id ? ' over' : ''}`}
            draggable
            onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { e.preventDefault(); setOverId(b.id) }}
            onDragLeave={() => setOverId((o) => (o === b.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, b.id); setDragId(null); setOverId(null) }}
            onDragEnd={() => { setDragId(null); setOverId(null) }}
          >
            <span className="beat-num">{i + 1}</span>
            <textarea
              id={`beat-${b.id}`}
              value={b.text}
              rows={2}
              aria-label={`Beat ${i + 1}`}
              onChange={(e) => onChange((s) => void (s.beats.find((x) => x.id === b.id)!.text = e.target.value))}
            />
            <button className="icon-btn beat-x" aria-label="Remove beat" onClick={() => onChange((s) => void (s.beats = s.beats.filter((x) => x.id !== b.id)))}>
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </li>
        ))}
        <li className="beat-card new">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const t = draftBeat.trim()
              if (!t) return
              onChange((s) => void s.beats.push({ id: uid(), text: t }))
              setDraftBeat('')
            }}
          >
            <textarea
              id="beat-new"
              rows={2}
              value={draftBeat}
              placeholder="+ New beat. Press Enter to add."
              onChange={(e) => setDraftBeat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
            />
          </form>
        </li>
      </ol>
    </div>
  )
}

function DraftStep({ scene, onChange, onSelectText, onAssist, onRestore, onOpenInScript }: Props) {
  const [history, setHistory] = useState(false)
  const pp = scene.draft.trim() ? pageEstimate(parse(scene.draft)) : 0
  const empty = !scene.draft.trim()
  return (
    <div className="step">
      <div className="step-toolbar">
        <span className="meta">{empty ? 'Empty page' : `${words(scene.draft)} words · ≈ ${pp.toFixed(1)} pages`}</span>
        <span className="spacer" />
        <button className="btn ghost small" onClick={() => setHistory((h) => !h)} aria-expanded={history}>History · {scene.versions.length}</button>
        <button className="btn ghost small" onClick={onOpenInScript}>Open in screenplay</button>
        <button className={`btn small ${empty ? 'primary' : 'assist-inline'}`} onClick={() => onAssist({ kind: empty ? 'draft' : 'rewrite', autoRun: empty })}>
          ✦ {empty ? 'Draft from beats' : 'Revise'}
        </button>
      </div>
      {history && (
        <ul className="history">
          {scene.versions.length === 0 && <li className="meta">Earlier drafts and Claude’s alternatives collect here.</li>}
          {[...scene.versions].reverse().map((v) => (
            <li key={v.id}>
              <span className={`badge ${v.source}`}>{v.source === 'claude' ? 'Claude' : 'You'}</span>
              <span className="meta">{new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="note-text">{v.note}</span>
              <button className="btn ghost small" onClick={() => onRestore(v.id)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
      <div className="page mini">
        <ScreenplayEditor text={scene.draft} defaultHeading={scene.heading} onChange={(t) => onChange((s) => void (s.draft = t))} onSelectText={onSelectText} />
      </div>
      <p className="meta center"><kbd>Enter</kbd> new line · <kbd>Tab</kbd> change element · select lines and press ✦ Revise to rewrite a passage</p>
    </div>
  )
}

function ReviewStep({ scene, onChange, onAssist }: Props) {
  const [focus, setFocus] = useState(FOCI[0])
  const reviews = [...(scene.reviews ?? [])].reverse()
  return (
    <div className="step">
      <p className="step-intro">A reader’s notes on the current draft. Claude points to passages and asks questions; it doesn’t rewrite anything.</p>
      <div className="chips">
        {FOCI.map((f) => (
          <button key={f} className={focus === f ? 'chip on' : 'chip'} onClick={() => setFocus(f)}>{f}</button>
        ))}
      </div>
      <button className="btn primary self-start" disabled={!scene.draft.trim()} onClick={() => onAssist({ kind: 'review', autoRun: true, focus })}>
        ✦ Review for {focus.toLowerCase()}
      </button>
      {!scene.draft.trim() && <p className="meta">Write or draft the scene first.</p>}
      {reviews.map((r) => (
        <article key={r.id} className="review-card">
          <header>
            <strong>{r.focus}</strong>
            <span className="meta">{new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <button className="btn ghost small" onClick={() => onChange((s) => void (s.reviews = (s.reviews ?? []).filter((x) => x.id !== r.id)))}>Dismiss</button>
          </header>
          <Notes text={r.text} />
        </article>
      ))}
    </div>
  )
}
