import { useEffect, useRef, useState } from 'react'
import type { LibraryEntry } from './store'

interface Props {
  title: string
  projects: LibraryEntry[]
  currentId: string
  onRename: (title: string) => void
  onNewBlank: () => void
  onNewSample: () => void
  onOpenFile: () => void
  onSave: () => void
  onExportFountain: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/** The project switcher: the title in the top bar opens New, Open, Save and recent projects. */
export function ProjectMenu(p: Props) {
  const [open, setOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const act = (fn: () => void) => () => {
    setOpen(false)
    setConfirmId(null)
    fn()
  }

  return (
    <div className="project-menu" ref={ref}>
      <input id="project-title" className="project-title" value={p.title} onChange={(e) => p.onRename(e.target.value)} aria-label="Project title" />
      <button className={`menu-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Projects menu" title="New, open and save projects">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="menu glass" role="menu">
          <button role="menuitem" onClick={act(p.onNewBlank)}>
            <span>New project</span><small>Empty circle</small>
          </button>
          <button role="menuitem" onClick={act(p.onNewSample)}>
            <span>New from sample</span><small>The Last Broadcast</small>
          </button>
          <div className="menu-sep" />
          <button role="menuitem" onClick={act(p.onOpenFile)}>
            <span>Open file…</span><kbd>{mod}O</kbd>
          </button>
          <button role="menuitem" onClick={act(p.onSave)}>
            <span>Save to file…</span><kbd>{mod}S</kbd>
          </button>
          <button role="menuitem" onClick={act(p.onExportFountain)}>
            <span>Export Fountain…</span><small>.fountain</small>
          </button>
          <div className="menu-sep" />
          <div className="menu-label">Projects on this device</div>
          <ul className="recent">
            {p.projects.map((e) => (
              <li key={e.id} className={e.id === p.currentId ? 'current' : ''}>
                <button role="menuitem" className="recent-open" onClick={act(() => p.onOpen(e.id))} disabled={e.id === p.currentId}>
                  <span>{e.title || 'Untitled'}</span>
                  <small>{e.id === p.currentId ? 'Open now' : ago(e.updatedAt)}</small>
                </button>
                {e.id !== p.currentId &&
                  (confirmId === e.id ? (
                    <span className="recent-confirm">
                      <button className="btn danger small" onClick={() => { p.onDelete(e.id); setConfirmId(null) }}>Delete</button>
                      <button className="btn ghost small" onClick={() => setConfirmId(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="icon-btn" aria-label={`Delete ${e.title}`} title="Delete from this device" onClick={() => setConfirmId(e.id)}>
                      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </button>
                  ))}
              </li>
            ))}
          </ul>
          <p className="menu-foot">Projects autosave here as you work. Save to file for a copy you can keep, back up or move to another computer.</p>
        </div>
      )}
    </div>
  )
}
