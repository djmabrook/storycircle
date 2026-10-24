import Anthropic from '@anthropic-ai/sdk'
import type { Project, Scene } from '../types'
import { fmt, fmtMinutes, hourLoad, mirrorOf, payoffsTo, rangeLabel, sceneTime, setupsFrom, timeline } from '../clock'

export type AssistKind = 'draft' | 'rewrite' | 'review' | 'ideas' | 'beats' | 'ask'
export type ProviderId = 'anthropic' | 'claude-app' | 'claude-code' | 'demo'

export const DRAFT_MODEL = 'claude-opus-5-5'
export const REVIEW_MODEL = 'claude-haiku-5-5'

export interface AssistRequest {
  kind: AssistKind
  project: Project
  stageIndex: number
  sceneId?: string | null
  instruction?: string
  selection?: string
  focus?: string
}

export interface AssistOptions {
  onText: (text: string) => void
  signal: AbortSignal
}

// ---------- Settings ----------

const KEY_STORE = 'storyclock.apiKey'

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k)
    else localStorage.removeItem(KEY_STORE)
  } catch {
    /* ignore */
  }
}

type SampleFn = ((input: { role: 'user' | 'assistant'; content: string }[], opts: unknown) => Promise<{ text: string }>) | null
type ClaudeHost = { use: (name: string) => Promise<unknown> }

let samplePromise: Promise<SampleFn> | null = null
/** When the page runs as a claude.ai Artifact, the viewer's own Claude can answer. */
function hostSample(): Promise<SampleFn> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (!host?.use) return Promise.resolve(null)
  samplePromise ??= host.use('sample').then((s) => (s as SampleFn) ?? null).catch(() => null)
  return samplePromise
}

// ---------- Claude Code (desktop) ----------

const USE_CC = 'storyclock.useClaudeCode'
const isTauri = () => '__TAURI_INTERNALS__' in window

/** Whether the writer wants the desktop app to use Claude Code when it's installed (default yes). */
export function getUseClaudeCode(): boolean {
  try {
    return localStorage.getItem(USE_CC) !== 'off'
  } catch {
    return true
  }
}

export function setUseClaudeCode(on: boolean) {
  try {
    localStorage.setItem(USE_CC, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
}

let ccPath: Promise<string | null> | null = null
/** Path of the writer's Claude Code install, when this is the desktop app and it's found. */
export function claudeCodePath(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null)
  ccPath ??= import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<string | null>('claude_code_path'))
    .catch(() => null)
  return ccPath
}

export async function activeProvider(): Promise<ProviderId> {
  // Inside Claude the viewer's own account answers. The desktop app prefers the
  // writer's Claude Code (their subscription), then an API key.
  if (await hostSample()) return 'claude-app'
  if (getUseClaudeCode() && (await claudeCodePath())) return 'claude-code'
  if (getApiKey()) return 'anthropic'
  return 'demo'
}

export const providerLabel: Record<ProviderId, string> = {
  anthropic: 'Claude API',
  'claude-app': 'Your Claude account',
  'claude-code': 'Claude Code on this computer',
  demo: 'Demo mode (no key set)',
}

// ---------- Context assembly ----------

function sceneBrief(sc: Scene, withDraft: boolean) {
  const lines = [
    `Title: ${sc.title}`,
    sc.heading && `Heading: ${sc.heading}`,
    sc.purpose && `What the scene contributes: ${sc.purpose}`,
    sc.attempt && `What someone attempts: ${sc.attempt}`,
    sc.resistance && `Resistance or complication: ${sc.resistance}`,
    sc.turn && `Turn or ending condition: ${sc.turn}`,
    sc.beats.length > 0 && `Beat slices:\n${sc.beats.map((b) => `- ${b.text}`).join('\n')}`,
    withDraft && sc.draft.trim() && `Current accepted draft:\n<draft>\n${sc.draft}\n</draft>`,
  ]
  return lines.filter(Boolean).join('\n')
}

