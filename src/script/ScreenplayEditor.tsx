import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CYCLE, LABEL, NEXT, elId, parse, serialize, type El, type ElementType } from './fountain'

interface Props {
  text: string
  defaultHeading?: string
  onChange: (text: string) => void
  onSelectText?: (text: string | null) => void
  onFocusEditor?: () => void
  autoFocus?: boolean
}

function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const r = sel.getRangeAt(0)
  if (!el.contains(r.endContainer)) return 0
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

function setCaret(el: HTMLElement, offset: number) {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const node = el.firstChild
  const r = document.createRange()
  if (node && node.nodeType === Node.TEXT_NODE) r.setStart(node, Math.min(offset, node.textContent?.length ?? 0))
  else r.setStart(el, 0)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

const starter = (heading?: string): El[] => [
  { id: elId(), type: 'heading', text: heading ?? '' },
  { id: elId(), type: 'action', text: '' },
]

/**
 * Formatted, editable screenplay. Each element is its own editable line with
 * screenplay margins; the scene's Fountain text is the source of truth.
 */
export function ScreenplayEditor({ text, defaultHeading, onChange, onSelectText, onFocusEditor, autoFocus }: Props) {
  const [els, setEls] = useState<El[]>(() => (text.trim() ? parse(text) : starter(defaultHeading)))
  const lastEmitted = useRef(text)
  const refs = useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = useRef<{ id: string; offset: number } | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // External changes (an accepted Claude draft, a restored version) re-parse the page.
  useEffect(() => {
    if (text !== lastEmitted.current) {
      lastEmitted.current = text
      setEls(text.trim() ? parse(text) : starter(defaultHeading))
    }
  }, [text, defaultHeading])

  useLayoutEffect(() => {
    const p = pendingFocus.current
    if (!p) return
    pendingFocus.current = null
    const node = refs.current.get(p.id)
    if (node) setCaret(node, p.offset)
  })

  useEffect(() => {
    if (autoFocus && els[0]) {
      const node = refs.current.get(els[els.length - 1].id)
      if (node) setCaret(node, node.textContent?.length ?? 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = (next: El[]) => {
    setEls(next)
    const s = serialize(next)
    lastEmitted.current = s
    onChange(s)
  }

  const update = (id: string, patch: Partial<El>) => commit(els.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const onInput = (e: El, node: HTMLDivElement) => {
    let t = node.textContent ?? ''
    let type = e.type
    // Typing a slugline into an action line promotes it to a scene heading.
    if (type === 'action' && /^(INT|EXT|EST|I\/E)[. ]/i.test(t) && !t.includes('\n')) type = 'heading'
    if (type === 'parenthetical') t = t.replace(/^\(|\)$/g, '')
    update(e.id, { text: t, type })
  }

  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>, e: El, i: number) => {
    const node = ev.currentTarget
    const text = node.textContent ?? ''
    const at = caretOffset(node)
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      if (!text.trim() && (e.type === 'dialogue' || e.type === 'character')) {
        update(e.id, { type: 'action' })
        pendingFocus.current = { id: e.id, offset: 0 }
        return
      }
      const nu: El = { id: elId(), type: NEXT[e.type], text: text.slice(at) }
      const next = [...els]
      next[i] = { ...e, text: text.slice(0, at) }
      next.splice(i + 1, 0, nu)
      pendingFocus.current = { id: nu.id, offset: 0 }
      commit(next)
    } else if (ev.key === 'Tab') {
      ev.preventDefault()
      const k = CYCLE.indexOf(e.type)
      const type = CYCLE[(k + (ev.shiftKey ? CYCLE.length - 1 : 1)) % CYCLE.length]
      pendingFocus.current = { id: e.id, offset: at }
      update(e.id, { type })
    } else if (ev.key === 'Backspace' && at === 0 && window.getSelection()?.isCollapsed && i > 0) {
      ev.preventDefault()
      const prev = els[i - 1]
      const next = els.filter((x) => x.id !== e.id)
      const pi = next.findIndex((x) => x.id === prev.id)
      next[pi] = { ...prev, text: prev.text + text }
      pendingFocus.current = { id: prev.id, offset: prev.text.length }
      commit(next)
    } else if (ev.key === 'ArrowUp' && at === 0 && i > 0) {
      ev.preventDefault()
      const p = els[i - 1]
      pendingFocus.current = { id: p.id, offset: p.text.length }
      setFocusedId(p.id)
    } else if (ev.key === 'ArrowDown' && at === text.length && i < els.length - 1) {
      ev.preventDefault()
      pendingFocus.current = { id: els[i + 1].id, offset: 0 }
      setFocusedId(els[i + 1].id)
    }
  }

  const reportSelection = () => {
    if (!onSelectText) return
    const s = window.getSelection()?.toString() ?? ''
    onSelectText(s.trim() ? s : null)
  }

  return (
    <div className="screenplay" onMouseUp={reportSelection} onKeyUp={reportSelection}>
      {els.map((e, i) => (
        <div key={e.id} className={`sp-row t-${e.type}${focusedId === e.id ? ' focused' : ''}`}>
          {focusedId === e.id && (
            <button
              className="sp-type"
              tabIndex={-1}
              onMouseDown={(ev) => {
                ev.preventDefault()
                const k = CYCLE.indexOf(e.type)
                pendingFocus.current = { id: e.id, offset: e.text.length }
                update(e.id, { type: CYCLE[(k + 1) % CYCLE.length] as ElementType })
              }}
              title="Change element type (Tab)"
            >
              {LABEL[e.type]}
            </button>
          )}
          <Editable
            el={e}
            setRef={(n) => (n ? refs.current.set(e.id, n) : refs.current.delete(e.id))}
            placeholder={i === 0 && e.type === 'heading' ? 'INT. LOCATION - DAY' : e.type === 'action' && els.length <= 2 ? 'Action. Enter for a new line, Tab to change its type.' : ''}
            onInput={(n) => onInput(e, n)}
            onKeyDown={(ev) => onKeyDown(ev, e, i)}
            onFocus={() => {
              setFocusedId(e.id)
              onFocusEditor?.()
            }}
            onBlur={() => setFocusedId((f) => (f === e.id ? null : f))}
          />
        </div>
      ))}
    </div>
  )
}

interface EditableProps {
  el: El
  placeholder: string
  setRef: (n: HTMLDivElement | null) => void
  onInput: (n: HTMLDivElement) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onFocus: () => void
  onBlur: () => void
}

/** Uncontrolled contentEditable that only rewrites its DOM when the model differs, so the caret survives typing. */
function Editable({ el, placeholder, setRef, onInput, onKeyDown, onFocus, onBlur }: EditableProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== el.text) ref.current.textContent = el.text
  }, [el.text])
  return (
    <div
      ref={(n) => {
        ref.current = n
        setRef(n)
      }}
      className="sp-text"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={LABEL[el.type]}
      data-placeholder={placeholder}
      onInput={(e) => onInput(e.currentTarget)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}
