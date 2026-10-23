import type { Project, Scene, Stage, StageKey, World } from '../types'

export const uid = () => Math.random().toString(36).slice(2, 10)

const STAGE_DEFS: { key: StageKey; name: string; world: World; question: string }[] = [
  { key: 'you', name: 'You', world: 'familiar', question: 'What does their familiar life look like, and what is already unstable?' },
  { key: 'need', name: 'Need', world: 'familiar', question: 'What disrupts it? What do they consciously want, and why now?' },
  { key: 'go', name: 'Go', world: 'threshold', question: 'What choice or event changes the conditions and makes retreat costly?' },
  { key: 'search', name: 'Search', world: 'unfamiliar', question: 'What do they try? How does resistance change the next attempt?' },
  { key: 'find', name: 'Find', world: 'unfamiliar', question: 'What is obtained or revealed? What new problem follows?' },
  { key: 'take', name: 'Take', world: 'unfamiliar', question: 'What price is paid, and who else bears the cost?' },
  { key: 'return', name: 'Return', world: 'threshold', question: 'How does the experience reconnect with what came before?' },
  { key: 'change', name: 'Change', world: 'familiar', question: 'What observable choice or image shows what is different?' },
]

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

/** Seed project: the invented "The Last Broadcast" example from the project brief. */
export function seedProject(): Project {
  const s: Record<StageKey, Scene[]> = {
    you: [
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
      scene('Leila packs the van', 'EXT. KVLR PARKING LOT - DAY', 'Show what Leila does without permission.', [
        'Leila loads scanners and spare batteries into her own van.',
      ]),
    ],
    need: [
      scene('The towers go dark', 'INT. KVLR STUDIO - DAY', 'Official communication fails; Mara wants a trusted source restored.', [
        'County emergency feed cuts out mid-alert.',
        'Mara insists on waiting for official confirmation.',
      ]),
    ],
    go: [
      scene('Hilltop station', 'EXT. OLD HILLTOP STATION - DUSK', 'Mara defies the evacuation order and crosses into the unfamiliar.', [
        'Ordered to evacuate, Mara drives uphill instead.',
        'Leila is already there, prying the lock.',
      ]),
    ],
    search: [
      scene('Reviving the transmitter', 'INT. HILLTOP STATION - NIGHT', 'They repair equipment; Mara\'s procedure clashes with Leila\'s improvising.', [
        'Corroded tubes, a generator that coughs.',
        'Leila wires in a CB relay; Mara calls it unverified noise.',
      ]),
      scene('The callers', 'INT. HILLTOP STATION - LATER', 'Leila builds a network of local observers while Mara delays a warning.', [
        'Callers report water on Bridge Road.',
        'Mara holds the warning until she can verify it. Twelve minutes pass.',
      ]),
    ],
    find: [
      scene('Signal reaches rescue', 'INT. HILLTOP STATION - NIGHT', 'Their signal reaches a rescue team; Mara believes she has solved it.', [
        'A rescue team answers on the relay.',
        'They locate a group trapped near the bridge.',
      ], { alsoServes: ['take'] }),
    ],
    take: [
      scene('The wrong route', 'INT. HILLTOP STATION - NIGHT', 'Mara overrides Leila and announces a route from an outdated map.', [
        'Mara needs to sound certain.',
        'Leila warns that the map predates the levee work.',
        'The rescue vehicle becomes stranded on the announced route.',
      ], { alsoServes: ['find'] }),
    ],
    return: [
      scene('Back to the microphone', 'INT. HILLTOP STATION - PRE-DAWN', 'Mara returns to her public role but corrects her own report.', [
        'The bridge is failing.',
        'Mara corrects herself on air and gives Leila the coordination.',
      ]),
    ],
    change: [
      scene('Aftermath broadcast', 'INT. KVLR STUDIO - MORNING', 'Mara asks Leila for her assessment and listens without interrupting.', [
        'Same clock, same chair.',
        'Mara slides the fader up on Leila\'s mic and waits.',
      ]),
    ],
  }

  const ideas: Record<StageKey, string> = {
    you: 'Mara runs her morning program precisely and corrects her daughter Leila on air.',
    need: 'Rising water interrupts official communication. Mara wants to restore a trusted source.',
    go: 'Ordered to evacuate, she enters the old hilltop station with Leila.',
    search: 'They repair equipment and relay calls. Mara\'s verification delays a warning.',
    find: 'Their signal reaches a rescue team. Mara believes her broadcast solved it.',
    take: 'She overrides Leila and announces an outdated route. A rescue vehicle is stranded.',
    return: 'Back at the microphone, she corrects her own report and gives Leila authority.',
    change: 'Mara begins a broadcast by asking for Leila\'s assessment, and listens.',
  }

  const scenes: Record<string, Scene> = {}
  const stages: Stage[] = STAGE_DEFS.map((d, i) => {
    for (const sc of s[d.key]) scenes[sc.id] = sc
    return { ...d, number: i + 1, idea: ideas[d.key], sceneIds: s[d.key].map((x) => x.id) }
  })

  return {
    title: 'The Last Broadcast',
    logline:
      'When a flood threatens her town, a rigid local radio host must turn an abandoned station into a rescue relay, relying on the estranged daughter whose judgment she has repeatedly dismissed.',
    theme: 'Can responsibility require sharing control?',
    tone: 'Grounded survival drama with dry humor.',
    characters: [
      { id: uid(), name: 'Mara Voss', notes: '50s. Local radio host. Trusts only what she personally controls. Precise, proud, funny when cornered.' },
      { id: uid(), name: 'Leila Voss', notes: '20s. Mara\'s daughter. Improviser, community-minded, tired of being cut off mid-sentence.' },
    ],
    stages,
    scenes,
  }
}