/** Where a scene sits in time and what it is threaded to. */
function sceneThreads(p: Project, sc: Scene) {
  const t = sceneTime(p, sc)
  const start = timeline(p).start[sc.id] ?? 0
  const title = (id: string) => p.scenes[id]?.title ?? 'missing scene'
  return [
    `Screen time: about ${fmtMinutes(t.minutes)}, starting near ${fmt(start)} of a ${p.runtime}-minute film.`,
    ...setupsFrom(p, sc.id).map((c) => `Sets up "${title(c.to)}"${c.note ? `: ${c.note}` : ''}`),
    ...payoffsTo(p, sc.id).map((c) => `Pays off "${title(c.from)}"${c.note ? `: ${c.note}` : ''}`),
  ].join('\n')
}

function orderedScenes(p: Project) {
  return p.stages.flatMap((st) => st.sceneIds.map((id) => ({ stage: st, scene: p.scenes[id] })))
}

function projectContext(p: Project) {
  return [
    `Project: ${p.title}`,
    `Logline: ${p.logline}`,
    p.theme && `Thematic question: ${p.theme}`,
    p.tone && `Tone: ${p.tone}`,
    `Characters:\n${p.characters.map((c) => `- ${c.name}: ${c.notes}`).join('\n')}`,
    `Story Clock, ${p.runtime}-minute runtime, twelve hours of about ${fmtMinutes(p.runtime / 12)} each (writer's current notes; hours may be partial, empty or intentionally unusual):\n${p.stages
      .map((s, i) => `${s.name} o'clock (${rangeLabel(p, i)}), ${s.sceneIds.length} scene${s.sceneIds.length === 1 ? '' : 's'}: ${s.idea || '(open)'}`)
      .join('\n')}`,
    p.connections.length > 0 &&
      `Threads (setups and payoffs across the clock):\n${p.connections
        .map((c) => `- "${p.scenes[c.from]?.title}" sets up "${p.scenes[c.to]?.title}"${c.note ? `: ${c.note}` : ''}`)
        .join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function neighbours(p: Project, sceneId: string) {
  const all = orderedScenes(p)
  const i = all.findIndex((x) => x.scene.id === sceneId)
  const pick = (j: number, label: string) => {
    const x = all[j]
    if (!x) return ''
    const tail = x.scene.draft.trim() ? `\nEnds with:\n${x.scene.draft.trim().slice(-700)}` : ''
    return `${label} (${x.stage.name} o'clock): ${x.scene.title}. ${x.scene.purpose}${tail}`
  }
  return [pick(i - 1, 'Previous scene'), pick(i + 1, 'Next scene')].filter(Boolean).join('\n\n')
}

const SYSTEM_WRITER = `You are the writing collaborator inside StoryClock, a screenwriting app organised around Seth Worley's Storyclock, where the clock face is the film's runtime and the writer looks for gaps, pacing and symmetry: moments set up at one time that pay off at another. The writer owns the story; you turn their intentions and raw beat material into workable screenplay pages they will revise directly.

Write in Fountain screenplay format: scene headings (INT./EXT.), action, CHARACTER cues in caps, parentheticals, dialogue. Dramatise through behaviour and dialogue rather than restating the outline. Preserve established facts, character knowledge and continuity from the context. Give each speaker a distinct aim and voice, and let subtext carry what the notes state plainly.

If a missing detail would materially change the scene, make a visibly provisional choice and mark it with a Fountain note like [[Assumed: ...]]. Return only the screenplay text, with no preamble.`

const SYSTEM_REVIEW = `You are a script reader inside StoryClock, a screenwriting app organised around Seth Worley's Storyclock, where the clock face is the film's runtime and the writer looks for gaps, pacing and symmetry: moments set up at one time that pay off at another. Give focused, specific feedback the writer can act on. Do not rewrite the scene and do not give scores.

For each finding: quote or point to the exact passage, explain the possible issue, and offer a question or revision direction. Treat the clock as a lens, not a rule; notice setups that never pay off and payoffs that were never planted; respect deliberate exceptions and distinctive voice. Keep it to the 3 to 6 findings that matter most, most important first. Format each as:
**Short title**
> quoted passage
Observation and suggestion.`

const SYSTEM_IDEAS = `You are a story-development collaborator inside StoryClock, a screenwriting app built on Seth Worley's Storyclock, where the clock face is the film's runtime and the writer looks for gaps, pacing and symmetry: moments set up at one time that pay off at another. Propose concrete scenes for one hour of the clock in this specific story. Fill gaps from material the story already has rather than inventing unrelated subplots: favour scenes that plant something a later hour can pay off, or pay off something planted earlier. Favour scenes driven by a character's choice with a visible consequence. Respond with only a JSON array of 3 objects: {"title": string, "heading": string, "purpose": string, "beats": string[]}.`

export function buildPrompt(r: AssistRequest): { system: string; user: string; model: string } {
  const p = r.project
  const st = p.stages[r.stageIndex]
  const sc = r.sceneId ? p.scenes[r.sceneId] : undefined
  const ctx = projectContext(p)
  const load = hourLoad(p, r.stageIndex)
  const across = p.stages[mirrorOf(r.stageIndex)]
  const stageLine = [
    `Focused hour: ${st.name} o'clock (${rangeLabel(p, r.stageIndex)}) — ${st.question}`,
    `Writer's idea for this hour: ${st.idea || '(open)'}`,
    `Estimated time used: ${fmtMinutes(load.used)} of ${fmtMinutes(load.slot)}.`,
    `Across the clock (${across.name}): ${across.sceneIds.map((id) => p.scenes[id].title).join(', ') || '(empty)'}. Threads can land anywhere, not only here.`,
    sc && sceneThreads(p, sc),
  ]
    .filter(Boolean)
    .join('\n')

  switch (r.kind) {
    case 'draft':
      return {
        model: DRAFT_MODEL,
        system: SYSTEM_WRITER,
        user: `${ctx}\n\n${stageLine}\n\n${sc ? neighbours(p, sc.id) : ''}\n\nScene to draft:\n${sc ? sceneBrief(sc, false) : ''}\n\n${
          sc?.draft.trim() ? `The writer has an existing draft; write a fresh first draft as an alternative.\n` : ''
        }${r.instruction ? `Writer's direction: ${r.instruction}\n` : ''}Write the scene.`,
      }
    case 'rewrite':
      return {
        model: DRAFT_MODEL,
        system: SYSTEM_WRITER,
        user: `${ctx}\n\n${stageLine}\n\nScene:\n${sc ? sceneBrief(sc, true) : ''}\n\n${
          r.selection
            ? `Rewrite only this passage, keeping everything else intact. Return only the replacement passage.\n<passage>\n${r.selection}\n</passage>`
            : 'Rewrite the whole scene. Keep lines and moments that already work.'
        }\n\nWriter's direction: ${r.instruction || 'Tighten it and sharpen the subtext.'}`,
      }
    case 'review':
      return {
        model: REVIEW_MODEL,
        system: SYSTEM_REVIEW,
        user: `${ctx}\n\n${stageLine}\n\n${sc ? neighbours(p, sc.id) : ''}\n\nScene under review:\n${sc ? sceneBrief(sc, true) : ''}\n\nReview focus: ${
          r.focus || 'Story structure and causality'
        }${r.instruction ? `\nWriter's question: ${r.instruction}` : ''}`,
      }
    case 'ideas':
      return {
        model: DRAFT_MODEL,
        system: SYSTEM_IDEAS,
        user: `${ctx}\n\n${stageLine}\n\nExisting scenes in this hour:\n${
          st.sceneIds.map((id) => `- ${p.scenes[id].title}: ${p.scenes[id].purpose}`).join('\n') || '(none)'
        }\n\n${r.instruction ? `Writer's direction: ${r.instruction}\n` : ''}Propose three new scenes for this hour, each fitting its time.`,
      }
    case 'beats':
      return {
        model: DRAFT_MODEL,
        system: `You are a story-development collaborator inside StoryClock, a screenwriting app built on Seth Worley's Storyclock, where the clock face is the film's runtime and the writer looks for gaps, pacing and symmetry: moments set up at one time that pay off at another. Propose beat slices for one scene: concrete actions, lines of dialogue, images or facts the scene could contain, each under 20 words, in story order. Respond with only a JSON array of 5 strings.`,
        user: `${ctx}\n\n${stageLine}\n\n${sc ? neighbours(p, sc.id) : ''}\n\nScene:\n${sc ? sceneBrief(sc, false) : ''}\n\n${r.instruction ? `Writer's direction: ${r.instruction}\n` : ''}Propose five new beat slices that build on the existing ones without repeating them.`,
      }
    case 'ask':
    default:
      return {
        model: DRAFT_MODEL,
        system: `You are the writing collaborator inside StoryClock, a screenwriting app built on Seth Worley's Storyclock, where the clock face is the film's runtime and the writer looks for gaps, pacing and symmetry: moments set up at one time that pay off at another. Answer the writer's question about their story concisely and concretely. The writer decides; offer options rather than verdicts.`,
        user: `${ctx}\n\n${stageLine}\n\n${sc ? `Open scene:\n${sceneBrief(sc, true)}\n\n` : ''}Question: ${r.instruction}`,
      }
  }
}

// ---------- Providers ----------

async function viaApi(r: AssistRequest, o: AssistOptions): Promise<string> {
  const { system, user, model } = buildPrompt(r)
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true })
  const isOpus = model === DRAFT_MODEL
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: r.kind === 'review' || r.kind === 'ask' ? 'medium' : 'high' },
      // Route safety-classifier refusals to a fallback model instead of failing the draft.
      ...(isOpus ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    { signal: o.signal },
  )
  stream.on('text', (_delta, snapshot) => o.onText(snapshot))
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing the direction.')
  return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

