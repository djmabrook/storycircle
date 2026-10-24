import type { Project, Scene } from './types'
import { blankProject, emptyScene, normalizeProject, uid } from './data/seed'

/** File format for a saved project: the whole project as JSON, with a version tag. */
export const PROJECT_EXT = 'storyclock'

export interface ProjectFile {
  format: 'storyclock' | 'storycircle'
  version: 1
  savedAt: string
  project: Project
}

const isTauri = () => '__TAURI_INTERNALS__' in window
type ClaudeHost = { use: (name: string) => Promise<unknown> }
type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<{ status: string }> }

export const safeName = (s: string) => (s.trim() || 'Untitled').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_')

/**
 * Save text to a file the writer chooses. Desktop: native Save dialog.
 * Inside Claude: the viewer's download prompt. Plain browser: a download.
 * Resolves false if the writer cancelled.
 */
export async function saveTextFile(filename: string, text: string, ext: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: filename, filters: [{ name: ext === 'fountain' ? 'Fountain screenplay' : 'StoryClock project', extensions: [ext] }] })
    if (!path) return false
    await writeTextFile(path, text)
    return true
  }
  const blob = new Blob([text], { type: ext === 'fountain' ? 'text/plain' : 'application/json' })
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    const downloads = (await host.use('downloads').catch(() => null)) as Downloads | null
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob })
        return true
      } catch (e) {
        if ((e as { code?: string }).code === 'declined') return false
        throw e
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/** Ask for a project or Fountain file and return its name and text, or null if cancelled. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({ multiple: false, filters: [{ name: 'StoryClock, StoryCircle or Fountain', extensions: [PROJECT_EXT, 'storycircle', 'json', 'fountain', 'txt'] }] })
    if (!path || Array.isArray(path)) return null
    return { name: path.split(/[\\/]/).pop() ?? path, text: await readTextFile(path) }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `.${PROJECT_EXT},.json,.fountain,.txt`
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, text: await f.text() } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function projectToFile(p: Project): string {
  const file: ProjectFile = { format: 'storyclock', version: 1, savedAt: new Date().toISOString(), project: p }
  return JSON.stringify(file, null, 2)
}

/** Read a .storyclock (or .storycircle) project, or turn a Fountain script into a project. Throws with a readable message. */
export function projectFromFile(name: string, text: string): Project {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`${name} isn’t a valid StoryClock project file.`)
    }
    const p = (data as ProjectFile).project ?? (data as Project)
    if (!p || !Array.isArray(p.stages) || !p.stages.length || typeof p.scenes !== 'object') throw new Error(`${name} isn’t a StoryClock project file.`)
    // StoryCircle files open too: their eight stages are laid onto the twelve hours.
    return normalizeProject(p)
  }
  return fromFountain(name, text)
}

const HEADING = /^(\.(?!\.)|(INT|EXT|EST|INT\.?\/EXT|I\/E)[ .])/i

/**
 * Fountain import. Sections written by StoryClock's export ("# 4. 3–4") put
 * scenes back on their hour; anything else lands in hour 1 to be sorted on the wheel.
 */
function fromFountain(name: string, text: string): Project {
  const lines = text.replace(/\r/g, '').split('\n')
  const titleLine = lines.find((l) => /^Title:/i.test(l))
  const p = blankProject(titleLine ? titleLine.replace(/^Title:\s*/i, '').trim() : name.replace(/\.[^.]+$/, ''))
  let stage = 0
  let synopsis = ''
  let current: { scene: Scene; body: string[] } | null = null
  const flush = () => {
    if (!current) return
    current.scene.draft = current.body.join('\n').trim()
    p.scenes[current.scene.id] = current.scene
    p.stages[stage].sceneIds.push(current.scene.id)
    current = null
  }
  let i = 0
  // Skip the title page block.
  if (/^\w[\w ]*:/.test(lines[0] ?? '')) while (i < lines.length && lines[i].trim()) i++
  for (; i < lines.length; i++) {
    const l = lines[i]
    const t = l.trim()
    const section = t.match(/^#\s*(1[0-2]|[1-9])\./)
    if (section) {
      flush()
      stage = Number(section[1]) - 1
      continue
    }
    if (t.startsWith('=') && !t.startsWith('===')) {
      synopsis = t.replace(/^=\s*/, '')
      continue
    }
    const prevBlank = i === 0 || !lines[i - 1].trim()
    if (prevBlank && HEADING.test(t) && !(lines[i + 1] ?? '').trim()) {
      flush()
      const heading = t.replace(/^\./, '').toUpperCase()
      const place = heading.replace(/^(INT\.?\/EXT|INT|EXT|EST|I\/E)[ .]+/i, '').split(' - ')[0]
      const [synTitle, synPurpose] = synopsis.includes(' — ') ? synopsis.split(' — ', 2) : ['', synopsis]
      const title = synTitle || (place ? place.charAt(0) + place.slice(1).toLowerCase() : 'Scene')
      current = { scene: emptyScene({ id: uid(), title, heading, purpose: synPurpose }), body: [l] }
      synopsis = ''
      continue
    }
    if (/^\[\[Not yet drafted\]\]$/.test(t)) continue
    if (current) current.body.push(l)
  }
  flush()
  // An undrafted scene exported by StoryClock is only a heading; keep it as a brief.
  for (const sc of Object.values(p.scenes)) if (sc.draft.split('\n').filter((x) => x.trim()).length <= 1) sc.draft = ''
  if (!Object.keys(p.scenes).length) throw new Error(`No scenes were found in ${name}. Scenes need headings such as INT. KITCHEN - NIGHT.`)
  return p
}
