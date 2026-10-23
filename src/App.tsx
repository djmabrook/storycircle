import { useEffect, useRef, useState } from 'react'
import { StoryWheel, type Needle, type WheelHandle } from './circle/StoryWheel'
import { SceneEditor } from './editor/SceneEditor'
import { StagePanel } from './editor/StagePanel'
import { AssistPanel, type Selection } from './ai/AssistPanel'
import { activeProvider, getApiKey, providerLabel, setApiKey, DRAFT_MODEL, REVIEW_MODEL, type ProviderId, type SceneIdea, type AssistKind } from './ai/assistant'
import { snapshot, toFountain, useProject } from './store'
import { emptyScene, uid } from './data/seed'

export default function App() {
  const { project, update, reset } = useProject()
  const wheel = useRef<WheelHandle>(null)
  const [needle, setNeedle] = useState<Needle>({ stage: 0, sceneId: null, zoom: 1 })
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)
  const [assist, setAssist] = useState<{ open: boolean; kind?: AssistKind; key: number }>({ open: false, key: 0 })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    activeProvider().then(setProvider)
  }, [settingsOpen])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const openScene = openSceneId ? project.scenes[openSceneId] : null
  const openStageIndex = openSceneId ? project.stages.findIndex((s) => s.sceneIds.includes(openSceneId)) : -1
  const stageIndex = openStageIndex >= 0 ? openStageIndex : needle.stage
  const stage = project.stages[needle.stage]
  const needleScene = needle.sceneId ? project.scenes[needle.sceneId] : null

  const openAssist = (kind?: AssistKind) => setAssist((a) => ({ open: true, kind, key: a.key + 1 }))

  const doOpenScene = (id: string) => {
    setOpenSceneId(id)
    setSelection(null)
  }

  const addScene = (partial = {}) => {
    const sc = emptyScene(partial)
    const i = stageIndex
    update((p) => {
      p.scenes[sc.id] = sc
      p.stages[i].sceneIds.push(sc.id)
    })
    setOpenSceneId(sc.id)
    requestAnimationFrame(() => wheel.current?.goToScene(sc.id))
    return sc
  }

  const addIdea = (idea: SceneIdea) => {
    const sc = emptyScene({ title: idea.title, heading: (idea.heading || '').toUpperCase(), purpose: idea.purpose, beats: (idea.beats || []).map((text) => ({ id: uid(), text })) })
    const i = stageIndex
    update((p) => {
      p.scenes[sc.id] = sc
      p.stages[i].sceneIds.push(sc.id)
    })
    setToast(`Added “${idea.title}” to ${project.stages[i].name}`)
  }

  const editScene = (fn: Parameters<typeof SceneEditor>[0]['onChange'] extends (f: infer F) => void ? F : never) => {
    if (!openSceneId) return
    update((p) => fn(p.scenes[openSceneId]))
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>StoryCircle</span>
        </div>
        <input id="project-title" className="project-title" value={project.title} onChange={(e) => update((p) => void (p.title = e.target.value))} aria-label="Project title" />
        <div className="topbar-actions">
          <button className="pill" onClick={() => setSettingsOpen(true)} title="AI connection settings">
            <span className={`status ${provider ?? ''}`} /> {provider ? providerLabel[provider] : '…'}
          </button>
          <button className="ghost" onClick={exportFountain}>Export Fountain</button>
        </div>
      </header>

      <main className="workspace">
        <section className="stage-area">
          <StoryWheel project={project} openSceneId={openSceneId} onNeedle={setNeedle} onOpenScene={doOpenScene} handle={wheel}>
            <div className="hub-inner" style={{ ['--h' as string]: [205, 178, 42, 14, 346, 318, 52, 232][needle.stage] }}>
              <span className="hub-num">{stage.number}</span>
              <span className="hub-name">{stage.name}</span>
              <span className="hub-scene">{needleScene ? needleScene.title : `${stage.sceneIds.length} scene${stage.sceneIds.length === 1 ? '' : 's'}`}</span>
              <button
                className="hub-assist"
                onClick={() => {
                  if (needleScene && needle.sceneId !== openSceneId) doOpenScene(needle.sceneId!)
                  openAssist()
                }}
                aria-label="Open AI assistant"
              >
                ✦ Assist
              </button>
            </div>
          </StoryWheel>
          <p className="hint">
            <span><kbd>two-finger scroll</kbd> twirl</span>
            <span><kbd>pinch</kbd> zoom into a slice</span>
            <span><kbd>drag</kbd> spin</span>
            <span><kbd>←</kbd><kbd>→</kbd> step</span>
            <span><kbd>↵</kbd> open</span>
            {needle.zoom > 1.3 && (
              <button className="ghost" onClick={() => wheel.current?.zoomOut()}>Zoom out</button>
            )}
          </p>
        </section>

        <aside className="side">
          {assist.open && (
            <AssistPanel
              key={assist.key}
              project={project}
              stageIndex={stageIndex}
              sceneId={openSceneId}
              selection={selection}
              initialKind={assist.kind}
              onClose={() => setAssist((a) => ({ ...a, open: false }))}
              onAddIdea={addIdea}
              onUseDraft={(text, mode) =>
                update((p) => {
                  const sc = p.scenes[openSceneId!]
                  if (mode === 'replace') {
                    if (sc.draft.trim()) sc.versions.push(snapshot(sc.draft, 'writer', 'Before Claude draft'))
                    sc.draft = text
                    sc.versions.push(snapshot(text, 'claude', 'Claude draft (accepted)'))
                  } else sc.versions.push(snapshot(text, 'claude', 'Claude alternative'))
                })
              }
              onReplaceSelection={(sel, original, text) => {
                const sc = project.scenes[openSceneId!]
                const unchanged = sc.draft === original
                update((p) => {
                  const s = p.scenes[openSceneId!]
                  if (unchanged) {
                    s.versions.push(snapshot(s.draft, 'writer', 'Before passage rewrite'))
                    s.draft = s.draft.slice(0, sel.start) + text + s.draft.slice(sel.end)
                  } else s.versions.push(snapshot(text, 'claude', 'Passage rewrite (draft had changed)'))
                })
                if (unchanged) setSelection(null)
                return unchanged
              }}
            />
          )}
          {openScene ? (
            <SceneEditor
              key={openScene.id}
              project={project}
              scene={openScene}
              stageIndex={stageIndex}
              onChange={editScene}
              onSelection={setSelection}
              onAssist={() => openAssist()}
              onRestore={(vid) =>
                update((p) => {
                  const s = p.scenes[openScene.id]
                  const v = s.versions.find((x) => x.id === vid)
                  if (!v) return
                  s.versions.push(snapshot(s.draft, 'writer', 'Before restore'))
                  s.draft = v.text
                })
              }
              onDelete={() => {
                const id = openScene.id
                update((p) => {
                  for (const st of p.stages) st.sceneIds = st.sceneIds.filter((x) => x !== id)
                  delete p.scenes[id]
                })
                setOpenSceneId(null)
              }}
              onClose={() => setOpenSceneId(null)}
            />
          ) : (
            <StagePanel
              project={project}
              stageIndex={stageIndex}
              onIdea={(t) => update((p) => void (p.stages[stageIndex].idea = t))}
              onOpenScene={(id) => {
                doOpenScene(id)
                wheel.current?.goToScene(id)
              }}
              onMove={(id, dir) =>
                update((p) => {
                  const ids = p.stages[stageIndex].sceneIds
                  const k = ids.indexOf(id)
                  ;[ids[k], ids[k + dir]] = [ids[k + dir], ids[k]]
                })
              }
              onAddScene={() => addScene()}
              onAssist={() => openAssist('ideas')}
            />
          )}
        </aside>
      </main>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onReset={() => { reset(); setOpenSceneId(null); setSettingsOpen(false) }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function Settings({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const [key, setKey] = useState(getApiKey())
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="AI connection" onClick={(e) => e.stopPropagation()}>
        <h2>Claude connection</h2>
        <p>
          Drafting and rewrites use <code>{DRAFT_MODEL}</code>. Reviews use <code>{REVIEW_MODEL}</code>. Without a key, StoryCircle uses your Claude account when it runs inside Claude, and a scripted demo otherwise.
        </p>
        <label className="field">
          <span>Anthropic API key</span>
          <input id="api-key" type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <p className="muted small">The key stays on this device. The desktop build will move it to the system keychain.</p>
        <div className="modal-actions">
          {confirmReset ? (
            <>
              <span className="small">Replace your project with the sample?</span>
              <button className="danger" onClick={onReset}>Replace</button>
              <button className="ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          ) : (
            <button className="ghost danger-text" onClick={() => setConfirmReset(true)}>Reload sample project</button>
          )}
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => { setApiKey(key.trim()); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}
