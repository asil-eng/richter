import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fmtM, heat, shortName } from '../lib/heat'
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
    const labelSet = new Set(
      [...model.nodes.keys()].sort((a, b) => model.nodes[b].importance - model.nodes[a].importance).slice(0, 10),
    )

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

    // ---- render loop
    let raf = 0
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
        const lx = L.x[i] + L.r[i] + 6 / cam.k
        const w = ctx.measureText(text).width
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
