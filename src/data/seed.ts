import type { Connection, Project, Scene, Stage, StageKey, World } from '../types'
import { DEFAULT_RUNTIME, hourName } from '../clock'

export const uid = () => Math.random().toString(36).slice(2, 10)

const HOUR_DEFS: { world: World; question: string }[] = [
  { world: 'q1', question: 'Opening. What image or question starts the clock? The ending often answers it.' },
  { world: 'q1', question: 'Plant. What do we see or learn here that the 10–11 hour can pay off?' },
  { world: 'q1', question: 'Pressure toward the 3 o’clock turn. What makes the old way impossible?' },
  { world: 'q2', question: 'First turn, around the end of Act One. What commits the story to a new direction?' },
  { world: 'q2', question: 'New rules. What is tried in the new situation, and how does the world push back?' },
  { world: 'q2', question: 'Approaching the midpoint. What is building toward the pivot at 6?' },
  { world: 'q3', question: 'Midpoint pivot. What reverses or is revealed halfway? Before this is set-up, after it is consequence.' },
  { world: 'q3', question: 'Consequences. Which setups from 4–5 start coming due?' },
  { world: 'q3', question: 'Closing in on the 9 o’clock turn. How do the costs compound, and what breaks?' },
  { world: 'q4', question: 'Second turn, around the end of Act Two. What new resolve or plan rises from the break?' },
  { world: 'q4', question: 'Payoff. Which plants from 1–2 fire now?' },
  { world: 'q4', question: 'Ending. What closing image answers the opening hour?' },
]

/** Twelve empty hours. */
export function blankHours(): Stage[] {
  return HOUR_DEFS.map((d, i) => ({ ...d, key: `h${i + 1}` as StageKey, number: i + 1, name: hourName(i), idea: '', sceneIds: [] }))
}

export function emptyScene(partial: Partial<Scene> = {}): Scene {
  return {
    id: uid(),
    title: 'Untitled scene',
    heading: '',
    purpose: '',
    attempt: '',
    resistance: '',
    turn: '',
    beats: [],
    draft: '',
    versions: [],
    alsoServes: [],
    ...partial,
  }
}

function scene(title: string, heading: string, purpose: string, beats: string[], extra: Partial<Scene> = {}): Scene {
  return emptyScene({ title, heading, purpose, beats: beats.map((text) => ({ id: uid(), text })), ...extra })
}

