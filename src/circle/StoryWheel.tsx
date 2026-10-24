import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import type { Project } from '../types'
import { N, R, arcLength, layout, nearest, polar, sceneCenter, sector, textArc, wrap } from './geometry'
import { mirrorOf, rangeLabel } from '../clock'

/** One hue per hour, grouped by quarter: cool dawn, warm day, rose dusk, deep night. */
export const HUES = [200, 186, 170, 48, 36, 22, 352, 336, 318, 268, 246, 222]
const ZOOM_MIN = 1
const ZOOM_MAX = 14
const SCENE_ZOOM = 2.4

export interface Needle {
  stage: number
  sceneId: string | null
  zoom: number
}

export interface WheelHandle {
  goToStage: (i: number, zoom?: number) => void
  goToScene: (id: string) => void
  zoomOut: () => void
}

interface Props {
  project: Project
  openSceneId: string | null
  onNeedle: (n: Needle) => void
  onOpenScene: (id: string) => void
  /** Press and hold a scene, then drag: drops it into `stage` at position `index`. */
  onMoveScene?: (id: string, stage: number, index: number) => void
  handle?: Ref<WheelHandle>
  /** Set when panels sit on top; the wheel recedes but stays interactive. */
  faded?: boolean
  children?: React.ReactNode
}

