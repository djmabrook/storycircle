import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'
import { activeProvider, parseBeats, parseIdeas, providerLabel, runAssist, type AssistKind, type ProviderId, type SceneIdea } from './assistant'

export const FOCI = ['Structure and causality', 'Character', 'Dialogue and subtext', 'Continuity', 'Pacing and tension', 'Theme', 'Visual storytelling']

export const KIND_LABEL: Record<AssistKind, string> = {
  draft: 'Draft scene',
  rewrite: 'Rewrite',
  review: 'Review',
  ideas: 'Suggest scenes',
  beats: 'Suggest beats',
  ask: 'Ask',
}

export interface AssistPreset {
  kind: AssistKind
  autoRun?: boolean
  focus?: string
  nonce: number
}

interface Props {
  open: boolean
  onToggle: (open: boolean) => void
  project: Project
  stageIndex: number
  sceneId: string | null
  selection: string | null
  kinds: AssistKind[]
  contextLabel: string
  preset: AssistPreset | null
  onUseDraft: (text: string, mode: 'replace' | 'alternative') => void
  onReplaceSelection: (selection: string, original: string, text: string) => boolean
  onAddIdea: (idea: SceneIdea) => void
  onAddBeats: (beats: string[]) => void
  onSaveReview: (focus: string, text: string) => void
}

interface Result {
  kind: AssistKind
  text: string
  done: boolean
  error?: string
  selection?: string | null
  original?: string
  focus?: string
}

