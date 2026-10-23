import { useRef, useState } from 'react'
import type { Project, Scene, StageKey } from '../types'
import { uid } from '../data/seed'
import type { Selection } from '../ai/AssistPanel'

interface Props {
  project: Project
  scene: Scene
  stageIndex: number
  onChange: (fn: (s: Scene) => void) => void
  onSelection: (sel: Selection | null) => void
  onAssist: () => void
  onRestore: (versionId: string) => void
  onDelete: () => void
  onClose: () => void
}

export function SceneEditor({ project, scene, stageIndex, onChange, onSelection, onAssist, onRestore, onDelete, onClose }: Props) {
  const stage = project.stages[stageIndex]
  const [beatText, setBeatText] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  const trackSelection = () => {
    const el = draftRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    onSelection(end > start ? { start, end, text: el.value.slice(start, end) } : null)
  }

  const field = (key: 'purpose' | 'attempt' | 'resistance' | 'turn', label: string, placeholder: string) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        id={`scene-${key}`}
        rows={1}
        value={scene[key]}
        placeholder={placeholder}
        onChange={(e) => onChange((s) => void (s[key] = e.target.value))}
      />
    </label>
  )

  const toggleServes = (k: StageKey) =>
    onChange((s) => {
      s.alsoServes = s.alsoServes.includes(k) ? s.alsoServes.filter((x) => x !== k) : [...s.alsoServes, k]
    })

  return (
    <article className="editor">
      <header className="editor-head">
        <button className="ghost back" onClick={onClose} aria-label="Back to stage">
          ← {stage.number}. {stage.name}
        </button>
        <button className="assist-btn" onClick={onAssist}>
          <span aria-hidden>✦</span> Assist
        </button>
      </header>

      <input id="scene-title" className="title-input" value={scene.title} onChange={(e) => onChange((s) => void (s.title = e.target.value))} aria-label="Scene title" />
      <input
        id="scene-heading"
        className="heading-input mono"
        value={scene.heading}
        placeholder="INT. LOCATION - TIME"
        onChange={(e) => onChange((s) => void (s.heading = e.target.value.toUpperCase()))}
        aria-label="Scene heading"
      />

      <details className="brief" open>
        <summary>Scene brief</summary>
        {field('purpose', 'Contributes', 'What does this scene do for the story?')}
        {field('attempt', 'Attempt', 'Who wants what here?')}
        {field('resistance', 'Resistance', 'What gets in the way?')}
        {field('turn', 'Turn', 'What is different by the end?')}
        <div className="serves">
          <span>Also serves</span>
          {project.stages
            .filter((s) => s.key !== stage.key)
            .map((s) => (
              <button key={s.key} className={scene.alsoServes.includes(s.key) ? 'chip small on' : 'chip small'} onClick={() => toggleServes(s.key)}>
                {s.number} {s.name}
              </button>
            ))}
        </div>
      </details>

      <details className="beats" open>
        <summary>Beat slices <span className="count">{scene.beats.length}</span></summary>
        <ul>
          {scene.beats.map((b) => (
            <li key={b.id}>
              <input
                id={`beat-${b.id}`}
                value={b.text}
                onChange={(e) => onChange((s) => void (s.beats.find((x) => x.id === b.id)!.text = e.target.value))}
                aria-label="Beat"
              />
              <button className="ghost" aria-label="Remove beat" onClick={() => onChange((s) => void (s.beats = s.beats.filter((x) => x.id !== b.id)))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form
          className="beat-add"
          onSubmit={(e) => {
            e.preventDefault()
            const t = beatText.trim()
            if (!t) return
            onChange((s) => void s.beats.push({ id: uid(), text: t }))
            setBeatText('')
          }}
        >
          <input id="beat-new" value={beatText} placeholder="Add an action, line, image or fact…" onChange={(e) => setBeatText(e.target.value)} />
          <button className="secondary" type="submit">Add</button>
        </form>
      </details>

      <div className="draft-head">
        <h3>Draft</h3>
        <span className="muted">{scene.draft ? `${scene.draft.split(/\s+/).filter(Boolean).length} words · ≈${Math.max(0.1, scene.draft.split('\n').length / 55).toFixed(1)} pp` : 'Empty'}</span>
        <button className="ghost" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          History ({scene.versions.length})
        </button>
      </div>
      {showHistory && (
        <ul className="history">
          {scene.versions.length === 0 && <li className="muted">Earlier drafts and Claude alternatives appear here.</li>}
          {[...scene.versions].reverse().map((v) => (
            <li key={v.id}>
              <span className={`badge ${v.source}`}>{v.source === 'claude' ? 'Claude' : 'You'}</span>
              <span className="muted">{new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="note-text">{v.note}</span>
              <button className="ghost" onClick={() => onRestore(v.id)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        id="scene-draft"
        ref={draftRef}
        className="script draft"
        value={scene.draft}
        placeholder={`${scene.heading || 'INT. LOCATION - TIME'}\n\nWrite here, or press Assist to draft from the brief and beats.`}
        spellCheck
        onChange={(e) => onChange((s) => void (s.draft = e.target.value))}
        onSelect={trackSelection}
        onKeyUp={trackSelection}
        onMouseUp={trackSelection}
      />

      <footer className="editor-foot">
        {confirmDelete ? (
          <>
            <span>Delete this scene and its history?</span>
            <button className="danger" onClick={onDelete}>Delete</button>
            <button className="ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button className="ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete scene</button>
        )}
      </footer>
    </article>
  )
}
