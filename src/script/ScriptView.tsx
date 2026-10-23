import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { Project } from '../types'
import { ScreenplayEditor } from './ScreenplayEditor'
import { pageEstimate, parse } from './fountain'
import { HUES } from '../circle/StoryWheel'

export interface ScriptHandle {
  scrollToScene: (id: string, smooth?: boolean) => void
}

interface Props {
  project: Project
  activeSceneId: string | null
  handle?: Ref<ScriptHandle>
  onChangeDraft: (sceneId: string, text: string) => void
  onSelectText: (sceneId: string, text: string | null) => void
  onVisibleScene: (id: string) => void
  onOpenScene: (id: string) => void
  onDraftScene: (id: string) => void
  onMinimize: () => void
  onClose: () => void
  onExport: () => void
}

/** The whole screenplay in circle order, formatted and editable, kept in step with the wheel. */
export function ScriptView(props: Props) {
  const { project } = props
  const scroller = useRef<HTMLDivElement>(null)
  const blocks = useRef(new Map<string, HTMLElement>())
  const [writing, setWriting] = useState<Set<string>>(new Set())
  const suppress = useRef(0)

  useImperativeHandle(props.handle, () => ({
    scrollToScene: (id, smooth = true) => {
      const el = blocks.current.get(id)
      const sc = scroller.current
      if (!el || !sc) return
      suppress.current = Date.now() + 900
      sc.scrollTo({ top: el.offsetTop - 24, behavior: smooth ? 'smooth' : 'auto' })
    },
  }))

  // The scene crossing the upper third of the page is the one the wheel follows.
  useEffect(() => {
    const sc = scroller.current
    if (!sc) return
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppress.current) return
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = hit?.target.getAttribute('data-scene')
        if (id) props.onVisibleScene(id)
      },
      { root: sc, rootMargin: '-30% 0px -60% 0px' },
    )
    blocks.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.stages.map((s) => s.sceneIds.join()).join('|')])

  const ordered = project.stages.flatMap((st, si) => st.sceneIds.map((id) => ({ st, si, sc: project.scenes[id] })))
  const totalPages = ordered.reduce((a, x) => a + (x.sc.draft.trim() ? pageEstimate(parse(x.sc.draft)) : 0), 0)
  const drafted = ordered.filter((x) => x.sc.draft.trim()).length
  let sceneNo = 0

  return (
    <section className="panel script-panel glass" aria-label="Screenplay">
      <header className="panel-head">
        <div className="panel-title">
          <strong>Screenplay</strong>
          <span className="meta">≈ {Math.max(0, totalPages).toFixed(1)} pages · {drafted} of {ordered.length} scenes drafted</span>
        </div>
        <span className="spacer" />
        <button className="btn ghost small" onClick={props.onExport}>Export Fountain</button>
        <button className="icon-btn" onClick={props.onMinimize} aria-label="Minimise screenplay" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close screenplay" title="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="script-scroll" ref={scroller}>
        <div className="page full">
          <div className="title-page">
            <h1>{project.title.toUpperCase()}</h1>
            <p>Written with StoryCircle</p>
            <p className="logline">{project.logline}</p>
          </div>
          {ordered.map(({ st, si, sc }, i) => {
            sceneNo++
            const firstOfStage = i === 0 || ordered[i - 1].st.key !== st.key
            const isWriting = writing.has(sc.id) || !!sc.draft.trim()
            return (
              <div
                key={sc.id}
                data-scene={sc.id}
                ref={(n) => { if (n) blocks.current.set(sc.id, n); else blocks.current.delete(sc.id) }}
                className={`script-scene${props.activeSceneId === sc.id ? ' active' : ''}`}
                style={{ ['--h' as string]: HUES[si] }}
              >
                {firstOfStage && (
                  <div className="stage-mark" aria-hidden>
                    <span>{st.number}</span> {st.name}
                  </div>
                )}
                <span className="scene-no left">{sceneNo}</span>
                <span className="scene-no right">{sceneNo}</span>
                <button className="scene-tag" onClick={() => props.onOpenScene(sc.id)} title="Open this scene’s brief and beats">
                  {sc.title} ↗
                </button>
                {isWriting ? (
                  <ScreenplayEditor
                    text={sc.draft}
                    defaultHeading={sc.heading}
                    autoFocus={writing.has(sc.id) && !sc.draft.trim()}
                    onChange={(t) => props.onChangeDraft(sc.id, t)}
                    onSelectText={(t) => props.onSelectText(sc.id, t)}
                    onFocusEditor={() => props.onVisibleScene(sc.id)}
                  />
                ) : (
                  <div className="undrafted">
                    <div className="sp-row t-heading"><div className="sp-text static">{sc.heading || sc.title.toUpperCase()}</div></div>
                    <p className="undrafted-note">{sc.purpose || 'Not drafted yet.'}</p>
                    <div className="undrafted-actions">
                      <button className="btn secondary small" onClick={() => setWriting(new Set(writing).add(sc.id))}>Start writing</button>
                      <button className="btn assist-inline small" onClick={() => props.onDraftScene(sc.id)}>✦ Draft from beats</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <p className="the-end">THE END</p>
        </div>
      </div>
    </section>
  )
}