/** Floating assistant: a button that opens into a panel tuned to whatever you are working on. */
export function AssistDock(props: Props) {
  const { open, project, stageIndex, sceneId, selection, kinds } = props
  const scene = sceneId ? project.scenes[sceneId] : null
  const [kind, setKind] = useState<AssistKind>(kinds[0])
  const [instruction, setInstruction] = useState('')
  const [focus, setFocus] = useState(FOCI[0])
  const [result, setResult] = useState<Result | null>(null)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [notice, setNotice] = useState('')
  const [added, setAdded] = useState<Set<number>>(new Set())
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) activeProvider().then(setProvider)
  }, [open])

  useEffect(() => {
    if (!kinds.includes(kind)) setKind(kinds[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join()])

  const run = async (k: AssistKind = kind, f: string = focus) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setNotice('')
    setAdded(new Set())
    const sel = k === 'rewrite' ? selection : null
    setResult({ kind: k, text: '', done: false, selection: sel, original: scene?.draft ?? '', focus: f })
    try {
      const { text } = await runAssist(
        { kind: k, project, stageIndex, sceneId, instruction, selection: sel ?? undefined, focus: f },
        { signal: ac.signal, onText: (t) => setResult((r) => (r ? { ...r, text: t } : r)) },
      )
      setResult((r) => (r ? { ...r, text, done: true } : r))
      if (k === 'review') {
        props.onSaveReview(f, text)
        setNotice('Saved to this scene’s Review step.')
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setResult((r) => (r ? { ...r, done: true, error: (e as Error).message || 'The request failed. Check the connection in Settings.' } : r))
    }
  }

  // Inline buttons elsewhere in the app open the assistant on a specific action.
  useEffect(() => {
    const p = props.preset
    if (!p) return
    setKind(p.kind)
    if (p.focus) setFocus(p.focus)
    if (p.autoRun) run(p.kind, p.focus ?? focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.preset?.nonce])

  const stop = () => {
    abort.current?.abort()
    setResult((r) => (r ? { ...r, done: true } : r))
  }

  const busy = !!result && !result.done
  const ideas = result?.kind === 'ideas' && result.done ? parseIdeas(result.text) : []
  const beats = result?.kind === 'beats' && result.done ? parseBeats(result.text) : []

  if (!open)
    return (
      <button className={`assist-orb${busy ? ' busy' : ''}`} onClick={() => props.onToggle(true)} aria-label="Open the writing assistant">
        <span className="orb-spark" aria-hidden>✦</span>
        <span className="orb-label">{busy ? 'Writing…' : 'Assist'}</span>
      </button>
    )

  return (
    <section className="assist glass" aria-label="Writing assistant">
      <header className="assist-head">
        <span className="orb-spark small" aria-hidden>✦</span>
        <div className="assist-title">
          <strong>Assist</strong>
          <span>{props.contextLabel}</span>
        </div>
        <button className="icon-btn" onClick={() => props.onToggle(false)} aria-label="Minimise assistant" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="seg" role="tablist">
        {kinds.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'rewrite' && selection ? 'Rewrite selection' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === 'review' && (
        <div className="chips">
          {FOCI.map((f) => (
            <button key={f} className={focus === f ? 'chip on' : 'chip'} onClick={() => setFocus(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      {kind === 'rewrite' && (
        <p className="assist-hint">{selection ? <q>{selection.slice(0, 140)}{selection.length > 140 ? '…' : ''}</q> : 'Select lines in the draft to rewrite just that passage, or rewrite the whole scene.'}</p>
      )}

      <div className="assist-compose">
        <textarea
          id="assist-instruction"
          rows={2}
          value={instruction}
          placeholder={
            kind === 'draft' ? 'Direction (optional): “Mara panics rather than gloats”'
            : kind === 'rewrite' ? 'What should change? “Make Leila funnier”'
            : kind === 'review' ? 'A question for the reader (optional)'
            : kind === 'ask' ? 'Ask anything about this story…'
            : 'Direction (optional)'
          }
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) run()
          }}
        />
        {busy ? (
          <button className="btn secondary" onClick={stop}>Stop</button>
        ) : (
          <button className="btn primary" onClick={() => run()} disabled={kind === 'ask' && !instruction.trim()}>
            {kind === 'rewrite' && selection ? 'Rewrite' : KIND_LABEL[kind]}
          </button>
        )}
      </div>
      <div className="assist-meta">
        <span className={`status ${provider ?? ''}`} /> {provider ? providerLabel[provider] : 'Connecting…'}
        <span className="kbd-hint"><kbd>⌘</kbd><kbd>↵</kbd> to run</span>
      </div>

      {result && (
        <div className="assist-out" aria-live="polite">
          {result.error ? (
            <p className="error">{result.error}</p>
          ) : result.kind === 'review' || result.kind === 'ask' ? (
            <Notes text={result.text || 'Reading…'} />
          ) : result.kind === 'ideas' && result.done ? (
            <ul className="suggest-list">
              {ideas.map((idea, i) => (
                <li key={i}>
                  <div>
                    <strong>{idea.title}</strong>
                    <span className="slug">{idea.heading}</span>
                    <p>{idea.purpose}</p>
                  </div>
                  <button className="btn secondary small" disabled={added.has(i)} onClick={() => { props.onAddIdea(idea); setAdded(new Set(added).add(i)) }}>
                    {added.has(i) ? 'Added' : 'Add'}
                  </button>
                </li>
              ))}
              {ideas.length === 0 && <p className="error">Claude’s answer could not be read as scene ideas. Try again.</p>}
            </ul>
          ) : result.kind === 'beats' && result.done ? (
            <>
              <ul className="suggest-list">
                {beats.map((b, i) => (
                  <li key={i}>
                    <p>{b}</p>
                    <button className="btn secondary small" disabled={added.has(i)} onClick={() => { props.onAddBeats([b]); setAdded(new Set(added).add(i)) }}>
                      {added.has(i) ? 'Added' : 'Add'}
                    </button>
                  </li>
                ))}
              </ul>
              {beats.length > 0 && (
                <button className="btn secondary" onClick={() => { props.onAddBeats(beats.filter((_, i) => !added.has(i))); setAdded(new Set(beats.map((_, i) => i))) }}>
                  Add all to the beat board
                </button>
              )}
            </>
          ) : (
            <pre className="proposal">{result.text || (result.kind === 'ideas' || result.kind === 'beats' ? 'Thinking…' : 'Writing…')}</pre>
          )}

          {result.done && !result.error && (result.kind === 'draft' || result.kind === 'rewrite') && (
            <div className="assist-actions">
              {result.kind === 'rewrite' && result.selection ? (
                <button
                  className="btn primary"
                  onClick={() => {
                    const ok = props.onReplaceSelection(result.selection!, result.original ?? '', result.text)
                    setNotice(ok ? 'Passage replaced. The earlier draft is in History.' : 'The draft changed while Claude was writing, so this was saved to History as an alternative.')
                  }}
                >
                  Replace passage
                </button>
              ) : (
                <button className="btn primary" onClick={() => { props.onUseDraft(result.text, 'replace'); setNotice('This is now the draft. Your earlier version is in History.') }}>
                  Use as draft
                </button>
              )}
              <button className="btn secondary" onClick={() => { props.onUseDraft(result.text, 'alternative'); setNotice('Saved to History as an alternative.') }}>
                Keep as alternative
              </button>
              <button className="btn ghost" onClick={() => setResult(null)}>Discard</button>
            </div>
          )}
          {notice && <p className="notice">{notice}</p>}
        </div>
      )}
    </section>
  )
}

export function Notes({ text }: { text: string }) {
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
