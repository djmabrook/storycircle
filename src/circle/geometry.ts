/** Geometry for the fisheye Story Circle. Angles are in degrees, SVG convention (0 = +x, clockwise). */

export const N = 8
export const R = { hub: 92, stageIn: 98, stageOut: 196, sceneIn: 202, sceneOut: 318, rim: 328 }

export const wrap = (p: number) => ((p % N) + N) % N

export function circDist(a: number, b: number) {
  const d = Math.abs(wrap(a) - wrap(b))
  return Math.min(d, N - d)
}

export interface Layout {
  start: number[]
  width: number[]
  /** Degrees to add to every start so the needle point sits at 12 o'clock. */
  offset: number
  /** Index of the stage under the needle. */
  focus: number
  /** Fractional position inside the focused stage, 0..1. */
  frac: number
}

/**
 * Each stage gets an angular weight that grows with zoom the closer it is to
 * the needle position, so zooming opens the focused slice like a lens.
 */
export function layout(pos: number, zoom: number): Layout {
  const sigma = 0.42
  const w = Array.from({ length: N }, (_, i) => {
    const d = circDist(i, pos)
    return 1 + (zoom - 1) * Math.exp(-(d * d) / (2 * sigma * sigma))
  })
  const total = w.reduce((a, b) => a + b, 0)
  const width = w.map((x) => (360 * x) / total)
  const start: number[] = []
  let acc = 0
  for (let i = 0; i < N; i++) {
    start.push(acc)
    acc += width[i]
  }
  // Stage i spans [i - 0.5, i + 0.5) in position units.
  const p = wrap(pos + 0.5) - 0.5
  const focus = Math.min(N - 1, Math.max(0, Math.floor(p + 0.5)))
  const frac = p - (focus - 0.5)
  const angle = start[focus] + frac * width[focus]
  return { start, width, offset: -90 - angle, focus, frac }
}

/** Position of the centre of scene k of n in stage i. */
export const sceneCenter = (i: number, k: number, n: number) => (n ? i - 0.5 + (k + 0.5) / n : i)

/** Move `target` (wrapped) to the unbounded copy nearest `from`. */
export function nearest(from: number, target: number) {
  let t = from - wrap(from) + wrap(target)
  if (t - from > N / 2) t -= N
  if (from - t > N / 2) t += N
  return t
}

export function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [r * Math.cos(a), r * Math.sin(a)]
}

export function sector(r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0
  const [x0, y0] = polar(r1, a0)
  const [x1, y1] = polar(r1, a1)
  const [x2, y2] = polar(r0, a1)
  const [x3, y3] = polar(r0, a0)
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`
}

/** An arc path for text, reversed on the lower half so labels read upright. */
export function textArc(r: number, a0: number, a1: number) {
  const mid = (((a0 + a1) / 2) % 360 + 360) % 360
  const flip = mid > 0 && mid < 180
  const large = a1 - a0 > 180 ? 1 : 0
  if (!flip) {
    const [x0, y0] = polar(r, a0)
    const [x1, y1] = polar(r, a1)
    return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }
  const [x0, y0] = polar(r, a1)
  const [x1, y1] = polar(r, a0)
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 0 ${x1} ${y1}`
}

export const arcLength = (r: number, deg: number) => (Math.PI * r * deg) / 180