async function viaHost(r: AssistRequest, o: AssistOptions): Promise<string> {
  const sample = await hostSample()
  if (!sample) throw new Error('Claude is not available in this view.')
  const { system, user } = buildPrompt(r)
  const res = await sample([{ role: 'user', content: `${system}\n\n---\n\n${user}` }], {
    onText: ({ text }: { text: string }) => o.onText(text),
    signal: o.signal,
    modelTier: r.kind === 'review' ? 'quick' : 'complex',
    // The brief specifies Haiku 5.5 for reviews; the host falls back to the tier if it can't serve it.
    ...(r.kind === 'review' ? { model: REVIEW_MODEL } : {}),
    cache: false,
  })
  return res.text
}

/** Claude Code takes model aliases, which follow whatever the writer's plan offers. */
const CC_MODEL = (model: string) => (model === REVIEW_MODEL ? 'haiku' : 'opus')

async function viaClaudeCode(r: AssistRequest, o: AssistOptions): Promise<string> {
  const { invoke, Channel } = await import('@tauri-apps/api/core')
  const { system, user, model } = buildPrompt(r)
  const id = Math.random().toString(36).slice(2)
  let text = ''
  let result: { text: string; error: boolean } | null = null
  const lines = new Channel<string>()
  lines.onmessage = (line) => {
    let ev: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } }; is_error?: boolean; result?: string }
    try {
      ev = JSON.parse(line)
    } catch {
      return
    }
    if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
      text += ev.event.delta.text ?? ''
      o.onText(text)
    } else if (ev.type === 'result') result = { text: ev.result ?? '', error: !!ev.is_error }
  }
  const stop = () => void invoke('claude_code_cancel', { id })
  o.signal.addEventListener('abort', stop)
  try {
    await invoke('claude_code_run', { id, prompt: user, system, model: CC_MODEL(model), onLine: lines })
  } catch (e) {
    if (o.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error(`Claude Code: ${e}`)
  } finally {
    o.signal.removeEventListener('abort', stop)
  }
  if (o.signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const done = result as { text: string; error: boolean } | null
  // Not signed in, out of usage, and similar arrive as an error result with a readable message.
  if (done?.error) throw new Error(`Claude Code: ${done.text || 'the request failed.'}`)
  return done?.text || text
}

const DEMO: Record<AssistKind, string> = {
  draft: `INT. HILLTOP STATION - NIGHT

The generator thuds like a bad heart. A wall map, sun-bleached, curls at one corner: HALVERN COUNTY 1998.

Mara taps the map with a pencil, decisive.

MARA
Bridge Road to the Quarry turnoff. That's the high ground.

LEILA
(not looking up from the CB)
That map's older than me. They moved the levee in 2011.

MARA
The roads didn't move.

LEILA
The water did.

Mara keys the transmitter. A beat. She hears herself breathe on the monitor.

MARA
(into mic, warm, certain)
Rescue Two, this is KVLR. Take Bridge Road to the Quarry turnoff.

Leila finally looks at her. Mara doesn't look back.

[[Assumed: the levee was moved in 2011. Confirm against your research notes.]]`,
  rewrite: `MARA
(into mic, a fraction too fast)
Rescue Two, KVLR. Bridge Road to the Quarry turnoff. Confirm.`,
  review: `**The warning lands too cleanly**
> That map's older than me. They moved the levee in 2011.
Leila states the whole problem in one line, so Mara's choice reads as stubbornness rather than a real dilemma. Could Leila be less sure, or could Mara have a reason the old map feels safer?

**Mara's need to sound certain is told, not shown**
> (into mic, warm, certain)
The parenthetical does the work. What small behaviour earlier in the scene shows Mara rehearsing certainty?

**The cost belongs to someone we know**
The stranded vehicle is anonymous. Is there a caller from the Search scenes who could be in it, so Take costs Mara something personal?`,
  ideas: `[{"title":"Leila's map","heading":"INT. HILLTOP STATION - NIGHT","purpose":"Leila builds a live map from caller reports and Mara refuses to look at it.","beats":["Sticky notes cover the window glass","Mara turns her chair away"]},{"title":"The unverified caller","heading":"INT. HILLTOP STATION - LATER","purpose":"A child calls in a sighting Mara won't broadcast without proof.","beats":["Leila puts the child on air herself","Mara cuts the feed"]},{"title":"Generator fails","heading":"EXT. HILLTOP STATION - NIGHT","purpose":"In the dark, Mara has to trust Leila's hands on the wiring.","beats":["Rain, a flashlight in Mara's teeth","Leila talks her through it"]}]`,
  beats: `["Mara rehearses the route under her breath before keying the mic","Leila pins a caller's sketch of the flooded underpass to the wall","The generator stutters; every light in the room dims at once","Mara: 'Certainty is the service. Doubt is static.'","Leila quietly writes the levee date on the map in red marker"]`,
  ask: `Two options to consider. First, keep Mara's motive as pride, and make the cost land on someone she personally vouched for earlier. Second, shift it to panic: she grabs the old map because it's the only thing in the room she understands. The second makes the 9–10 correction easier to earn, since correcting herself becomes an act of steadiness rather than humility.`,
}

async function viaDemo(r: AssistRequest, o: AssistOptions): Promise<string> {
  const full = DEMO[r.kind]
  let shown = ''
  for (const word of full.split(/(\s+)/)) {
    if (o.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    shown += word
    o.onText(shown)
    await new Promise((res) => setTimeout(res, 12))
  }
  return full
}

export async function runAssist(r: AssistRequest, o: AssistOptions): Promise<{ text: string; provider: ProviderId }> {
  const provider = await activeProvider()
  const fn = provider === 'anthropic' ? viaApi : provider === 'claude-app' ? viaHost : provider === 'claude-code' ? viaClaudeCode : viaDemo
  return { text: await fn(r, o), provider }
}

export interface SceneIdea {
  title: string
  heading: string
  purpose: string
  beats: string[]
}

export function parseBeats(text: string): string[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0]) as unknown[]
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function parseIdeas(text: string): SceneIdea[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0]) as SceneIdea[]
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.title === 'string') : []
  } catch {
    return []
  }
}
