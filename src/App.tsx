import { useEffect, useMemo, useRef, useState } from 'react'
import { HUES, StoryWheel, type Needle, type WheelHandle } from './circle/StoryWheel'
import { SceneWorkspace, firstOpenStep, type Step, STEPS } from './scene/SceneWorkspace'
import { StageCard } from './stage/StageCard'
import { ScriptView, type ScriptHandle } from './script/ScriptView'
import { AssistDock, type AssistPreset } from './ai/AssistPanel'
import { activeProvider, getApiKey, providerLabel, setApiKey, DRAFT_MODEL, REVIEW_MODEL, type AssistKind, type ProviderId, type SceneIdea } from './ai/assistant'
import { snapshot, toFountain, useProject } from './store'
import { emptyScene, uid } from './data/seed'
import { pageEstimate, parse } from './script/fountain'
import type { Scene } from './types'

type View = 'circle' | 'scene' | 'script'

export default function App() {
  const { project, update, reset } = useProject()
  const wheel = useRef<WheelHandle>(null)
  const script = useRef<ScriptHandle>(null)
  const [needle, setNeedle] = useState<Needle>({ stage: 0, sceneId: null, zoom: 1 })
  const [view, setView] = useState<View>('circle')
  const [minimized, setMinimized] = useState(false)
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('brief')
  const [scriptSceneId, setScriptSceneId] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ sceneId: string; text: string } | null>(null)
  const [assistOpen, setAssistOpen] = useState(false)
  const [preset, setPreset] = useState<AssistPreset | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [toast, setToast] = useState('')
  const wheelQuietUntil = useRef(0)

  useEffect(() => {
    activeProvider().then(setProvider)
  }, [settingsOpen])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const stageOf = (id: string | null) => (id ? project.stages.findIndex((s) => s.sceneIds.includes(id)) : -1)
  const openScene = openSceneId ? project.scenes[openSceneId] : null
  const panelUp = !minimized

  // What the assistant is looking at depends on the view.
  const assistSceneId = view === 'scene' ? openSceneId : view === 'script' ? (selection?.sceneId ?? scriptSceneId) : null
  const assistStage = stageOf(assistSceneId) >= 0 ? stageOf(assistSceneId) : needle.stage
  const assistKinds: AssistKind[] = useMemo(() => {
    if (view === 'scene' && openScene) {
      if (step === 'beats') return ['beats', 'ask']
      if (step === 'draft') return ['draft', 'rewrite', 'ask']
      if (step === 'review') return ['review', 'ask']
      return ['ask', 'beats']
    }
    if (view === 'script' && assistSceneId) return ['rewrite', 'draft', 'review', 'ask']
    return ['ideas', 'ask']
  }, [view, step, openScene, assistSceneId])
  const assistLabel =
    assistSceneId && project.scenes[assistSceneId]
      ? `${project.scenes[assistSceneId].title}${view === 'scene' ? ` · ${STEPS.find((s) => s.key === step)?.label}` : ''}`
      : `Stage ${project.stages[assistStage].number} · ${project.stages[assistStage].name}`

  const askAssist = (p: Omit<AssistPreset, 'nonce'>) => {
    setAssistOpen(true)
    setPreset({ ...p, nonce: Date.now() })
  }

  const showScene = (id: string, s?: Step) => {
    const sc = project.scenes[id]
    if (!sc) return
    setOpenSceneId(id)
    setStep(s ?? firstOpenStep(sc))
    setView('scene')
    setMinimized(false)
    setSelection(null)
  }

  const showScript = (id?: string | null) => {
    setView('script')
    setMinimized(false)
    const target = id ?? openSceneId ?? needle.sceneId
    if (target) {
      setScriptSceneId(target)
      requestAnimationFrame(() => requestAnimationFrame(() => script.current?.scrollToScene(target, false)))
    }
  }

  const onNeedle = (n: Needle) => {
    setNeedle(n)
    // Twirling the wheel while the screenplay is open scrolls the script to that scene.
    if (view === 'script' && panelUp && n.sceneId && Date.now() > wheelQuietUntil.current) {
      setScriptSceneId(n.sceneId)
      script.current?.scrollToScene(n.sceneId)
    }
  }

  const followScript = (id: string) => {
    if (id === scriptSceneId) return
    setScriptSceneId(id)
    wheelQuietUntil.current = Date.now() + 900
    wheel.current?.goToScene(id)
  }

  const onWheelOpen = (id: string) => {
    if (view === 'script' && panelUp) {
      setScriptSceneId(id)
      script.current?.scrollToScene(id)
    } else showScene(id)
  }

  const editScene = (id: string, fn: (s: Scene) => void) => update((p) => fn(p.scenes[id]))

  const addScene = (stageIndex: number, partial: Partial<Scene> = {}) => {
    const sc = emptyScene(partial)
    update((p) => {
      p.scenes[sc.id] = sc
      p.stages[stageIndex].sceneIds.push(sc.id)
    })
    return sc
  }

  const exportFountain = async () => {
    const text = toFountain(project)
    const name = `${project.title.replace(/[^\w-]+/g, '_')}.fountain`
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      /* download blocked */
    }
    try {
      await navigator.clipboard.writeText(text)
      setToast('Fountain script copied to the clipboard')
    } catch {
      setToast(`Exported ${name}`)
    }
  }

  const ordered = project.stages.flatMap((s) => s.sceneIds.map((id) => project.scenes[id]))
  const pages = ordered.reduce((a, sc) => a + (sc.draft.trim() ? pageEstimate(parse(sc.draft)) : 0), 0)
  const anyDraft = ordered.some((sc) => sc.draft.trim())

  const dockTab = (v: View, label: React.ReactNode, sub?: string) => (
    <button
      className={`dock-tab${view === v ? ' on' : ''}${view === v && minimized ? ' min' : ''}`}
      onClick={() => {
        if (view === v) setMinimized((m) => !m)
        else if (v === 'script') showScript()
        else if (v === 'scene' && openSceneId) showScene(openSceneId, step)
        else {
          setView(v)
          setMinimized(false)
        }
      }}
    >
      {label}
      {sub && <small>{sub}</small>}
    </button>
  )

  return (
    <div className={`app view-${view}${panelUp ? ' panel-up' : ''}`}>
      <div className="backdrop">
        <StoryWheel project={project} openSceneId={view === 'scene' ? openSceneId : view === 'script' ? scriptSceneId : null} onNeedle={onNeedle} onOpenScene={onWheelOpen} handle={wheel} faded={panelUp && view !== 'circle'}>
          <div className="hub-inner" style={{ ['--h' as string]: HUES[needle.stage] }}>
            <span className="hub-num">{project.stages[needle.stage].number}</span>
            <span className="hub-name">{project.stages[needle.stage].name}</span>
            <span className="hub-scene">{needle.sceneId ? project.scenes[needle.sceneId]?.title : `${project.stages[needle.stage].sceneIds.length} scenes`}</span>
            <button className="hub-assist" onClick={() => { if (needle.sceneId && view === 'circle') showScene(needle.sceneId); setAssistOpen(true) }} aria-label="Open the writing assistant">
              ✦
            </button>
          </div>
        </StoryWheel>
      </div>

      <header className="topbar glass">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="3.5" r="2.2" fill="var(--accent)" />
          </svg>
          StoryCircle
        </div>
        <input id="project-title" className="project-title" value={project.title} onChange={(e) => update((p) => void (p.title = e.target.value))} aria-label="Project title" />
        <span className="spacer" />
        <button className="pill" onClick={() => setSettingsOpen(true)} title="Claude connection">
          <span className={`status ${provider ?? ''}`} /> {provider ? providerLabel[provider] : '…'}
        </button>
      </header>

      {panelUp && view === 'circle' && (
        <StageCard
          project={project}
          stageIndex={needle.stage}
          onIdea={(t) => update((p) => void (p.stages[needle.stage].idea = t))}
          onOpenScene={(id) => { showScene(id); wheel.current?.goToScene(id) }}
          onMove={(id, dir) => update((p) => {
            const ids = p.stages[needle.stage].sceneIds
            const k = ids.indexOf(id)
            ;[ids[k], ids[k + dir]] = [ids[k + dir], ids[k]]
          })}
          onAddScene={() => { const sc = addScene(needle.stage); showScene(sc.id, 'brief'); requestAnimationFrame(() => wheel.current?.goToScene(sc.id)) }}
          onSuggest={() => askAssist({ kind: 'ideas', autoRun: true })}
          onMinimize={() => setMinimized(true)}
        />
      )}

      {panelUp && view === 'scene' && openScene && (
        <SceneWorkspace
          key={openScene.id}
          project={project}
          scene={openScene}
          stageIndex={stageOf(openScene.id)}
          step={step}
          onStep={setStep}
          onChange={(fn) => editScene(openScene.id, fn)}
          onSelectText={(t) => setSelection(t ? { sceneId: openScene.id, text: t } : null)}
          onAssist={askAssist}
          onRestore={(vid) => editScene(openScene.id, (s) => {
            const v = s.versions.find((x) => x.id === vid)
            if (!v) return
            s.versions.push(snapshot(s.draft, 'writer', 'Before restore'))
            s.draft = v.text
          })}
          onDelete={() => {
            const id = openScene.id
            update((p) => {
              for (const st of p.stages) st.sceneIds = st.sceneIds.filter((x) => x !== id)
              delete p.scenes[id]
            })
            setOpenSceneId(null)
            setView('circle')
          }}
          onOpenInScript={() => showScript(openScene.id)}
          onMinimize={() => setMinimized(true)}
          onClose={() => { setView('circle'); setMinimized(false) }}
        />
      )}

      {panelUp && view === 'script' && (
        <ScriptView
          project={project}
          handle={script}
          activeSceneId={scriptSceneId}
          onChangeDraft={(id, t) => editScene(id, (s) => void (s.draft = t))}
          onSelectText={(id, t) => setSelection(t ? { sceneId: id, text: t } : null)}
          onVisibleScene={followScript}
          onOpenScene={(id) => showScene(id)}
          onDraftScene={(id) => { setScriptSceneId(id); setSelection(null); askAssist({ kind: 'draft', autoRun: true }) }}
          onMinimize={() => setMinimized(true)}
          onClose={() => { setView('circle'); setMinimized(false) }}
          onExport={exportFountain}
        />
      )}

      <div className="dock-area">
        {assistOpen && (
          <AssistDock
            open
            onToggle={setAssistOpen}
            project={project}
            stageIndex={assistStage}
            sceneId={assistSceneId}
            selection={selection && selection.sceneId === assistSceneId ? selection.text : null}
            kinds={assistKinds}
            contextLabel={assistLabel}
            preset={preset}
            onUseDraft={(text, mode) => assistSceneId && editScene(assistSceneId, (sc) => {
              if (mode === 'replace') {
                if (sc.draft.trim()) sc.versions.push(snapshot(sc.draft, 'writer', 'Before Claude draft'))
                sc.draft = text
                sc.versions.push(snapshot(text, 'claude', 'Claude draft (accepted)'))
              } else sc.versions.push(snapshot(text, 'claude', 'Claude alternative'))
            })}
            onReplaceSelection={(sel, original, text) => {
              if (!assistSceneId) return false
              const sc = project.scenes[assistSceneId]
              const ok = sc.draft === original && sc.draft.includes(sel.trim())
              editScene(assistSceneId, (s) => {
                if (ok) {
                  s.versions.push(snapshot(s.draft, 'writer', 'Before passage rewrite'))
                  s.draft = s.draft.replace(sel.trim(), text.trim())
                } else s.versions.push(snapshot(text, 'claude', 'Passage rewrite (not applied)'))
              })
              if (ok) setSelection(null)
              return ok
            }}
            onAddIdea={(idea: SceneIdea) => {
              addScene(assistStage, { title: idea.title, heading: (idea.heading || '').toUpperCase(), purpose: idea.purpose, beats: (idea.beats || []).map((text) => ({ id: uid(), text })) })
              setToast(`Added “${idea.title}” to ${project.stages[assistStage].name}`)
            }}
            onAddBeats={(beats) => assistSceneId && editScene(assistSceneId, (s) => void s.beats.push(...beats.map((text) => ({ id: uid(), text }))))}
            onSaveReview={(focus, text) => assistSceneId && editScene(assistSceneId, (s) => void (s.reviews = [...(s.reviews ?? []), { id: uid(), at: Date.now(), focus, text }]))}
          />
        )}
        <nav className="dock glass" aria-label="Views">
          {dockTab('circle', <><span className="dock-ico ring" />Circle</>)}
          {openScene && dockTab('scene', <><span className="dock-ico" style={{ ['--h' as string]: HUES[stageOf(openScene.id)] }} />{openScene.title}</>, STEPS.find((s) => s.key === step)?.label)}
          {anyDraft && dockTab('script', <><span className="dock-ico page" />Screenplay</>, `${pages.toFixed(1)} pp`)}
          <span className="dock-sep" />
          {!assistOpen && (
            <button className="dock-assist" onClick={() => setAssistOpen(true)}>
              <span aria-hidden>✦</span> Assist
            </button>
          )}
        </nav>
      </div>

      <p className="gesture-hint" aria-hidden={panelUp && view !== 'circle'}>
        <span><kbd>scroll</kbd> twirl</span><span><kbd>pinch</kbd> zoom</span><span><kbd>drag</kbd> spin</span><span><kbd>←</kbd><kbd>→</kbd> step</span>
        {needle.zoom > 1.3 && <button className="btn ghost small" onClick={() => wheel.current?.zoomOut()}>Zoom out</button>}
      </p>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onReset={() => { reset(); setOpenSceneId(null); setView('circle'); setSettingsOpen(false) }} onExport={exportFountain} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function Settings({ onClose, onReset, onExport }: { onClose: () => void; onReset: () => void; onExport: () => void }) {
  const [key, setKey] = useState(getApiKey())
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal glass" role="dialog" aria-label="Claude connection" onClick={(e) => e.stopPropagation()}>
        <h2>Claude connection</h2>
        <p>
          Drafting and rewrites use <code>{DRAFT_MODEL}</code>; reviews use <code>{REVIEW_MODEL}</code>. Inside Claude, StoryCircle uses your Claude account. Elsewhere it needs an API key, and runs a scripted demo without one.
        </p>
        <label className="field">
          <span>Anthropic API key</span>
          <input id="api-key" type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <p className="meta">The key stays on this device. The desktop build will move it to the system keychain.</p>
        <div className="modal-actions">
          <button className="btn ghost small" onClick={onExport}>Export Fountain</button>
          {confirmReset ? (
            <>
              <span className="meta">Replace your project with the sample?</span>
              <button className="btn danger small" onClick={onReset}>Replace</button>
              <button className="btn ghost small" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn ghost small danger-text" onClick={() => setConfirmReset(true)}>Reload sample</button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { setApiKey(key.trim()); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}
