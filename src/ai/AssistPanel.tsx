import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'
import { activeProvider, parseIdeas, providerLabel, runAssist, type AssistKind, type ProviderId, type SceneIdea } from './assistant'

const FOCI = ['Structure and causality', 'Character', 'Dialogue and subtext', 'Continuity', 'Pacing and tension', 'Theme', 'Visual storytelling']

export interface Selection {
  start: number
  end: number
  text: string
}

interface Props {
  project: Project
  stageIndex: number
  sceneId: string | null
  selection: Selection | null
  initialKind?: AssistKind
  onClose: () => void
  onUseDraft: (text: string, mode: 'replace' | 'alternative') => void
  onReplaceSelection: (sel: Selection, original: string, text: string) => boolean
  onAddIdea: (idea: SceneIdea) => void
}

interface Result {
  kind: AssistKind
  text: string
  done: boolean
  error?: string
  provider?: ProviderId
  selection?: Selection | null
  original?: string
}

export function AssistPanel(props: Props) {
  const { project, stageIndex, sceneId, selection } = props
  const scene = sceneId ? project.scenes[sceneId] : null
  const kinds: { kind: AssistKind; label: string; hint: string }[] = scene
    ? [
        { kind: 'draft', label: 'Draft scene', hint: 'Turn the brief and beats into pages' },
        { kind: 'rewrite', label: selection ? 'Rewrite selection' : 'Rewrite scene', hint: 'Revise with your direction' },
        { kind: 'review', label: 'Review', hint: 'Focused notes, no rewriting' },
        { kind: 'ask', label: 'Ask', hint: 'Talk through a story question' },
      ]
    : [
        { kind: 'ideas', label: 'Suggest scenes', hint: 'Three scene ideas for this stage' },
        { kind: 'ask', label: 'Ask', hint: 'Talk through a story question' },
      ]
  const [kind, setKind] = useState<AssistKind>(props.initialKind && kinds.some((k) => k.kind === props.initialKind) ? props.initialKind : kinds[0].kind)
  const [instruction, setInstruction] = useState('')
  const [focus, setFocus] = useState(FOCI[0])
  const [result, setResult] = useState<Result | null>(null)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [notice, setNotice] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    activeProvider().then(setProvider)
    return () => abort.current?.abort()
  }, [])

  useEffect(() => {
    if (!kinds.some((k) => k.kind === kind)) setKind(kinds[0].kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  const run = async () => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setNotice('')
    const sel = kind === 'rewrite' ? selection : null
    const original = scene?.draft ?? ''
    setResult({ kind, text: '', done: false, selection: sel, original })
    try {
      const { text, provider } = await runAssist(
        { kind, project, stageIndex, sceneId, instruction, selection: sel?.text, focus },
        { signal: ac.signal, onText: (t) => setResult((r) => (r ? { ...r, text: t } : r)) },
      )
      setResult((r) => (r ? { ...r, text, done: true, provider } : r))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setResult((r) => (r ? { ...r, done: true, error: (e as Error).message || 'The request failed.' } : r))
    }
  }

  const stop = () => {
    abort.current?.abort()
    setResult((r) => (r ? { ...r, done: true } : r))
  }

  const ideas = result?.kind === 'ideas' && result.done ? parseIdeas(result.text) : []

  return (
    <section className="assist" aria-label="AI assistant">
      <header className="assist-head">
        <div>
          <span className="spark" aria-hidden>✦</span> <strong>Assist</strong>
          <span className="assist-ctx">
            {scene ? scene.title : `Stage ${project.stages[stageIndex].number} · ${project.stages[stageIndex].name}`}
          </span>
        </div>
        <button className="ghost" onClick={props.onClose} aria-label="Close assistant">
          ✕
        </button>
      </header>

      <div className="assist-kinds" role="tablist">
        {kinds.map((k) => (
          <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'chip on' : 'chip'} onClick={() => setKind(k.kind)} title={k.hint}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'review' && (
        <div className="assist-foci">
          {FOCI.map((f) => (
            <button key={f} className={focus === f ? 'chip small on' : 'chip small'} onClick={() => setFocus(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      {kind === 'rewrite' && selection && <blockquote className="sel-preview">{selection.text.slice(0, 220)}{selection.text.length > 220 ? '…' : ''}</blockquote>}

      <textarea
        id="assist-instruction"
        className="assist-input"
        rows={2}
        value={instruction}
        placeholder={
          kind === 'draft'
            ? 'Optional direction: "Mara panics rather than gloats", "under two pages"…'
            : kind === 'rewrite'
              ? 'What should change? "Make Leila funnier", "cut the exposition"…'
              : kind === 'review'
                ? 'Optional question for the reader'
                : kind === 'ideas'
                  ? 'Optional direction for the ideas'
                  : 'Ask about this story…'
        }
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run()
        }}
      />
      <div className="assist-row">
        <span className="provider" title="Which Claude connection answers">
          {provider ? providerLabel[provider] : '…'}
        </span>
        {result && !result.done ? (
          <button className="secondary" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="primary" onClick={run} disabled={kind === 'ask' && !instruction.trim()}>
            {kinds.find((k) => k.kind === kind)?.label} <kbd>⌘↵</kbd>
          </button>
        )}
      </div>

      {result && (
        <div className="assist-out" aria-live="polite">
          {result.error ? (
            <p className="error">{result.error}</p>
          ) : result.kind === 'review' || result.kind === 'ask' ? (
            <Notes text={result.text || 'Reading…'} />
          ) : result.kind === 'ideas' && result.done && ideas.length ? (
            <ul className="ideas">
              {ideas.map((idea, i) => (
                <li key={i}>
                  <div>
                    <strong>{idea.title}</strong>
                    <span className="mono">{idea.heading}</span>
                    <p>{idea.purpose}</p>
                  </div>
                  <button className="secondary" onClick={() => props.onAddIdea(idea)}>
                    Add scene
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <pre className="script proposal">{result.text || 'Writing…'}</pre>
          )}

          {result.done && !result.error && (result.kind === 'draft' || result.kind === 'rewrite') && (
            <div className="assist-actions">
              {result.kind === 'rewrite' && result.selection ? (
                <button
                  className="primary"
                  onClick={() => {
                    const ok = props.onReplaceSelection(result.selection!, result.original ?? '', result.text)
                    setNotice(ok ? 'Passage replaced. The previous draft is saved in History.' : 'The draft changed while Claude was writing, so the passage was added as an alternative in History instead.')
                  }}
                >
                  Replace passage
                </button>
              ) : (
                <button className="primary" onClick={() => { props.onUseDraft(result.text, 'replace'); setNotice('Now the current draft. Your previous version is in History.') }}>
                  Use as draft
                </button>
              )}
              <button className="secondary" onClick={() => { props.onUseDraft(result.text, 'alternative'); setNotice('Saved to History as an alternative.') }}>
                Keep as alternative
              </button>
              <button className="ghost" onClick={() => setResult(null)}>
                Discard
              </button>
            </div>
          )}
          {notice && <p className="notice">{notice}</p>}
        </div>
      )}
    </section>
  )
}

function Notes({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="notes">
      {blocks.map((b, i) => (
        <div key={i} className="note">
          {b.split('\n').map((line, j) => {
            if (line.startsWith('>')) return <blockquote key={j}>{line.replace(/^>\s?/, '')}</blockquote>
            const bold = line.match(/^\*\*(.+)\*\*$/)
            if (bold) return <strong key={j}>{bold[1]}</strong>
            return <p key={j}>{line.replace(/\*\*/g, '')}</p>
          })}
        </div>
      ))}
    </div>
  )
}
