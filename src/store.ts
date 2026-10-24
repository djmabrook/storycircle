import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftVersion, Project } from './types'
import { seedProject, uid } from './data/seed'

const LEGACY_KEY = 'storycircle.project.v1'
const LIB_KEY = 'storycircle.library.v1'
const projectKey = (id: string) => `storycircle.project.${id}`

export interface LibraryEntry {
  id: string
  title: string
  updatedAt: number
}

interface Library {
  currentId: string
  entries: LibraryEntry[]
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable */
  }
}

/** Load the project library, moving a v0.1 single project into it on first run. */
function loadLibrary(): { lib: Library; project: Project } {
  const lib = read<Library>(LIB_KEY)
  if (lib && lib.entries.length) {
    const project = read<Project>(projectKey(lib.currentId))
    if (project) return { lib, project }
  }
  const project = read<Project>(LEGACY_KEY) ?? seedProject()
  const id = uid()
  const fresh = { currentId: id, entries: [{ id, title: project.title, updatedAt: Date.now() }] }
  write(projectKey(id), project)
  write(LIB_KEY, fresh)
  return { lib: fresh, project }
}

/**
 * Projects with local autosave. Every project is kept in this browser (or the
 * desktop webview); Save to file / Open file move them in and out as files.
 */
export function useProject() {
  const [{ lib, project }, setState] = useState(loadLibrary)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      write(projectKey(lib.currentId), project)
      write(LIB_KEY, lib)
    }, 300)
  }, [project, lib])

  const update = useCallback((fn: (draft: Project) => void) => {
    setState((prev) => {
      const next = structuredClone(prev.project)
      fn(next)
      const entries = prev.lib.entries.map((e) => (e.id === prev.lib.currentId ? { ...e, title: next.title, updatedAt: Date.now() } : e))
      return { project: next, lib: { ...prev.lib, entries } }
    })
  }, [])

  /** Add a project to the library and switch to it. */
  const addProject = useCallback((p: Project) => {
    const id = uid()
    setState((prev) => {
      write(projectKey(prev.lib.currentId), prev.project)
      write(projectKey(id), p)
      return { project: p, lib: { currentId: id, entries: [{ id, title: p.title, updatedAt: Date.now() }, ...prev.lib.entries] } }
    })
  }, [])

  const openProject = useCallback((id: string) => {
    setState((prev) => {
      if (id === prev.lib.currentId) return prev
      write(projectKey(prev.lib.currentId), prev.project)
      const p = read<Project>(projectKey(id))
      if (!p) return prev
      return { project: p, lib: { ...prev.lib, currentId: id } }
    })
  }, [])

  const deleteProject = useCallback((id: string) => {
    setState((prev) => {
      if (id === prev.lib.currentId) return prev
      try {
        localStorage.removeItem(projectKey(id))
      } catch {
        /* ignore */
      }
      return { ...prev, lib: { ...prev.lib, entries: prev.lib.entries.filter((e) => e.id !== id) } }
    })
  }, [])

  return { project, update, projects: lib.entries, currentId: lib.currentId, addProject, openProject, deleteProject }
}

export function snapshot(text: string, source: DraftVersion['source'], note: string): DraftVersion {
  return { id: uid(), at: Date.now(), text, source, note }
}

/** Fountain export of every scene in circle order. */
export function toFountain(p: Project): string {
  const out: string[] = [`Title: ${p.title}`, `Notes: Exported from StoryCircle`, '', '']
  for (const st of p.stages) {
    out.push(`# ${st.number}. ${st.name}`, '')
    for (const id of st.sceneIds) {
      const sc = p.scenes[id]
      if (!sc) continue
      // Synopsis line carries the scene's title and purpose so a re-import keeps them.
      out.push(`= ${sc.title}${sc.purpose ? ` — ${sc.purpose}` : ''}`, '')
      const draft = sc.draft.trim()
      if (draft) out.push(draft, '')
      else out.push(sc.heading ? `${sc.heading.startsWith('INT') || sc.heading.startsWith('EXT') ? '' : '.'}${sc.heading}` : `.${sc.title.toUpperCase()}`, '', `[[Not yet drafted]]`, '')
    }
  }
  return out.join('\n')
}
