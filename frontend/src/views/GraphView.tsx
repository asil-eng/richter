import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fmtM, heat, heatRGB, shortName } from '../lib/heat'
import type { RiskModel } from '../lib/types'

// The blast-radius cascade is timed in "hops": each ring of dependents ignites
// HOP_MS after the previous one, and a pulse travels along the import edge that
// carried the shock. Motion uses damped springs so it lands with weight.
const HOP_MS = 260

interface Props {
  model: RiskModel
  mode: 'graph' | 'risk'
  selected: number | null
  highlight: Set<number>
  layers: { ghost: boolean; bus: boolean }
  onSelect: (i: number | null) => void
}

interface SimNode extends SimulationNodeDatum {
  i: number
  r: number
  ax: number
  ay: number
}

interface Layout {
  x: Float32Array
  y: Float32Array
  r: Float32Array
  bounds: [number, number, number, number]
}

function computeLayout(model: RiskModel): Layout {
  const n = model.nodes.length
  const dirs = [...new Set(model.nodes.map((d) => d.dir))]
  const R = 26 * Math.sqrt(n) + 40
  const anchor = new Map(
    dirs.map((d, k) => {
      const a = (k / dirs.length) * Math.PI * 2
      const rr = dirs.length > 1 ? R * 0.55 : 0
      return [d, [Math.cos(a) * rr, Math.sin(a) * rr]]
    }),
  )
  const sim: SimNode[] = model.nodes.map((d, i) => {
    const [ax, ay] = anchor.get(d.dir)!
    // deterministic jitter so layouts are stable across reloads
    const j = Math.sin(i * 12.9898) * 43758.5453
    return { i, r: 2.5 + Math.pow(d.importance, 1.6) * 15, ax, ay, x: ax + (j % 20), y: ay + ((j * 7) % 20) }
  })
  const degree = new Uint16Array(n)
  for (const [a, b] of model.edges) {
    degree[a]++
    degree[b]++
  }
  const links: SimulationLinkDatum<SimNode>[] = model.edges.map(([s, t]) => ({ source: s, target: t }))
  const s = forceSimulation(sim)
    .force('link', forceLink(links).distance(46).strength(0.22))
    .force('charge', forceManyBody().strength(-110))
    .force('collide', forceCollide<SimNode>((d) => d.r + 6))
    // unconnected files would drift to the edge of the universe; tether them
    .force('x', forceX<SimNode>((d) => d.ax).strength((d) => (degree[d.i] ? 0.07 : 0.4)))
    .force('y', forceY<SimNode>((d) => d.ay).strength((d) => (degree[d.i] ? 0.07 : 0.4)))
    .stop()
  for (let k = 0; k < 420; k++) s.tick()

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const r = new Float32Array(n)
  sim.forEach((d) => {
    x[d.i] = d.x!
    y[d.i] = d.y!
    r[d.i] = d.r
  })
  // fit to the body of the graph (2nd-98th percentile), not to stray outliers
  const q = (arr: Float32Array, p: number) => [...arr].sort((a, b) => a - b)[Math.floor(p * (n - 1))]
  const bounds: Layout['bounds'] = [q(x, 0.01) - 20, q(y, 0.01) - 20, q(x, 0.99) + 20, q(y, 0.99) + 20]
  return { x, y, r, bounds }
}

// ---- isoseismal field ---------------------------------------------------------
// A seismic hazard map, not a node-link diagram: every file radiates its magnitude
// as a gaussian and the field takes the MAX, so a contour reaches M8 only around
// files that really are M8 (summing would inflate dense clusters of moderate files).
// Contour lines at M5..M8 are the "isoseismals".
const ISO_LEVELS = [0.5, 0.6, 0.7, 0.8]

interface Hazard {
  image: HTMLCanvasElement
  x0: number
  y0: number
  w: number
  h: number
  lines: { level: number; segs: Float32Array; labels: [number, number][] }[]
}