export function StoryWheel({ project, openSceneId, onNeedle, onOpenScene, onMoveScene, handle, faded, children }: Props) {
  const [view, setView] = useState({ pos: 0, zoom: 1 })
  const target = useRef({ pos: 0, zoom: 1 })
  const viewRef = useRef(view)
  const idle = useRef<number | undefined>(undefined)
  const raf = useRef<number | undefined>(undefined)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const reduceMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  const counts = project.stages.map((s) => s.sceneIds.length)

  const tick = useCallback(() => {
    const v = viewRef.current
    const t = target.current
    const k = reduceMotion ? 1 : 0.22
    const pos = v.pos + (t.pos - v.pos) * k
    const zoom = v.zoom + (t.zoom - v.zoom) * k
    const done = Math.abs(t.pos - pos) < 0.0005 && Math.abs(t.zoom - zoom) < 0.001
    const next = done ? { ...t } : { pos, zoom }
    viewRef.current = next
    setView(next)
    raf.current = done ? undefined : requestAnimationFrame(tick)
  }, [reduceMotion])

  const kick = useCallback(() => {
    if (raf.current === undefined) raf.current = requestAnimationFrame(tick)
  }, [tick])

  /** Snap to the nearest stage centre when zoomed out, nearest scene centre when zoomed in. */
  const snapTarget = useCallback(
    (pos: number, zoom: number) => {
      const p = wrap(pos + 0.5) - 0.5
      const i = Math.min(N - 1, Math.max(0, Math.floor(p + 0.5)))
      const n = counts[i]
      if (zoom < SCENE_ZOOM || n === 0) return nearest(pos, i)
      const k = Math.min(n - 1, Math.max(0, Math.floor((p - (i - 0.5)) * n)))
      return nearest(pos, sceneCenter(i, k, n))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts.join(',')],
  )

  const scheduleSnap = useCallback(() => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => {
      target.current.pos = snapTarget(target.current.pos, target.current.zoom)
      kick()
    }, 170)
  }, [snapTarget, kick])

  const focusWidth = () => {
    const L = layout(target.current.pos, target.current.zoom)
    return L.width[L.focus]
  }

  const rotateBy = useCallback(
    (deg: number) => {
      target.current.pos += deg / focusWidth()
      kick()
      scheduleSnap()
    },
    [kick, scheduleSnap],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      target.current.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target.current.zoom * factor))
      kick()
      scheduleSnap()
    },
    [kick, scheduleSnap],
  )

  useImperativeHandle(handle, () => ({
    goToStage: (i, zoom = 5) => {
      target.current = { pos: nearest(target.current.pos, i), zoom }
      kick()
    },
    goToScene: (id) => {
      const i = project.stages.findIndex((s) => s.sceneIds.includes(id))
      if (i < 0) return
      const st = project.stages[i]
      const k = st.sceneIds.indexOf(id)
      target.current = { pos: nearest(target.current.pos, sceneCenter(i, k, st.sceneIds.length)), zoom: Math.max(target.current.zoom, 7) }
      kick()
    },
    zoomOut: () => {
      target.current = { pos: snapTarget(target.current.pos, 1), zoom: 1 }
      kick()
    },
  }))

  // Trackpad: two-finger scroll twirls, pinch (ctrl+wheel) zooms. Safari/WKWebView
  // (Tauri on macOS) also delivers true two-finger rotate via gesture events.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        zoomBy(Math.exp(-e.deltaY * 0.012))
        return
      }
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const scale = e.deltaMode === 1 ? 16 : 1
      rotateBy(d * scale * 0.22)
    }
    let lastRot = 0
    let baseZoom = 1
    type GestureEvt = Event & { rotation: number; scale: number }
    const onGStart = (e: Event) => {
      e.preventDefault()
      lastRot = (e as GestureEvt).rotation
      baseZoom = target.current.zoom
    }
    const onGChange = (e: Event) => {
      e.preventDefault()
      const g = e as GestureEvt
      const dr = g.rotation - lastRot
      lastRot = g.rotation
      target.current.pos -= dr / focusWidth()
      target.current.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, baseZoom * g.scale))
      kick()
      scheduleSnap()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGStart)
    el.addEventListener('gesturechange', onGChange)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGStart)
      el.removeEventListener('gesturechange', onGChange)
    }
  }, [rotateBy, zoomBy, kick, scheduleSnap])

  // Drag around the centre to spin, for mouse and touch.
  // Press and hold a scene to lift it; dragging then moves the scene instead of spinning the wheel.
  const drag = useRef<{ id: number; angle: number; moved: number; hit: string | null; hold?: number } | null>(null)
  const [lift, setLift] = useState<{ id: string; stage: number; index: number } | null>(null)
  const liftRef = useRef(lift)
  liftRef.current = lift
  const angleAt = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
  }
  /** The hour under an angle on the wheel as drawn, and the gap between scenes nearest to it. */
  const slotAt = (a: number, movingId: string) => {
    const V = viewRef.current
    const Lv = layout(V.pos, V.zoom)
    for (let i = 0; i < N; i++) {
      const rel = (((a - (Lv.start[i] + Lv.offset)) % 360) + 360) % 360
      if (rel >= Lv.width[i]) continue
      const n = project.stages[i].sceneIds.length
      return { stage: i, index: Math.round((rel / Lv.width[i]) * n), id: movingId }
    }
    return null
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-hub]')) return
    const hit = (e.target as Element).closest('[data-hit]')?.getAttribute('data-hit') ?? null
    const d: NonNullable<typeof drag.current> = { id: e.pointerId, angle: angleAt(e), moved: 0, hit }
    if (onMoveScene && hit?.startsWith('scene:')) {
      const sceneId = hit.slice(6)
      const a = d.angle
      d.hold = window.setTimeout(() => {
        if (drag.current !== d || d.moved > 2) return
        setLift(slotAt(a, sceneId))
        navigator.vibrate?.(10)
      }, 380)
    }
    drag.current = d
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const a = angleAt(e)
    const lifted = liftRef.current
    if (lifted) {
      const slot = slotAt(a, lifted.id)
      if (slot && (slot.stage !== lifted.stage || slot.index !== lifted.index)) setLift(slot)
      return
    }
    let da = a - d.angle
    if (da > 180) da -= 360
    if (da < -180) da += 360
    d.angle = a
    d.moved += Math.abs(da)
    if (d.moved > 2) {
      target.current.pos -= da / focusWidth()
      kick()
      scheduleSnap()
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    window.clearTimeout(d?.hold)
    const lifted = liftRef.current
    if (lifted) {
      setLift(null)
      onMoveScene?.(lifted.id, lifted.stage, lifted.index)
      return
    }
    if (!d || d.moved > 2 || !d.hit) return
    void e
    const [kind, value] = d.hit.split(':')
    if (kind === 'stage') {
      const i = Number(value)
      target.current = { pos: nearest(target.current.pos, i), zoom: Math.max(5, target.current.zoom) }
      kick()
    } else if (kind === 'scene') {
      const i = project.stages.findIndex((s) => s.sceneIds.includes(value))
      const st = project.stages[i]
      const k = st.sceneIds.indexOf(value)
      target.current = { pos: nearest(target.current.pos, sceneCenter(i, k, st.sceneIds.length)), zoom: Math.max(7, target.current.zoom) }
      kick()
      onOpenScene(value)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const L = layout(target.current.pos, target.current.zoom)
    const n = counts[L.focus]
    const zoomed = target.current.zoom >= SCENE_ZOOM && n > 0
    const step = (dir: number) => {
      if (zoomed) {
        const k = Math.min(n - 1, Math.max(0, Math.floor(L.frac * n)))
        const nk = k + dir
        if (nk >= 0 && nk < n) target.current.pos = nearest(target.current.pos, sceneCenter(L.focus, nk, n))
        else {
          const ni = (L.focus + dir + N) % N
          const nn = counts[ni]
          target.current.pos = nearest(target.current.pos, sceneCenter(ni, dir > 0 ? 0 : Math.max(0, nn - 1), nn))
        }
      } else target.current.pos = nearest(target.current.pos, Math.round(wrap(target.current.pos)) + dir)
      kick()
    }
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') zoomBy(1.5)
    else if (e.key === 'ArrowDown' || e.key === '-') zoomBy(1 / 1.5)
    else if (e.key === 'Escape' && liftRef.current) setLift(null)
    else if (e.key === 'Escape') {
      target.current = { pos: snapTarget(target.current.pos, 1), zoom: 1 }
      kick()
    } else if (e.key === 'Enter' && needle.sceneId) onOpenScene(needle.sceneId)
    else return
    e.preventDefault()
  }

  const L = layout(view.pos, view.zoom)
  const focusStage = project.stages[L.focus]
  const fn = focusStage.sceneIds.length
  const needleScene =
    view.zoom >= SCENE_ZOOM * 0.85 && fn > 0 ? focusStage.sceneIds[Math.min(fn - 1, Math.max(0, Math.floor(L.frac * fn)))] : null
  const needle: Needle = { stage: L.focus, sceneId: needleScene, zoom: view.zoom }

  const lastNeedle = useRef('')
  useEffect(() => {
    const key = `${needle.stage}|${needle.sceneId}|${needle.zoom >= SCENE_ZOOM}`
    if (key !== lastNeedle.current) {
      lastNeedle.current = key
      onNeedle(needle)
    }
  })

  // Quarter lines sit where hours 12–1, 3–4, 6–7 and 9–10 begin: the 12, 3, 6 and 9 o'clock marks.
  const quarters = [0, 3, 6, 9].map((i) => ({ label: i === 0 ? '12' : String(i), a: L.start[i] + L.offset }))

  /** Angle of a scene's centre on the current layout. */
  const sceneAngle = (id: string) => {
    const i = project.stages.findIndex((s) => s.sceneIds.includes(id))
    if (i < 0) return null
    const ids = project.stages[i].sceneIds
    return L.start[i] + L.offset + (L.width[i] * (ids.indexOf(id) + 0.5)) / ids.length
  }
  const focusIds = new Set(focusStage.sceneIds)
  const mirror = mirrorOf(L.focus)

  return (
    <div
      className={`wheel${faded ? ' faded' : ''}${lift ? ' lifting' : ''}`}
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label="Story Clock. Scroll or drag to rotate, pinch or use up and down arrows to zoom, Enter to open the scene under the needle."
      onKeyDown={onKeyDown}
    >
      <svg
        ref={svgRef}
        viewBox="-360 -360 720 720"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          window.clearTimeout(drag.current?.hold)
          drag.current = null
          setLift(null)
        }}
      >
        <circle r={R.rim + 6} className="rim" />
        {project.stages.map((st, i) => {
          const a0 = L.start[i] + L.offset
          const a1 = a0 + L.width[i]
          const focused = i === L.focus
          const n = st.sceneIds.length
          const stageLabelR = (R.stageIn + R.stageOut) / 2
          const labelRoom = arcLength(stageLabelR, L.width[i])
          return (
            <g key={st.key} style={{ ['--h' as string]: HUES[i] }} className={`stage world-${st.world}${focused ? ' focused' : ''}${i === mirror && !focused ? ' mirror' : ''}`}>
              <path d={sector(R.stageIn, R.stageOut, a0, a1)} className="stage-cell" data-hit={`stage:${i}`} />
              <path id={`sl-${i}`} d={textArc(stageLabelR, a0 + 1, a1 - 1)} fill="none" stroke="none" />
              <text className="stage-label" dominantBaseline="middle" pointerEvents="none">
                <textPath href={`#sl-${i}`} startOffset="50%" textAnchor="middle">
                  {labelRoom > 170 ? `${st.name}  ·  ${rangeLabel(project, i)}` : labelRoom > 44 ? st.name : ''}
                </textPath>
              </text>
              {n === 0 && (
                <path d={sector(R.sceneIn, R.sceneOut, a0 + 0.4, a1 - 0.4)} className="scene-empty" data-hit={`stage:${i}`} />
              )}
              {st.sceneIds.map((id, k) => {
                const sc = project.scenes[id]
                const s0 = a0 + (L.width[i] * k) / n
                const s1 = a0 + (L.width[i] * (k + 1)) / n
                const r = (R.sceneIn + R.sceneOut) / 2
                const room = arcLength(r, s1 - s0)
                const label = sc.title.length * 6.4 < room - 12 ? sc.title : room > 60 ? sc.title.slice(0, Math.floor((room - 20) / 6.4)) + '…' : ''
                const cls = ['scene-cell', sc.draft.trim() ? 'drafted' : '', id === openSceneId ? 'open' : '', id === needleScene ? 'under' : '', id === lift?.id ? 'lifting' : '']
                return (
                  <g key={id}>
                    <path d={sector(R.sceneIn, R.sceneOut, s0 + 0.4, s1 - 0.4)} className={cls.join(' ')} data-hit={`scene:${id}`} />
                    <path id={`sc-${id}`} d={textArc(r, s0 + 0.5, s1 - 0.5)} fill="none" stroke="none" />
                    {label && (
                      <text className="scene-label" dominantBaseline="middle" pointerEvents="none">
                        <textPath href={`#sc-${id}`} startOffset="50%" textAnchor="middle">
                          {label}
                        </textPath>
                      </text>
                    )}
                    {room > 260 && sc.purpose && (
                      <>
                        <path id={`sp-${id}`} d={textArc(r - 30, s0 + 0.5, s1 - 0.5)} fill="none" stroke="none" />
                        <text className="scene-purpose" dominantBaseline="middle" pointerEvents="none">
                          <textPath href={`#sp-${id}`} startOffset="50%" textAnchor="middle">
                            {sc.purpose.length * 5.6 < arcLength(r - 30, s1 - s0) - 30 ? sc.purpose : sc.purpose.slice(0, Math.floor((arcLength(r - 30, s1 - s0) - 40) / 5.6)) + '…'}
                          </textPath>
                        </text>
                      </>
                    )}
                    {project.connections.some((c) => c.from === id || c.to === id) && room > 30 && (
                      <circle cx={polar(R.sceneOut - 12, (s0 + s1) / 2)[0]} cy={polar(R.sceneOut - 12, (s0 + s1) / 2)[1]} r={3.5} className="serves-dot" pointerEvents="none" />
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
        {quarters.map(({ label, a }) => {
          // Full quarter lines read as the clock's act marks when zoomed out; ticks only once a slice opens.
          const [x0, y0] = polar(view.zoom < 1.6 ? R.hub + 2 : R.sceneOut + 2, a)
          const [x1, y1] = polar(R.rim + 4, a)
          const [tx, ty] = polar(R.rim + 16, a)
          return (
            <g key={label} pointerEvents="none">
              <line x1={x0} y1={y0} x2={x1} y2={y1} className="threshold" />
              <text x={tx} y={ty} className="quarter-label" textAnchor="middle" dominantBaseline="middle">{label}</text>
            </g>
          )
        })}
        <g className="threads" pointerEvents="none">
          {project.connections.map((c) => {
            const a0 = sceneAngle(c.from)
            const a1 = sceneAngle(c.to)
            if (a0 === null || a1 === null) return null
            // Threads leave from the seam between hours and scenes and bow inward with distance in time,
            // so near threads stay over the hour ring and far ones cross under the hub.
            let sep = Math.abs(a1 - a0) % 360
            if (sep > 180) sep = 360 - sep
            const mid = Math.abs(a1 - a0) > 180 ? (a0 + a1) / 2 + 180 : (a0 + a1) / 2
            const r = R.stageOut + 3
            const [x0, y0] = polar(r, a0)
            const [x1, y1] = polar(r, a1)
            const [cx, cy] = polar(r * Math.max(0, 1 - sep / 140), mid)
            const hot = focusIds.has(c.from) || focusIds.has(c.to) || c.from === needleScene || c.to === needleScene
            return (
              <g key={c.id} className={`thread${hot ? ' hot' : ''}`}>
                <path d={`M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`} />
                <circle cx={x0} cy={y0} r={3} className="thread-from" />
                <circle cx={x1} cy={y1} r={3.5} className="thread-to" />
              </g>
            )
          })}
        </g>
        {lift && (() => {
          // Drop marker: a bright seam where the scene will land, and the hour it lands in.
          const ids = project.stages[lift.stage].sceneIds
          const a0 = L.start[lift.stage] + L.offset
          const a = ids.length ? a0 + (L.width[lift.stage] * lift.index) / ids.length : a0 + L.width[lift.stage] / 2
          const [x0, y0] = polar(R.sceneIn - 2, a)
          const [x1, y1] = polar(R.sceneOut + 4, a)
          const [tx, ty] = polar(R.sceneOut + 18, a)
          return (
            <g className="drop-mark" pointerEvents="none" style={{ ['--h' as string]: HUES[lift.stage] }}>
              <path d={sector(R.stageIn, R.stageOut, a0, a0 + L.width[lift.stage])} className="drop-hour" />
              <line x1={x0} y1={y0} x2={x1} y2={y1} />
              <circle cx={tx} cy={ty} r={4} />
            </g>
          )
        })()}
        <path d={`M-9 ${-R.rim - 22} L9 ${-R.rim - 22} L0 ${-R.sceneOut - 2} Z`} className="needle" pointerEvents="none" />
      </svg>
      <div className="hub" data-hub>
        {children}
      </div>
    </div>
  )
}
