/** One hour of the Story Clock: 'h1' is 12 to 1 o'clock, 'h12' is 11 to 12. */
export type StageKey = `h${number}`

/** Which quarter of the clock an hour sits in; the quarter lines fall at 3, 6, 9 and 12. */
export type World = 'q1' | 'q2' | 'q3' | 'q4'

/** An hour of the clock. Named Stage so the wheel and panels stay shared with StoryCircle. */
export interface Stage {
  key: StageKey
  number: number
  /** Clock span, e.g. "3–4". */
  name: string
  world: World
  /** Short craft prompt shown when the hour is in focus. */
  question: string
  /** The writer's working interpretation of this stage for this story. */
  idea: string
  /** Ordered scene ids. A scene lives in one stage ring but may serve others. */
  sceneIds: string[]
}

export interface Beat {
  id: string
  text: string
}

export interface DraftVersion {
  id: string
  at: number
  text: string
  source: 'writer' | 'claude'
  note: string
}

export interface Review {
  id: string
  at: number
  focus: string
  text: string
}

export interface Scene {
  id: string
  title: string
  /** Scene heading, e.g. INT. HILLTOP STATION - NIGHT */
  heading: string
  purpose: string
  attempt: string
  resistance: string
  turn: string
  beats: Beat[]
  /** Current accepted draft, in Fountain. */
  draft: string
  versions: DraftVersion[]
  /** Other stages this scene also serves (many-to-many). */
  alsoServes: StageKey[]
  /** Saved review passes; optional so projects saved by v0.1 still load. */
  reviews?: Review[]
  /** Screen time the writer expects, in minutes. Unset means estimate it from the draft. */
  minutes?: number
}

/** A thread across the clock: something set up in one scene that pays off in another. */
export interface Connection {
  id: string
  from: string
  to: string
  note: string
}

export interface Character {
  id: string
  name: string
  notes: string
}

export interface Project {
  title: string
  logline: string
  theme: string
  tone: string
  characters: Character[]
  /** Film runtime in minutes; the clock face is the whole film. */
  runtime: number
  stages: Stage[]
  scenes: Record<string, Scene>
  connections: Connection[]
}