function computeHazard(model: RiskModel, L: Layout): Hazard {
  const n = model.nodes.length
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, L.x[i])
    y0 = Math.min(y0, L.y[i])
    x1 = Math.max(x1, L.x[i])
    y1 = Math.max(y1, L.y[i])
  }
  const pad = 90
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const cell = Math.max(5, Math.sqrt(((x1 - x0) * (y1 - y0)) / 40000))
  const gw = Math.ceil((x1 - x0) / cell) + 1
  const gh = Math.ceil((y1 - y0) / cell) + 1
  const field = new Float32Array(gw * gh)
  for (let i = 0; i < n; i++) {
    const m = model.nodes[i].magnitude
    if (m < 0.2) continue
    const sigma = 46 + L.r[i] * 2.2
    const reach = sigma * 3
    const gx0 = Math.max(0, Math.floor((L.x[i] - reach - x0) / cell))
    const gx1 = Math.min(gw - 1, Math.ceil((L.x[i] + reach - x0) / cell))
    const gy0 = Math.max(0, Math.floor((L.y[i] - reach - y0) / cell))
    const gy1 = Math.min(gh - 1, Math.ceil((L.y[i] + reach - y0) / cell))
    for (let gy = gy0; gy <= gy1; gy++) {
      const dy = y0 + gy * cell - L.y[i]
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = x0 + gx * cell - L.x[i]
        const g = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
        const v = m * g
        if (v > field[gy * gw + gx]) field[gy * gw + gx] = v
      }
    }
  }

  // banded fill, one pixel per cell (upscaled with smoothing when drawn)
  const image = document.createElement('canvas')
  image.width = gw
  image.height = gh
  const ctx = image.getContext('2d')!
  const img = ctx.createImageData(gw, gh)
  for (let k = 0; k < field.length; k++) {
    const v = field[k]
    let band = -1
    for (let b = 0; b < ISO_LEVELS.length; b++) if (v >= ISO_LEVELS[b]) band = b
    if (band < 0) continue
    const [r, g, b] = heatRGB(ISO_LEVELS[band] + 0.08)
    img.data[k * 4] = r
    img.data[k * 4 + 1] = g
    img.data[k * 4 + 2] = b
    img.data[k * 4 + 3] = 22 + band * 18
  }
  ctx.putImageData(img, 0, 0)

  // marching squares per level
  const placed: [number, number][] = []
  const lines = [...ISO_LEVELS].reverse().map((level) => {
    const segs: number[] = []
    const at = (gx: number, gy: number) => field[gy * gw + gx]
    const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-6)
    for (let gy = 0; gy < gh - 1; gy++) {
      for (let gx = 0; gx < gw - 1; gx++) {
        const a = at(gx, gy)
        const b = at(gx + 1, gy)
        const c = at(gx + 1, gy + 1)
        const d = at(gx, gy + 1)
        const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0)
        if (idx === 0 || idx === 15) continue
        const X = x0 + gx * cell
        const Y = y0 + gy * cell
        const top: [number, number] = [X + lerp(a, b) * cell, Y]
        const right: [number, number] = [X + cell, Y + lerp(b, c) * cell]
        const bottom: [number, number] = [X + lerp(d, c) * cell, Y + cell]
        const left: [number, number] = [X, Y + lerp(a, d) * cell]
        const pairs: [number, number][][] = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
          5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
          9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
          13: [[bottom, right]], 14: [[left, bottom]],
        }[idx as 1]
        for (const [p, q] of pairs) segs.push(p[0], p[1], q[0], q[1])
      }
    }
    // a few well-separated label anchors, topmost first
    const mids: [number, number][] = []
    for (let k = 0; k < segs.length; k += 4) mids.push([(segs[k] + segs[k + 2]) / 2, (segs[k + 1] + segs[k + 3]) / 2])
    mids.sort((p, q) => p[1] - q[1])
    const labels: [number, number][] = []
    for (const m of mids) {
      if (labels.length >= 2) break
      if (labels.every((l) => Math.hypot(l[0] - m[0], l[1] - m[1]) > 200) && placed.every((l) => Math.hypot(l[0] - m[0], l[1] - m[1]) > 70)) {
        labels.push(m)
        placed.push(m)
      }
    }
    return { level, segs: new Float32Array(segs), labels }
  })
  return { image, x0, y0, w: (gw - 1) * cell, h: (gh - 1) * cell, lines }
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
// damped spring "pop": overshoots then settles
const springPop = (u: number) => (u <= 0 ? 0 : Math.exp(-5.5 * u) * Math.sin(11 * u))
const hopColor = (h: number) => (h <= 1 ? '#ff2d1f' : h === 2 ? '#ff6a1a' : '#ffb02e')

