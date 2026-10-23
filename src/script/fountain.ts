/** A small Fountain reader/writer for the element types the editor supports. */

export type ElementType = 'heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition'

export interface El {
  id: string
  type: ElementType
  text: string
}

let n = 0
export const elId = () => `e${Date.now().toString(36)}${(n++).toString(36)}`

const HEADING = /^(\.(?!\.)|(INT|EXT|EST|INT\.?\/EXT|I\/E)[ .])/i
const isUpper = (s: string) => s === s.toUpperCase() && /[A-Z]/.test(s)
const isTransition = (s: string) => s.startsWith('>') ? !s.endsWith('<') : isUpper(s) && /TO:$/.test(s.trim())

export function parse(src: string): El[] {
  const out: El[] = []
  const blocks = src.replace(/\r/g, '').split(/\n\s*\n/)
  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, '')
    if (!block.trim()) continue
    const lines = block.split('\n')
    const first = lines[0].trim()
    if (lines.length === 1 && HEADING.test(first)) {
      out.push({ id: elId(), type: 'heading', text: first.replace(/^\./, '') })
      continue
    }
    if (lines.length === 1 && isTransition(first)) {
      out.push({ id: elId(), type: 'transition', text: first.replace(/^>\s*/, '') })
      continue
    }
    const cue = first.replace(/^@/, '')
    if (lines.length > 1 && (first.startsWith('@') || (isUpper(cue.replace(/\(.*?\)/g, '')) && !HEADING.test(first)))) {
      out.push({ id: elId(), type: 'character', text: cue })
      let dialogue: string[] = []
      const flush = () => {
        if (dialogue.length) out.push({ id: elId(), type: 'dialogue', text: dialogue.join('\n') })
        dialogue = []
      }
      for (const l of lines.slice(1)) {
        const t = l.trim()
        if (/^\(.*\)$/.test(t)) {
          flush()
          out.push({ id: elId(), type: 'parenthetical', text: t.slice(1, -1) })
        } else dialogue.push(t)
      }
      flush()
      continue
    }
    out.push({ id: elId(), type: 'action', text: block.replace(/^!/, '') })
  }
  return out
}

export function serialize(els: El[]): string {
  const parts: string[] = []
  for (let i = 0; i < els.length; i++) {
    const e = els[i]
    const t = e.text.replace(/\s+$/, '')
    if (!t.trim() && e.type !== 'character') continue
    switch (e.type) {
      case 'heading': {
        const h = t.toUpperCase()
        parts.push(HEADING.test(h) ? h : `.${h}`)
        break
      }
      case 'transition': {
        const u = t.toUpperCase()
        parts.push(/TO:$/.test(u) ? u : `> ${u}`)
        break
      }
      case 'character': {
        const lines = [t.trim() ? (/[a-z]/i.test(t) ? t.toUpperCase() : `@${t}`) : '']
        while (els[i + 1] && (els[i + 1].type === 'dialogue' || els[i + 1].type === 'parenthetical')) {
          const d = els[++i]
          const dt = d.text.trim()
          if (dt) lines.push(d.type === 'parenthetical' ? `(${dt.replace(/^\(|\)$/g, '')})` : dt)
        }
        if (!lines[0]) parts.push(...lines.slice(1))
        else if (lines.length === 1) parts.push(`@${lines[0].replace(/^@/, '')}`)
        else parts.push(lines.join('\n'))
        break
      }
      case 'parenthetical':
      case 'dialogue':
        // Orphaned dialogue without a cue is kept as action so nothing is lost.
        parts.push(t)
        break
      default: {
        const a = t
        const looksLikeOther = HEADING.test(a) || (isUpper(a) && !a.includes('\n'))
        parts.push(looksLikeOther ? `!${a}` : a)
      }
    }
  }
  return parts.join('\n\n')
}

/** What Enter creates after an element of this type. */
export const NEXT: Record<ElementType, ElementType> = {
  heading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'heading',
}

/** Tab cycles element types, as in most screenwriting software. */
export const CYCLE: ElementType[] = ['action', 'character', 'dialogue', 'parenthetical', 'transition', 'heading']

export const LABEL: Record<ElementType, string> = {
  heading: 'Scene heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
}

/** Rough page count: industry rule of thumb of ~55 formatted lines per page. */
export function pageEstimate(els: El[]): number {
  let lines = 0
  for (const e of els) {
    const width = e.type === 'dialogue' ? 35 : e.type === 'parenthetical' ? 25 : 60
    const l = e.text.split('\n').reduce((a, s) => a + Math.max(1, Math.ceil(s.length / width)), 0)
    lines += l + (e.type === 'dialogue' || e.type === 'parenthetical' ? 0 : 1)
  }
  return lines / 55
}
