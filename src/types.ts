export type StageKey = 'you' | 'need' | 'go' | 'search' | 'find' | 'take' | 'return' | 'change'

/** Where a stage sits relative to Harmon's threshold line. */
export type World = 'familiar' | 'threshold' | 'unfamiliar'

export interface Stage {
  key: StageKey
  number: number
  name: string
  world: World
  /** Short craft prompt shown in the hub when the stage is in focus. */
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
  stages: Stage[]
  scenes: Record<string, Scene>
}