export function GraphView({ model, mode, selected, highlight, layers, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const camApi = useRef<{ zoom: (f: number) => void; fit: () => void } | null>(null)

  // Mirror props into refs so the RAF loop never re-subscribes.
  const props = useRef({ mode, selected, highlight, layers })
  const anim = useRef({ selT0: 0, modeT0: 0, hlT0: 0 })
  useLayoutEffect(() => {
    props.current = { mode, selected, highlight, layers }
  })
  useLayoutEffect(() => {
    anim.current.selT0 = performance.now()
  }, [selected])
  useLayoutEffect(() => {
    anim.current.modeT0 = performance.now()
  }, [mode])
  useLayoutEffect(() => {
    anim.current.hlT0 = performance.now()
  }, [highlight])

  useEffect(() => {
    const cv = canvas.current!
    const host = wrap.current!
    const ctx = cv.getContext('2d')!
    const L = computeLayout(model)
    const hazard = computeHazard(model, L)
    const shakers = [...model.nodes.keys()]
      .filter((i) => model.nodes[i].magnitude >= 0.6)
      .sort((a, b) => model.nodes[b].magnitude - model.nodes[a].magnitude)
      .slice(0, 6)
    const n = model.nodes.length
    const t0 = performance.now()

    // camera
    const cam = { k: 1, x: 0, y: 0 }
    const target = { k: 1, x: 0, y: 0 }
    let W = 0
    let H = 0
    const fit = () => {
      const [x0, y0, x1, y1] = L.bounds
      const k = Math.min((W - 120) / (x1 - x0), (H - 200) / (y1 - y0), 2.2)
      target.k = k
      target.x = W / 2 - ((x0 + x1) / 2) * k
      target.y = (H - 70) / 2 - ((y0 + y1) / 2) * k + 20
    }
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = host.clientWidth
      H = host.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      cv.style.width = `${W}px`
      cv.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fit()
    }
    resize()
    Object.assign(cam, target)
    cam.k = target.k * 0.82 // intro: settle in from slightly zoomed-out
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    // intro order: ripple outward from the most important node
    const hub = model.nodes.reduce((b, d, i) => (d.pagerank > model.nodes[b].pagerank ? i : b), 0)
    const introDelay = new Float32Array(n)
    let maxD = 1
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, Math.hypot(L.x[i] - L.x[hub], L.y[i] - L.y[hub]))
    for (let i = 0; i < n; i++) introDelay[i] = (Math.hypot(L.x[i] - L.x[hub], L.y[i] - L.y[hub]) / maxD) * 650

    const ghosts = model.cochange
      .filter((c) => c.ghost)
      .sort((a, b) => b.shared - a.shared)
    const ghostTop = ghosts.slice(0, 40)
    const labelSet = new Set([
      ...[...model.nodes.keys()].sort((a, b) => model.nodes[b].magnitude - model.nodes[a].magnitude).slice(0, 6),
      ...[...model.nodes.keys()].sort((a, b) => model.nodes[b].importance - model.nodes[a].importance).slice(0, 6),
    ])

    // ---- interaction
    let hover = -1
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null
    const toWorld = (sx: number, sy: number) => [(sx - cam.x) / cam.k, (sy - cam.y) / cam.k]
    const pick = (sx: number, sy: number) => {
      const [wx, wy] = toWorld(sx, sy)
      let best = -1
      let bd = Infinity
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(L.x[i] - wx, L.y[i] - wy) - L.r[i]
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return bd * cam.k < 6 ? best : -1
    }
    const onMove = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (drag) {
        const dx = sx - drag.x
        const dy = sy - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        target.x = cam.x = drag.cx + dx
        target.y = cam.y = drag.cy + dy
        return
      }
      const h = pick(sx, sy)
      if (h !== hover) {
        hover = h
        cv.style.cursor = h >= 0 ? 'pointer' : 'grab'
      }
      setTip(h >= 0 ? { i: h, x: sx, y: sy } : null)
    }
    const onDown = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      drag = { x: e.clientX - rect.left, y: e.clientY - rect.top, cx: cam.x, cy: cam.y, moved: false }
      cv.setPointerCapture(e.pointerId)
    }
    const onUp = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      if (drag && !drag.moved) {
        const h = pick(e.clientX - rect.left, e.clientY - rect.top)
        onSelect(h >= 0 ? h : null)
      }
      drag = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = cv.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const f = Math.exp(-e.deltaY * 0.0015)
      const k = Math.min(6, Math.max(0.25, target.k * f))
      target.x = sx - ((sx - target.x) * k) / target.k
      target.y = sy - ((sy - target.y) * k) / target.k
      target.k = k
    }
    const onLeave = () => {
      hover = -1
      setTip(null)
    }
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('dblclick', fit)
    camApi.current = {
      fit,
      zoom: (f) => {
        const k = Math.min(6, Math.max(0.25, target.k * f))
        target.x = W / 2 - ((W / 2 - target.x) * k) / target.k
        target.y = H / 2 - ((H / 2 - target.y) * k) / target.k
        target.k = k
      },
    }

    // ---- render loop
    let raf = 0
    let lastSel: number | null = null
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const P = props.current
      const A = anim.current
      // critically-damped-ish camera follow
      cam.k += (target.k - cam.k) * 0.12
      cam.x += (target.x - cam.x) * 0.12
      cam.y += (target.y - cam.y) * 0.12

      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(cam.x, cam.y)
      ctx.scale(cam.k, cam.k)

      const intro = now - t0
      const sel = P.selected
      if (sel !== lastSel) {
        lastSel = sel
        if (sel !== null) {
          const sx = L.x[sel] * target.k + target.x
          const sy = L.y[sel] * target.k + target.y
          if (sx < 90 || sx > W - 90 || sy < 110 || sy > H - 140) {
            target.x = W / 2 - L.x[sel] * target.k
            target.y = (H - 60) / 2 - L.y[sel] * target.k
          }
        }
      }
      const selDt = now - A.selT0
      const hop = new Map<number, number>()
      if (sel !== null && model.nodes[sel]) {
        hop.set(sel, 0)
        for (const [j, h] of model.nodes[sel].blast) hop.set(j, h)
      }
      const hasSel = sel !== null
      const hasHl = P.highlight.size > 0
      const modeMix = easeOutCubic((now - A.modeT0) / 700)
      const risk = P.mode === 'risk'
      const ignite = (h: number) => selDt - h * HOP_MS
      const lw = 1 / cam.k

      // --- isoseismal hazard field
      const fieldA = easeOutCubic((intro - 700) / 900) * (hasSel || hasHl ? 0.35 : 1)
      if (fieldA > 0) {
        ctx.globalAlpha = fieldA
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(hazard.image, hazard.x0, hazard.y0, hazard.w, hazard.h)
        for (const { level, segs } of hazard.lines) {
          ctx.strokeStyle = heat(level + 0.08, 0.28 + (level - 0.5) * 1.1)
          ctx.lineWidth = (level >= 0.8 ? 1.4 : 1) * lw
          ctx.setLineDash(level >= 0.7 ? [] : [5 * lw, 4 * lw])
          ctx.beginPath()
          for (let k = 0; k < segs.length; k += 4) {
            ctx.moveTo(segs[k], segs[k + 1])
            ctx.lineTo(segs[k + 2], segs[k + 3])
          }
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.font = `600 ${9.5 / cam.k}px "IBM Plex Mono", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const { level, labels } of hazard.lines) {
          for (const [x, y] of labels) {
            const t = `M${Math.round(level * 10)}`
            const w = ctx.measureText(t).width + 6 / cam.k
            ctx.fillStyle = 'rgba(6,8,9,0.85)'
            ctx.fillRect(x - w / 2, y - 7 / cam.k, w, 14 / cam.k)
            ctx.fillStyle = heat(level + 0.08)
            ctx.fillText(t, x, y)
          }
        }
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      // --- import edges
      for (let e = 0; e < model.edges.length; e++) {
        const [s, t] = model.edges[e]
        const appear = easeOutCubic((intro - 500 - Math.max(introDelay[s], introDelay[t])) / 500)
        if (appear <= 0) continue
        let alpha = 0.2
        let color = 'rgba(160,190,196,'
        if (hasSel) {
          const hs = hop.get(s)
          const ht = hop.get(t)
          if (hs !== undefined && ht !== undefined && hs === ht + 1) {
            // this edge carried the shock from t (closer to epicenter) to s
            const u = (selDt - ht * HOP_MS) / HOP_MS
            if (u > 0) {
              const k = easeInOut(u)
              const hx = L.x[t] + (L.x[s] - L.x[t]) * k
              const hy = L.y[t] + (L.y[s] - L.y[t]) * k
              ctx.strokeStyle = hopColor(hs)
              ctx.globalAlpha = 0.55 * appear
              ctx.lineWidth = 1.4 * lw
              ctx.beginPath()
              ctx.moveTo(L.x[t], L.y[t])
              ctx.lineTo(hx, hy)
              ctx.stroke()
              if (u < 1) {
                // travelling pulse head
                ctx.globalAlpha = 1
                ctx.fillStyle = '#fff4e0'
                ctx.shadowColor = hopColor(hs)
                ctx.shadowBlur = 14
                ctx.beginPath()
                ctx.arc(hx, hy, 2.6 * lw + 1.2, 0, Math.PI * 2)
                ctx.fill()
                ctx.shadowBlur = 0
              }
              continue
            }
            alpha = 0.05
          } else {
            alpha = 0.035
          }
        } else if (hover >= 0 && (s === hover || t === hover)) {
          alpha = 0.6
          color = 'rgba(111,179,176,'
        } else if (hasHl) {
          alpha = 0.06
        }
        ctx.strokeStyle = color + alpha * appear + ')'
        ctx.globalAlpha = 1
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.moveTo(L.x[s], L.y[s])
        ctx.lineTo(L.x[t], L.y[t])
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // --- ghost edges: hidden coupling, dashed arcs with a slow crawl
      if (P.layers.ghost) {
        const list = hasSel ? ghosts.filter((c) => c.a === sel || c.b === sel) : ghostTop
        ctx.setLineDash([4 * lw, 5 * lw])
        ctx.lineDashOffset = (-now / 60) * lw
        const gAppear = easeOutCubic((intro - 900) / 600)
        for (const c of list) {
          const ax = L.x[c.a]
          const ay = L.y[c.a]
          const bx = L.x[c.b]
          const by = L.y[c.b]
          const mx = (ax + bx) / 2 - (by - ay) * 0.22
          const my = (ay + by) / 2 + (bx - ax) * 0.22
          ctx.strokeStyle = `rgba(255,176,46,${(0.22 + 0.5 * c.confidence) * gAppear * (hasSel ? 1.4 : 1)})`
          ctx.lineWidth = (hasSel ? 1.6 : 1.1) * lw
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.quadraticCurveTo(mx, my, bx, by)
          ctx.stroke()
        }
        ctx.setLineDash([])
      }

      // --- seismic shockwave rings from the epicenter
      if (hasSel && sel !== null) {
        let reach = 0
        for (const [j] of model.nodes[sel].blast) reach = Math.max(reach, Math.hypot(L.x[j] - L.x[sel], L.y[j] - L.y[sel]))
        reach = Math.max(reach + 30, 90)
        for (let k = 0; k < 3; k++) {
          const u = (selDt - k * 220) / 1600
          if (u <= 0 || u >= 1) continue
          ctx.strokeStyle = `rgba(255,90,40,${0.5 * (1 - u) * (1 - u)})`
          ctx.lineWidth = (1.5 - u) * lw
          ctx.beginPath()
          ctx.arc(L.x[sel], L.y[sel], L.r[sel] + easeOutCubic(u) * reach, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // --- aftershocks: the hottest files keep trembling
      if (!hasSel && !hasHl && intro > 1400) {
        shakers.forEach((i, k) => {
          const period = 3400
          const u = ((now + k * 570) % period) / 1700
          if (u >= 1) return
          ctx.strokeStyle = heat(model.nodes[i].magnitude, 0.5 * (1 - u) * (1 - u))
          ctx.lineWidth = 1.2 * lw
          ctx.beginPath()
          ctx.arc(L.x[i], L.y[i], L.r[i] + 2 + easeOutCubic(u) * (26 + L.r[i]), 0, Math.PI * 2)
          ctx.stroke()
        })
      }

      // --- nodes
      const hlPulse = 0.5 + 0.5 * Math.sin((now - A.hlT0) / 260)
      for (let i = 0; i < n; i++) {
        const d = model.nodes[i]
        const appear = easeOutCubic((intro - introDelay[i]) / 520)
        if (appear <= 0) continue
        let r = L.r[i] * (0.4 + 0.6 * appear)
        let fill: string
        let stroke = ''
        let glow = 0
        let glowColor = ''
        let alpha = appear

        const graphFill = '#1b282c'
        const graphStroke = `rgba(130,200,196,${0.55 + 0.45 * d.importance})`
        const riskFill = heat(d.magnitude)
        if (risk) {
          fill = riskFill
          glow = d.magnitude > 0.55 ? 26 * (d.magnitude - 0.45) * modeMix : 0
          glowColor = heat(d.magnitude, 0.9)
        } else {
          fill = graphFill
          stroke = graphStroke
        }

        const h = hop.get(i)
        if (hasSel) {
          if (h === undefined) {
            alpha *= 0.22
          } else if (h === 0) {
            const u = selDt / 500
            r *= 1 + 0.35 * springPop(u)
            fill = '#ff2d1f'
            stroke = '#ffd9c2'
            glow = 30
            glowColor = 'rgba(255,45,31,0.9)'
          } else {
            const u = ignite(h) / 600
            if (u > 0) {
              r *= 1 + 0.6 * springPop(u)
              const flash = Math.max(0, 1 - u * 2.2)
              fill = flash > 0.3 ? '#ffe7cf' : hopColor(h)
              stroke = ''
              glow = 8 + 18 * flash + (h === 1 ? 8 : 0)
              glowColor = hopColor(h)
            } else {
              alpha *= 0.35
            }
          }
        } else if (hasHl && !P.highlight.has(i)) {
          alpha *= 0.22
        }

        ctx.globalAlpha = alpha
        if (glow > 0) {
          ctx.shadowColor = glowColor
          ctx.shadowBlur = glow
        }
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(L.x[i], L.y[i], r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (stroke) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = 1.2 * lw
          ctx.stroke()
        }

        // ring flash when a dependent ignites
        if (hasSel && h !== undefined && h > 0) {
          const u = ignite(h) / 700
          if (u > 0 && u < 1) {
            ctx.strokeStyle = hopColor(h)
            ctx.globalAlpha = (1 - u) * 0.8
            ctx.lineWidth = 1.2 * lw
            ctx.beginPath()
            ctx.arc(L.x[i], L.y[i], r + 3 + easeOutCubic(u) * 16, 0, Math.PI * 2)
            ctx.stroke()
          }
        }

        // bus factor: a broken ring — one author, one point of failure
        if (P.layers.bus && d.bus_factor) {
          ctx.globalAlpha = alpha * 0.9
          ctx.strokeStyle = '#d3dbdf'
          ctx.lineWidth = 1.1 * lw
          ctx.setLineDash([2.2 * lw, 2.2 * lw])
          ctx.beginPath()
          ctx.arc(L.x[i], L.y[i], r + 3.5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // ask-the-repo highlight: targeting brackets
        if (hasHl && P.highlight.has(i)) {
          const b = r + 5 + hlPulse * 2.5
          const t = 4
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#ffb02e'
          ctx.lineWidth = 1.4 * lw
          ctx.beginPath()
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(L.x[i] + sx * b, L.y[i] + sy * (b - t))
            ctx.lineTo(L.x[i] + sx * b, L.y[i] + sy * b)
            ctx.lineTo(L.x[i] + sx * (b - t), L.y[i] + sy * b)
          }
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // --- selection reticle
      if (sel !== null) {
        const r = L.r[sel] + 9
        const rot = now / 2400
        ctx.strokeStyle = 'rgba(255,217,194,0.9)'
        ctx.lineWidth = 1.2 * lw
        for (let k = 0; k < 4; k++) {
          const a = rot + (k * Math.PI) / 2
          ctx.beginPath()
          ctx.arc(L.x[sel], L.y[sel], r, a, a + 0.7)
          ctx.stroke()
        }
      }

      // --- labels (screen-space font size)
      ctx.font = `500 ${12.5 / cam.k}px "IBM Plex Mono", monospace`
      ctx.textBaseline = 'middle'
      // candidates in priority order; a label is dropped if it would collide
      const cands: number[] = []
      if (sel !== null) cands.push(sel)
      if (hover >= 0 && hover !== sel) cands.push(hover)
      for (const i of P.highlight) cands.push(i)
      if (hasSel && ignite(1) >= 0) {
        const ring1 = [...hop.entries()].filter(([, h]) => h === 1).map(([i]) => i)
        ring1.sort((a, b) => model.nodes[b].importance - model.nodes[a].importance)
        cands.push(...ring1)
      }
      if (!hasSel && !hasHl && cam.k > 0.55) cands.push(...labelSet)
      const placed: [number, number, number, number][] = []
      const lh = 15 / cam.k
      for (const i of new Set(cands)) {
        const a = easeOutCubic((intro - introDelay[i] - 300) / 500)
        if (a <= 0) continue
        const text = shortName(model.nodes[i].id)
        const mtag = hasSel ? '' : ` M${fmtM(model.nodes[i].magnitude)}`
        const lx = L.x[i] + L.r[i] + 6 / cam.k
        const nameW = ctx.measureText(text).width
        const w = nameW + ctx.measureText(mtag).width
        const box: [number, number, number, number] = [lx, L.y[i] - lh / 2, lx + w, L.y[i] + lh / 2]
        const forced = i === sel || i === hover
        if (!forced && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
        placed.push(box)
        ctx.globalAlpha = a
        ctx.strokeStyle = 'rgba(10,13,15,0.9)'
        ctx.lineWidth = 4 / cam.k
        ctx.lineJoin = 'round'
        ctx.strokeText(text, lx, L.y[i])
        ctx.fillStyle = i === sel ? '#fff0e6' : hasSel ? '#ffc8a8' : '#dfe7ea'
        ctx.fillText(text, lx, L.y[i])
        if (mtag) {
          ctx.strokeText(mtag, lx + nameW, L.y[i])
          ctx.fillStyle = heat(model.nodes[i].magnitude)
          ctx.fillText(mtag, lx + nameW, L.y[i])
        }
      }
      ctx.globalAlpha = 1
      ctx.restore()
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', onWheel)
      cv.removeEventListener('dblclick', fit)
    }
  }, [model, onSelect])

  const tipNode = tip ? model.nodes[tip.i] : null
  return (
    <div ref={wrap} className="view-canvas">
      <canvas ref={canvas} />
      <div className="zoom-ctl" aria-label="zoom">
        <button onClick={() => camApi.current?.zoom(1.3)} aria-label="zoom in">+</button>
        <button onClick={() => camApi.current?.zoom(1 / 1.3)} aria-label="zoom out">−</button>
        <button onClick={() => camApi.current?.fit()} aria-label="fit to screen" className="zoom-fit">FIT</button>
      </div>
      {selected !== null && (
        <div className="hop-legend">
          <span><i style={{ background: '#fff0e6' }} />EPICENTER</span>
          <span><i style={{ background: '#ff2d1f' }} />HOP 1 · imports it</span>
          <span><i style={{ background: '#ff6a1a' }} />HOP 2</span>
          <span><i style={{ background: '#ffb02e' }} />HOP 3+</span>
          <span className="dim"><i className="dim-dot" />unaffected</span>
        </div>
      )}
      {tipNode && tip && (
        <div className="tooltip" style={{ left: tip.x + 16, top: tip.y + 12 }}>
          <div className="tooltip-path">{tipNode.id}</div>
          <div className="tooltip-row">
            <span>M</span>
            <b style={{ color: heat(tipNode.magnitude) }}>{fmtM(tipNode.magnitude)}</b>
            <span>BLAST</span>
            <b>{tipNode.blast_size}</b>
            <span>FIXES</span>
            <b>{tipNode.fixes}</b>
          </div>
        </div>
      )}
    </div>
  )
}
