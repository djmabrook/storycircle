import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftVersion, Project } from './types'
import { seedProject, uid } from './data/seed'

const KEY = 'storycircle.project.v1'

function load(): Project {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Project
  } catch {
    /* storage unavailable: start from the seed */
  }
  return seedProject()
}

/**
 * Project state with local autosave. In the desktop build this is the seam
 * where a project file on disk (via Tauri's fs plugin) replaces localStorage.
 */
export function useProject() {
  const [project, setProject] = useState<Project>(load)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(project))
      } catch {
        /* ignore */
      }
    }, 300)
  }, [project])

  const update = useCallback((fn: (draft: Project) => void) => {
    setProject((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  const reset = useCallback(() => setProject(seedProject()), [])

  return { project, update, reset }
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
      out.push(`= ${sc.purpose || sc.title}`, '')
      const draft = sc.draft.trim()
      if (draft) out.push(draft, '')
      else out.push(sc.heading ? `${sc.heading.startsWith('INT') || sc.heading.startsWith('EXT') ? '' : '.'}${sc.heading}` : `.${sc.title.toUpperCase()}`, '', `[[Not yet drafted]]`, '')
    }
  }
  return out.join('\n')
}