/** Seed project: "The Last Broadcast" laid out on the clock, with one deliberate gap at 8–9. */
export function seedProject(): Project {
  const s: Scene[][] = [
    [
      scene('Morning show', 'INT. KVLR STUDIO - DAWN', 'Establish Mara\'s precision and control.', [
        'Mara runs the morning program to the second.',
        'She corrects Leila on air before Leila can finish her report.',
      ], {
        attempt: 'Mara wants a flawless broadcast.',
        resistance: 'Leila goes off-script with a river-level report.',
        turn: 'Mara cuts her mic. Listeners hear the silence.',
        draft: `INT. KVLR STUDIO - DAWN

Rain ticks the window. MARA VOSS (50s), headphones half-on, watches the clock's second hand like a conductor.

MARA
Six-oh-one. Good morning, Halvern.

Across the glass, LEILA VOSS (20s) leans into her mic, a printout trembling in her hand.

LEILA
The river gauge at Miller's Ford is up four feet since--

Mara's finger finds the fader. Leila's voice disappears mid-word.

MARA
(smooth)
Our weather desk will have the full report at six-fifteen.

Leila stares at her through the glass. Mara doesn't look up.`,
      }),
    ],
    [
      scene('Leila packs the van', 'EXT. KVLR PARKING LOT - DAY', 'Show what Leila does without permission.', [
        'Leila loads scanners and spare batteries into her own van.',
        'Mara watches from the window and says nothing.',
      ]),
    ],
    [
      scene('The towers go dark', 'INT. KVLR STUDIO - DAY', 'Official communication fails; Mara wants a trusted source restored.', [
        'County emergency feed cuts out mid-alert.',
        'Mara insists on waiting for official confirmation.',
      ]),
    ],
    [
      scene('Hilltop station', 'EXT. OLD HILLTOP STATION - DUSK', 'Mara defies the evacuation order and commits to the old station.', [
        'Ordered to evacuate, Mara drives uphill instead.',
        'Leila is already there, prying the lock.',
      ]),
    ],
    [
      scene('Reviving the transmitter', 'INT. HILLTOP STATION - NIGHT', 'They repair equipment; Mara\'s procedure clashes with Leila\'s improvising.', [
        'Corroded tubes, a generator that coughs.',
        'Leila wires in a CB relay; Mara calls it unverified noise.',
        'A 1998 county map curls on the wall.',
      ]),
    ],
    [
      scene('The callers', 'INT. HILLTOP STATION - LATER', 'Leila builds a network of local observers while Mara delays a warning.', [
        'Callers report water on Bridge Road.',
        'Mara holds the warning until she can verify it. Twelve minutes pass.',
      ]),
    ],
    [
      scene('Signal reaches rescue', 'INT. HILLTOP STATION - NIGHT', 'Midpoint: their signal reaches a rescue team; Mara believes she has solved it.', [
        'A rescue team answers on the relay.',
        'They locate a group trapped near the bridge.',
      ]),
    ],
    [
      scene('The wrong route', 'INT. HILLTOP STATION - NIGHT', 'Mara overrides Leila and announces a route from the outdated map.', [
        'Mara needs to sound certain.',
        'Leila warns that the map predates the levee work.',
        'The rescue vehicle becomes stranded on the announced route.',
      ]),
    ],
    [],
    [
      scene('Back to the microphone', 'INT. HILLTOP STATION - PRE-DAWN', 'Mara returns to her public role but corrects her own report.', [
        'The bridge is failing.',
        'Mara corrects herself on air and gives Leila the coordination.',
      ]),
    ],
    [
      scene('Spare batteries', 'INT. HILLTOP STATION - DAWN', 'The generator dies; the gear Leila packed keeps the relay alive.', [
        'Silence. Then Leila\'s scanners blink on, one by one.',
        'Mara holds the flashlight while Leila wires them in.',
      ]),
    ],
    [
      scene('Aftermath broadcast', 'INT. KVLR STUDIO - MORNING', 'Mara asks Leila for her assessment and listens without interrupting.', [
        'Same clock, same chair.',
        'Mara slides the fader up on Leila\'s mic and waits.',
      ]),
    ],
  ]

  const ideas = [
    'Mara runs her morning program precisely and cuts her daughter Leila off on air.',
    'Leila prepares for trouble nobody has authorised.',
    'Rising water interrupts official communication. Mara wants a trusted source back.',
    'Ordered to evacuate, she enters the old hilltop station with Leila.',
    'They repair equipment. Mara\'s rules meet Leila\'s improvising.',
    'Mara\'s need to verify delays a warning.',
    'Their signal reaches a rescue team. Mara believes her broadcast solved it.',
    'She overrides Leila and announces an outdated route. A rescue vehicle is stranded.',
    '',
    'Back at the microphone, she corrects her own report and gives Leila authority.',
    'What Leila packed in hour 2 keeps them on air.',
    'Mara begins a broadcast by asking for Leila\'s assessment, and listens.',
  ]

  const scenes: Record<string, Scene> = {}
  const stages = blankHours().map((h, i) => {
    for (const sc of s[i]) scenes[sc.id] = sc
    return { ...h, idea: ideas[i], sceneIds: s[i].map((x) => x.id) }
  })
  const link = (from: Scene, to: Scene, note: string): Connection => ({ id: uid(), from: from.id, to: to.id, note })

  return {
    title: 'The Last Broadcast',
    logline:
      'When a flood threatens her town, a rigid local radio host must turn an abandoned station into a rescue relay, relying on the estranged daughter whose judgment she has repeatedly dismissed.',
    theme: 'Can responsibility require sharing control?',
    tone: 'Grounded survival drama with dry humor.',
    runtime: DEFAULT_RUNTIME,
    characters: [
      { id: uid(), name: 'Mara Voss', notes: '50s. Local radio host. Trusts only what she personally controls. Precise, proud, funny when cornered.' },
      { id: uid(), name: 'Leila Voss', notes: '20s. Mara\'s daughter. Improviser, community-minded, tired of being cut off mid-sentence.' },
    ],
    stages,
    scenes,
    connections: [
      link(s[0][0], s[11][0], 'Mara cut Leila\'s mic; now she slides it up.'),
      link(s[1][0], s[10][0], 'The gear Leila packed without permission keeps them on air.'),
      link(s[4][0], s[7][0], 'The 1998 map on the wall becomes the wrong route.'),
      link(s[5][0], s[9][0], 'The warning she delayed is the report she corrects.'),
    ],
  }
}

/** An empty clock: twelve hours, no scenes, nothing pre-written. */
export function blankProject(title = 'Untitled screenplay'): Project {
  return { title, logline: '', theme: '', tone: '', characters: [], runtime: DEFAULT_RUNTIME, stages: blankHours(), scenes: {}, connections: [] }
}

/**
 * Bring any loaded project up to the clock shape: fills fields older saves lack,
 * and lays an eight-stage StoryCircle project onto the twelve hours.
 */
export function normalizeProject(p: Project): Project {
  const hours = blankHours()
  if (p.stages.length !== hours.length) {
    // Stage j of n lands on the hour where it starts in runtime.
    p.stages.forEach((st, j) => {
      const h = hours[Math.floor((j * hours.length) / p.stages.length)]
      h.sceneIds.push(...st.sceneIds)
      h.idea = [h.idea, st.idea && `${st.name}: ${st.idea}`].filter(Boolean).join('\n')
    })
    p.stages = hours
    for (const sc of Object.values(p.scenes)) sc.alsoServes = []
  }
  p.runtime ||= DEFAULT_RUNTIME
  p.connections ??= []
  return p
}
