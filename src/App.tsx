import { useEffect, useMemo, useRef, useState } from 'react'
import { HUES, StoryWheel, type Needle, type WheelHandle } from './circle/StoryWheel'
import { SceneWorkspace, firstOpenStep, type Step, STEPS } from './scene/SceneWorkspace'
import { StageCard } from './stage/StageCard'
import { ScriptView, type ScriptHandle } from './script/ScriptView'
import { AssistDock, type AssistPreset } from './ai/AssistPanel'
import { activeProvider, claudeCodePath, getApiKey, getUseClaudeCode, providerLabel, setApiKey, setUseClaudeCode, DRAFT_MODEL, REVIEW_MODEL, type AssistKind, type ProviderId, type SceneIdea } from './ai/assistant'
import { snapshot, toFountain, useProject } from './store'
import { blankProject, emptyScene, seedProject, uid } from './data/seed'
import { ProjectMenu } from './ProjectMenu'
import { pickTextFile, projectFromFile, projectToFile, safeName, saveTextFile, PROJECT_EXT } from './files'
import { pageEstimate, parse } from './script/fountain'
import type { Scene } from './types'
import { fmt, fmtMinutes, hourRange, timeline } from './clock'

type View = 'circle' | 'scene' | 'script'

export default function App() {
  const { project, update, projects, currentId, addProject, openProject, deleteProject } = useProject()
  const wheel = useRef<WheelHandle>(null)
  const script = useRef<ScriptHandle>(null)
  const [needle, setNeedle] = useState<Needle>({ stage: 0, sceneId: null, zoom: 1 })
  const [view, setView] = useState<View>('circle')
  const [minimized, setMinimized] = useState(false)
  const [full, setFull] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const t = localStorage.getItem('storyclock.theme')
      if (t === 'light' || t === 'dark') return t
    } catch {
      /* ignore */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('storyclock.theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
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
      : `Hour ${project.stages[assistStage].name}`

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
    setFull(false)
    setSelection(null)
  }

  const showScript = (id?: string | null) => {
    setView('script')
    setMinimized(false)
    setFull(false)
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

  /** Move a scene to position `index` of hour `stage`; the screenplay and timings follow clock order. */
  const moveScene = (id: string, stage: number, index: number) => {
    const from = stageOf(id)
    if (from < 0) return
    const k = project.stages[from].sceneIds.indexOf(id)
    const at = from === stage && k < index ? index - 1 : index
    if (from === stage && at === k) return
    update((p) => {
      p.stages[from].sceneIds.splice(k, 1)
      p.stages[stage].sceneIds.splice(Math.min(at, p.stages[stage].sceneIds.length), 0, id)
    })
    setToast(from === stage ? `Reordered “${project.scenes[id].title}”` : `Moved “${project.scenes[id].title}” to ${project.stages[stage].name}`)
  }

  const exportFountain = async () => {
    try {
      if (await saveTextFile(`${safeName(project.title)}.fountain`, toFountain(project), 'fountain')) setToast('Fountain script saved')
    } catch (e) {
      setToast(`Couldn’t export: ${(e as Error).message}`)
    }
  }

  const saveProject = async () => {
    try {
      if (await saveTextFile(`${safeName(project.title)}.${PROJECT_EXT}`, projectToFile(project), PROJECT_EXT)) setToast(`Saved “${project.title}”`)
    } catch (e) {
      setToast(`Couldn’t save: ${(e as Error).message}`)
    }
  }

  const openFile = async () => {
    try {
      const f = await pickTextFile()
      if (!f) return
      const p = projectFromFile(f.name, f.text)
      addProject(p)
      setToast(`Opened “${p.title}”`)
    } catch (e) {
      setToast((e as Error).message)
    }
  }

  // Reset the views whenever a different project is opened.
  useEffect(() => {
    setView('circle')
    setMinimized(false)
    setFull(false)
    setOpenSceneId(null)
    setScriptSceneId(null)
    setSelection(null)
    wheel.current?.zoomOut()
  }, [currentId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's') {
        e.preventDefault()
        saveProject()
      } else if (e.key === 'o') {
        e.preventDefault()
        openFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ordered = project.stages.flatMap((s) => s.sceneIds.map((id) => project.scenes[id]))
  const pages = ordered.reduce((a, sc) => a + (sc.draft.trim() ? pageEstimate(parse(sc.draft)) : 0), 0)
  const anyDraft = ordered.some((sc) => sc.draft.trim())
  const est = timeline(project)

  const dockTab = (v: View, label: React.ReactNode, sub?: string) => (
    <button
      className={`dock-tab${view === v ? ' on' : ''}${view === v && minimized ? ' min' : ''}${view === v && full ? ' full' : ''}`}
      title={view === v ? (full ? 'Exit full screen (Esc)' : 'Click again for full screen') : undefined}
      onClick={() => {
        // A second click on the active tab toggles full screen for that view.
        if (view === v) {
          if (minimized) setMinimized(false)
          else setFull((f) => !f)
        } else if (v === 'script') showScript()
        else if (v === 'scene' && openSceneId) showScene(openSceneId, step)
        else {
          setView(v)
          setMinimized(false)
          setFull(false)
        }
      }}
    >
      {label}
      {sub && <small>{sub}</small>}
      {view === v && !minimized && (
        <svg className="full-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          {full ? (
            <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      )}
    </button>
  )

  return (
    <div className={`app view-${view}${panelUp ? ' panel-up' : ''}${full && panelUp ? ' full' : ''}`}>
      <div className="backdrop">
        <StoryWheel project={project} openSceneId={view === 'scene' ? openSceneId : view === 'script' ? scriptSceneId : null} onNeedle={onNeedle} onOpenScene={onWheelOpen} onMoveScene={moveScene} handle={wheel} faded={panelUp && view !== 'circle'}>
          <div className="hub-inner" style={{ ['--h' as string]: HUES[needle.stage] }}>
            <span className="hub-num">{fmt(needle.sceneId ? (est.start[needle.sceneId] ?? 0) : hourRange(project, needle.stage)[0])}</span>
            <span className="hub-name">{project.stages[needle.stage].name} o’clock</span>
            <span className="hub-scene">{needle.sceneId ? project.scenes[needle.sceneId]?.title : `${project.stages[needle.stage].sceneIds.length} scene${project.stages[needle.stage].sceneIds.length === 1 ? '' : 's'}`}</span>
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
            <path d="M12 12V6.5M12 12l3.6 2.2" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          StoryClock
        </div>
        <ProjectMenu
          title={project.title}
          projects={projects}
          currentId={currentId}
          onRename={(t) => update((p) => void (p.title = t))}
          onNewBlank={() => { addProject(blankProject()); setToast('New project started') }}
          onNewSample={() => { addProject(seedProject()); setToast('Opened a fresh copy of the sample') }}
          onOpenFile={openFile}
          onSave={saveProject}
          onExportFountain={exportFountain}
          onOpen={openProject}
          onDelete={deleteProject}
        />
        <span className="spacer" />
        <label className="runtime-setting" title="The clock face is the whole film. Each hour is a twelfth of this runtime.">
          <span>Runtime</span>
          <input
            id="runtime"
            type="number"
            min={10}
            max={300}
            step={5}
            value={project.runtime}
            onChange={(e) => { const v = Number(e.target.value); if (v > 0) update((p) => void (p.runtime = Math.min(300, v))) }}
          />
          <span>min</span>
          <small className={est.total > project.runtime * 1.1 ? 'over' : ''} title="Every scene’s estimated runtime added up: set by you, from page count, or an even share of its hour">
            est. {fmtMinutes(est.total)}
          </small>
        </label>
        <button
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          <span className={`tt-knob ${theme}`}>
            {theme === 'dark' ? (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><circle cx="8" cy="8" r="3" fill="currentColor" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            )}
          </span>
        </button>
        <button className="pill" onClick={() => setSettingsOpen(true)} title="Claude connection">
          <span className={`status ${provider ?? ''}`} /> {provider ? providerLabel[provider] : '…'}
        </button>
      </header>

      {panelUp && view === 'circle' && !full && (
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
          onGoToHour={(i) => wheel.current?.goToStage(i, Math.max(needle.zoom, 1.6))}
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
          onProject={update}
          onMoveToHour={(i) => moveScene(openScene.id, i, project.stages[i].sceneIds.length)}
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
              p.connections = p.connections.filter((c) => c.from !== id && c.to !== id)
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
          {dockTab('circle', <><span className="dock-ico ring" />Clock</>)}
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
        <span><kbd>scroll</kbd> twirl</span><span><kbd>pinch</kbd> zoom</span><span><kbd>drag</kbd> spin</span><span><kbd>←</kbd><kbd>→</kbd> step</span><span><kbd>hold</kbd> move scene</span>
        {needle.zoom > 1.3 && <button className="btn ghost small" onClick={() => wheel.current?.zoomOut()}>Zoom out</button>}
      </p>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function Settings({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getApiKey())
  const [useCC, setUseCC] = useState(getUseClaudeCode())
  const [ccPath, setCcPath] = useState<string | null | undefined>(undefined)
  const desktop = '__TAURI_INTERNALS__' in window
  useEffect(() => {
    claudeCodePath().then(setCcPath)
  }, [])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal glass" role="dialog" aria-label="Claude connection" onClick={(e) => e.stopPropagation()}>
        <h2>Claude connection</h2>
        <p>
          Drafting and rewrites use <code>{DRAFT_MODEL}</code>; reviews use <code>{REVIEW_MODEL}</code>. Inside Claude, StoryClock uses your Claude account. The desktop app can use Claude Code on this computer, so it runs on your Claude subscription. Otherwise it needs an API key, and runs a scripted demo without one.
        </p>
        {desktop && (
          <div className="cc-box">
            <label className="cc-toggle">
              <input type="checkbox" checked={useCC} onChange={(e) => setUseCC(e.target.checked)} />
              <span>
                <strong>Use Claude Code on this computer</strong>
                <small className="meta">
                  {ccPath === undefined
                    ? 'Looking for Claude Code…'
                    : ccPath
                      ? `Found at ${ccPath}. Assist runs on the Claude plan you're signed in to there.`
                      : 'Not found. Install Claude Code from claude.com/claude-code, run "claude" once in Terminal to sign in, then reopen StoryClock.'}
                </small>
              </span>
            </label>
          </div>
        )}
        <label className="field">
          <span>Anthropic API key{desktop ? ' (used when Claude Code is off or missing)' : ''}</span>
          <input id="api-key" type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <p className="meta">The key stays on this device.</p>
        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { setApiKey(key.trim()); setUseClaudeCode(useCC); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}
