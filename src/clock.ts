import type { Connection, Project, Scene } from './types'
import { pageEstimate, parse } from './script/fountain'

/** The Story Clock: the clock face is the film's runtime, split into twelve hours. */
export const HOURS = 12
export const DEFAULT_RUNTIME = 110

const oclock = (h: number) => (h % 12 === 0 ? 12 : h % 12)

/** Clock span of hour i (0-based), e.g. 0 → "12–1", 3 → "3–4". */
export const hourName = (i: number) => `${oclock(i)}–${oclock(i + 1)}`

/** Minutes as a timecode, e.g. 75 → "1:15". */
export function fmt(min: number) {
  const m = Math.round(min)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export const hourLength = (p: Project) => p.runtime / HOURS

/** Start and end minute of hour i. */
export const hourRange = (p: Project, i: number): [number, number] => [i * hourLength(p), (i + 1) * hourLength(p)]

export const rangeLabel = (p: Project, i: number) => hourRange(p, i).map(fmt).join('–')

/**
 * The hour across the 12–6 line from hour i, offered as a hint for where a
 * setup might pay off. Real threads can land anywhere (5 to 8 is as valid).
 */
export const mirrorOf = (i: number) => HOURS - 1 - i

export interface SceneTime {
  minutes: number
  /** Where the number came from: set by the writer, the draft's page count (a page is about a minute), or an even share of its hour. */
  source: 'set' | 'pages' | 'share'
}

/** Expected screen time of one scene. */
export function sceneTime(p: Project, sc: Scene): SceneTime {
  if (sc.minutes && sc.minutes > 0) return { minutes: sc.minutes, source: 'set' }
  if (sc.draft.trim()) return { minutes: Math.max(0.25, pageEstimate(parse(sc.draft))), source: 'pages' }
  const i = hourOf(p, sc.id)
  const n = i >= 0 ? p.stages[i].sceneIds.length : 1
  return { minutes: hourLength(p) / Math.max(1, n), source: 'share' }
}

/** Estimated minutes in hour i, against the slot the runtime gives it. */
export function hourLoad(p: Project, i: number) {
  const used = p.stages[i].sceneIds.reduce((a, id) => a + sceneTime(p, p.scenes[id]).minutes, 0)
  const slot = hourLength(p)
  const ratio = used / slot
  return { used, slot, state: !p.stages[i].sceneIds.length ? 'empty' : ratio > 1.25 ? 'long' : ratio < 0.6 ? 'short' : 'fits' } as const
}

/** Estimated start of every scene if the film played in clock order, with the total. */
export function timeline(p: Project) {
  const start: Record<string, number> = {}
  let t = 0
  for (const st of p.stages)
    for (const id of st.sceneIds) {
      start[id] = t
      t += sceneTime(p, p.scenes[id]).minutes
    }
  return { start, total: t }
}

export const fmtMinutes = (m: number) => (m < 1 ? `${Math.round(m * 60)}s` : m < 10 ? `${(Math.round(m * 2) / 2).toString()} min` : `${Math.round(m)} min`)

export const hourOf = (p: Project, id: string) => p.stages.findIndex((s) => s.sceneIds.includes(id))

export const setupsFrom = (p: Project, id: string): Connection[] => p.connections.filter((c) => c.from === id)
export const payoffsTo = (p: Project, id: string): Connection[] => p.connections.filter((c) => c.to === id)

/** Threads that start or land in hour i. */
export function threadsIn(p: Project, i: number): Connection[] {
  const ids = new Set(p.stages[i].sceneIds)
  return p.connections.filter((c) => ids.has(c.from) || ids.has(c.to))
}

/** Hours with no scenes yet: the gaps the clock is meant to reveal. */
export const gaps = (p: Project) => p.stages.flatMap((s, i) => (s.sceneIds.length ? [] : [i]))
