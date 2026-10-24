import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { fmtM, heat, heatHex } from '../lib/heat'
import type { RiskModel, Snapshots } from '../lib/types'

// Code city: folders are districts, files are towers.
//   height  = importance (PageRank rank)
//   glow    = magnitude, through the shared heat ramp; hot towers bloom
// Every tower's height and glow are driven by an underdamped spring, so changes
// (first load, blast cascade, time-travel scrubbing) move with physical weight.

const CELL = 3.6
const HOP_MS = 260

interface Props {
  model: RiskModel
  snapshots: Snapshots | null
  time: number | null // fractional snapshot index, null = present
  selected: number | null
  highlight: Set<number>
  onSelect: (i: number | null) => void
}

interface Tower {
  i: number
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  x: number
  z: number
  w: number
  h: number
  vh: number
  m: number
  vm: number
  targetH: number
  targetM: number
  bornAt: number
  beacon?: THREE.Mesh
}

function layoutCity(model: RiskModel) {
  const groups = new Map<string, number[]>()
  model.nodes.forEach((n, i) => groups.set(n.dir, [...(groups.get(n.dir) ?? []), i]))
  const districts = [...groups.entries()]
    .map(([dir, ids]) => {
      const cols = Math.ceil(Math.sqrt(ids.length))
      const rows = Math.ceil(ids.length / cols)
      return { dir, ids, cols, rows, w: cols * CELL + 2.4, d: rows * CELL + 2.4, x: 0, z: 0 }
    })
    .sort((a, b) => b.ids.length - a.ids.length)

  // shelf-pack districts into a roughly square city
  const area = districts.reduce((s, d) => s + (d.w + 3) * (d.d + 3), 0)
  const maxW = Math.max(Math.sqrt(area) * 1.15, districts[0]?.w ?? 0)
  let cx = 0
  let cz = 0
  let shelf = 0
  for (const d of districts) {
    if (cx + d.w > maxW && cx > 0) {
      cx = 0
      cz += shelf + 3
      shelf = 0
    }
    d.x = cx
    d.z = cz
    cx += d.w + 3
    shelf = Math.max(shelf, d.d)
  }
  const totalW = Math.max(...districts.map((d) => d.x + d.w))
  const totalD = Math.max(...districts.map((d) => d.z + d.d))
  for (const d of districts) {
    d.x -= totalW / 2
    d.z -= totalD / 2
  }

  // inside a district, the most important files take the central lots
  const lots = new Map<number, { x: number; z: number }>()
  for (const d of districts) {
    const cells: [number, number][] = []
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) cells.push([c, r])
    const mc = (d.cols - 1) / 2
    const mr = (d.rows - 1) / 2
    cells.sort((a, b) => Math.hypot(a[0] - mc, a[1] - mr) - Math.hypot(b[0] - mc, b[1] - mr))
    const ids = [...d.ids].sort((a, b) => model.nodes[b].importance - model.nodes[a].importance)
    ids.forEach((id, k) => {
      const [c, r] = cells[k]
      lots.set(id, { x: d.x + 1.2 + CELL * (c + 0.5), z: d.z + 1.2 + CELL * (r + 0.5) })
    })
  }
  return { districts, lots, size: Math.max(totalW, totalD) }
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 64, 128)
  for (let y = 6; y < 128; y += 10) {
    for (let x = 6; x < 64; x += 13) {
      const lit = Math.random()
      if (lit < 0.3) continue
      const v = Math.floor(70 + lit * 185)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x, y, 8, 5)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.anisotropy = 8
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function labelTexture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = '500 44px "IBM Plex Mono", monospace'
  g.font = font
  const w = Math.ceil(g.measureText(text).width) + 24
  c.width = w
  c.height = 64
  g.font = font
  g.fillStyle = 'rgba(214,224,228,0.95)'
  g.textBaseline = 'middle'
  g.fillText(text, 12, 34)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, aspect: w / 64 }
}

const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
const hopHex = (h: number) => (h <= 1 ? 0xff2d1f : h === 2 ? 0xff6a1a : 0xffb02e)

export function CityView({ model, snapshots, time, selected, highlight, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const props = useRef({ snapshots, time, selected, highlight })
  const selT0 = useRef({ t: 0 })
  useLayoutEffect(() => {
    props.current = { snapshots, time, selected, highlight }
  })
  useLayoutEffect(() => {
    selT0.current.t = performance.now()
  }, [selected])

  useEffect(() => {
    const el = host.current!
    const W = () => el.clientWidth
    const H = () => el.clientHeight
    const { districts, lots, size } = layoutCity(model)
    const span = Math.max(size, 40)
    const maxH = Math.min(26, Math.max(10, span * 0.36))

    // ---- renderer / scene
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W(), H())
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // linear fog: the city stays crisp, the far ground dissolves into the horizon
    // HORIZON is linear-space, shared by fog and sky so the ground melts into the sky
    const HORIZON = new THREE.Color().setRGB(0.0075, 0.011, 0.013)
    scene.fog = new THREE.Fog(HORIZON, span * 1.7, span * 4.2)

    // gradient sky dome with a faint warm horizon (city glow on haze)
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(span * 6, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uHorizon: { value: HORIZON } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uHorizon; varying vec3 vP;
          void main(){
            float y = clamp(vP.y, -0.1, 1.0);
            vec3 zenith = vec3(0.0015, 0.0024, 0.003);
            vec3 haze = vec3(0.022, 0.008, 0.004);
            vec3 c = mix(uHorizon, zenith, pow(max(y, 0.0), 0.45));
            c += haze * exp(-max(y, 0.0) * 14.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    )
    scene.add(sky)

    const camera = new THREE.PerspectiveCamera(36, W() / H(), 0.5, span * 20)
    const home = new THREE.Vector3(span * 0.88, span * 0.62, span * 0.98)
    camera.position.set(span * 0.2, span * 2.6, span * 0.35) // intro: high overhead
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxPolarAngle = 1.36
    controls.minDistance = span * 0.25
    controls.maxDistance = span * 3.2
    controls.autoRotateSpeed = 0.35
    controls.target.set(0, maxH * 0.12, 0)
    controls.enabled = false

    // ---- lights
    scene.add(new THREE.AmbientLight(0x1f3038, 0.8))
    scene.add(new THREE.HemisphereLight(0x3a5864, 0x050607, 0.45))
    const moon = new THREE.DirectionalLight(0xa8c8d4, 1.1)
    moon.position.set(-span * 0.8, span * 1.4, span * 0.5)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    const sc = moon.shadow.camera
    sc.left = sc.bottom = -span * 0.9
    sc.right = sc.top = span * 0.9
    sc.far = span * 5
    moon.shadow.bias = -0.0006
    scene.add(moon)

    // ---- ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 12, span * 12),
      new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 0.92, metalness: 0.05 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(span * 6, Math.round((span * 6) / CELL), 0x1a2a2e, 0x111a1d)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.45
    grid.position.y = 0.01
    scene.add(grid)

    // districts: raised plots with hairline outlines + flat labels
    const disposables: { dispose: () => void }[] = []
    for (const d of districts) {
      const plot = new THREE.Mesh(
        new THREE.BoxGeometry(d.w, 0.12, d.d),
        new THREE.MeshStandardMaterial({ color: 0x0c1114, roughness: 0.85 }),
      )
      plot.position.set(d.x + d.w / 2, 0.06, d.z + d.d / 2)
      plot.receiveShadow = true
      scene.add(plot)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(plot.geometry),
        new THREE.LineBasicMaterial({ color: 0x4d8583, transparent: true, opacity: 0.35 }),
      )
      edges.position.copy(plot.position)
      scene.add(edges)
      const short = d.dir === '.' ? '/' : d.dir.split('/').slice(-2).join('/') + '/'
      const { tex, aspect } = labelTexture(short)
      const lh = Math.min(1.5, (d.w - 0.4) / aspect) // never wider than its district
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(lh * aspect, lh),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      )
      label.rotation.x = -Math.PI / 2
      label.position.set(d.x + (lh * aspect) / 2 + 0.2, 0.14, d.z + d.d + 0.3 + lh / 2)
      scene.add(label)
      disposables.push(tex)
    }

    // ---- towers
    const winTex = windowTexture()
    disposables.push(winTex)
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    const now0 = performance.now()
    const towers: Tower[] = model.nodes.map((n, i) => {
      const lot = lots.get(i)!
      const w = 1.2 + Math.min(1.0, Math.sqrt(n.loc) / 36)
      const tex = winTex.clone()
      tex.needsUpdate = true
      const mat = new THREE.MeshStandardMaterial({
        color: 0x18222a,
        roughness: 0.5,
        metalness: 0.3,
        emissive: new THREE.Color(heatHex(n.magnitude)),
        emissiveMap: tex,
        emissiveIntensity: 0,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(lot.x, 0.12, lot.z)
      mesh.scale.set(w, 0.001, w)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.i = i
      scene.add(mesh)
      const dist = Math.hypot(lot.x, lot.z) / (span * 0.7)
      return {
        i, mesh, mat, x: lot.x, z: lot.z, w,
        h: 0, vh: 0, m: 0, vm: 0, targetH: 0, targetM: 0,
        bornAt: now0 + 700 + dist * 1300 + Math.random() * 250,
      }
    })

    // aircraft-warning beacons + red spill light on the most dangerous towers
    const hottest = [...towers].sort((a, b) => model.nodes[b.i].magnitude - model.nodes[a.i].magnitude).slice(0, 5)
    const beaconGeo = new THREE.SphereGeometry(0.22, 12, 8)
    for (const t of hottest) {
      const b = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: 0xff2d1f, transparent: true }))
      scene.add(b)
      t.beacon = b
    }
    const spills = hottest.slice(0, 3).map((t) => {
      const l = new THREE.PointLight(heatHex(model.nodes[t.i].magnitude), 0, span * 0.45, 1.6)
      l.position.set(t.x, 3, t.z)
      scene.add(l)
      return { l, t }
    })

    // selection: light column + ground shockwave rings
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xff4a24) } },
      vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vY;
        void main(){ float a = pow(1.0 - clamp(vY, 0.0, 1.0), 2.2); gl_FragColor = vec4(uColor * a * uOpacity, 1.0); }`,
    })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 24, 1, true), beamMat)
    beam.geometry.translate(0, 0.5, 0)
    scene.add(beam)
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 96),
        new THREE.MeshBasicMaterial({
          color: 0xff5a28, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      r.rotation.x = -Math.PI / 2
      r.position.y = 0.16
      scene.add(r)
      return r
    })
    const hoverBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffe2cc, transparent: true, opacity: 0.9 }),
    )
    hoverBox.visible = false
    scene.add(hoverBox)

    // ---- post
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.95, 0.6, 0.16)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    // ---- interaction
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    let hover = -1
    let downAt: { x: number; y: number } | null = null
    let lastInteract = performance.now()
    const meshes = towers.map((t) => t.mesh)
    const pick = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(meshes, false).find((h) => towers[h.object.userData.i].h > 0.05)
      return hit ? (hit.object.userData.i as number) : -1
    }
    const onMove = (e: PointerEvent) => {
      const i = pick(e.clientX, e.clientY)
      hover = i
      renderer.domElement.style.cursor = i >= 0 ? 'pointer' : 'grab'
      const r = renderer.domElement.getBoundingClientRect()
      setTip(i >= 0 ? { i, x: e.clientX - r.left, y: e.clientY - r.top } : null)
    }
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      lastInteract = performance.now()
      controls.autoRotate = false
    }
    const onUp = (e: PointerEvent) => {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
        const i = pick(e.clientX, e.clientY)
        onSelect(i >= 0 ? i : null)
      }
      downAt = null
      lastInteract = performance.now()
    }
    const onWheel = () => {
      lastInteract = performance.now()
      controls.autoRotate = false
    }
    const onLeave = () => {
      hover = -1
      setTip(null)
    }
    const el2 = renderer.domElement
    el2.addEventListener('pointermove', onMove)
    el2.addEventListener('pointerdown', onDown)
    el2.addEventListener('pointerup', onUp)
    el2.addEventListener('pointerleave', onLeave)
    el2.addEventListener('wheel', onWheel, { passive: true })
    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H()
      camera.updateProjectionMatrix()
      renderer.setSize(W(), H())
      composer.setSize(W(), H())
    })
    ro.observe(el)

    // ---- targets from model / snapshots
    const heightOf = (imp: number) => 0.5 + Math.pow(imp, 1.5) * maxH
    let aliveCache: { S: Snapshots; alive: number[] } | null = null
    const computeTargets = () => {
      const P = props.current
      const S = P.snapshots
      if (S && P.time !== null && S.frames.length) {
        if (aliveCache?.S !== S) aliveCache = { S, alive: S.frames.map((fr) => fr.importance.filter((v) => v !== null).length) }
        const alive = aliveCache.alive
        const f = Math.min(S.frames.length - 1, Math.max(0, P.time))
        const fi = Math.floor(f)
        const a = S.frames[fi]
        const b = S.frames[Math.min(S.frames.length - 1, fi + 1)]
        const k = f - fi
        // a young codebase is a low town: the whole skyline scales with file count
        const aliveNow = alive[fi] + (alive[Math.min(alive.length - 1, fi + 1)] - alive[fi]) * k
        const grow = 0.3 + 0.7 * Math.sqrt(aliveNow / Math.max(1, alive[alive.length - 1]))
        for (const t of towers) {
          const ia = a.importance[t.i]
          const ib = b.importance[t.i]
          const ma = a.magnitude[t.i]
          const mb = b.magnitude[t.i]
          // a file not yet born is flat; it rises as the scrubber crosses its birth
          const imp = (ia ?? -0.04) * (1 - k) + (ib ?? -0.04) * k
          const mag = (ma ?? 0) * (1 - k) + (mb ?? 0) * k
          t.targetH = imp < 0 ? 0 : heightOf(imp) * grow
          t.targetM = mag
        }
      } else {
        for (const t of towers) {
          t.targetH = heightOf(model.nodes[t.i].importance)
          t.targetM = model.nodes[t.i].magnitude
        }
      }
    }

    // ---- loop
    let raf = 0
    let last = performance.now()
    const tmpColor = new THREE.Color()
    const baseColor = new THREE.Color()
    const flyFrom = camera.position.clone()
    const camGoal = { target: new THREE.Vector3(0, maxH * 0.12, 0) }
    let lastSel: number | null = null
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const P = props.current
      computeTargets()

      // intro fly-in, then hand control to the user
      const introT = (now - now0) / 2800
      if (introT < 1) {
        camera.position.lerpVectors(flyFrom, home, easeInOut(introT))
        camera.lookAt(controls.target)
      } else if (!controls.enabled) {
        controls.enabled = true
        controls.autoRotate = true
      }
      if (controls.enabled && !controls.autoRotate && P.selected === null && now - lastInteract > 7000) controls.autoRotate = true

      // selection: glide the orbit target to the epicenter
      if (P.selected !== lastSel) {
        lastSel = P.selected
        if (P.selected !== null) {
          const t = towers[P.selected]
          camGoal.target.set(t.x, Math.min(t.targetH * 0.4, 6), t.z)
          camGoal.target.lerp(new THREE.Vector3(0, 0, 0), 0.35)
          controls.autoRotate = false
        } else camGoal.target.set(0, maxH * 0.12, 0)
      }
      if (introT >= 1) controls.target.lerp(camGoal.target, 0.06)

      const sel = P.selected
      const selDt = now - selT0.current.t
      const hop = new Map<number, number>()
      if (sel !== null) {
        hop.set(sel, 0)
        for (const [j, h] of model.nodes[sel].blast) hop.set(j, h)
      }
      const hasHl = P.highlight.size > 0

      for (const t of towers) {
        // underdamped springs: overshoot slightly, then settle
        const tH = now < t.bornAt ? 0 : t.targetH
        const k = 70
        const c = 11
        t.vh += (k * (tH - t.h) - c * t.vh) * dt
        t.h += t.vh * dt
        t.vm += (40 * (t.targetM - t.m) - 12 * t.vm) * dt
        t.m += t.vm * dt
        const h = Math.max(0.001, t.h)
        t.mesh.scale.y = h
        t.mesh.visible = h > 0.02
        const tex = t.mat.emissiveMap!
        tex.repeat.set(1, Math.max(1, h / 2.2))

        const m = Math.min(1, Math.max(0, t.m))
        baseColor.setHex(heatHex(m))
        let intensity = 0.42 + Math.pow(m, 2.1) * 2.7
        let color = baseColor
        const hp = hop.get(t.i)
        if (sel !== null) {
          if (hp === undefined) intensity *= 0.12
          else if (hp === 0) {
            color = tmpColor.setHex(0xff2d1f)
            intensity = 3.4 + Math.sin(now / 160) * 0.4
          } else {
            const u = (selDt - hp * HOP_MS) / 700
            if (u < 0) intensity *= 0.2
            else {
              const flash = Math.max(0, 1 - u)
              color = tmpColor.setHex(hopHex(hp))
              intensity = 1.6 + flash * 4
            }
          }
        } else if (hasHl) {
          intensity = P.highlight.has(t.i) ? 2.6 + Math.sin(now / 200) * 0.6 : intensity * 0.18
          if (P.highlight.has(t.i)) color = tmpColor.setHex(0xffb02e)
        }
        if (t.i === hover) intensity += 0.8
        t.mat.emissive.copy(color)
        t.mat.emissiveIntensity = intensity

        if (t.beacon) {
          t.beacon.position.set(t.x, 0.12 + h + 0.35, t.z)
          const blink = (Math.sin(now / 420 + t.i) + 1) / 2
          ;(t.beacon.material as THREE.MeshBasicMaterial).opacity = h > 0.5 ? 0.25 + blink * 0.75 : 0
        }
      }
      for (const { l, t } of spills) {
        l.position.y = Math.max(1.5, t.h * 0.35)
        l.intensity = sel === null && !hasHl ? Math.pow(Math.max(0, t.m), 2) * span * 0.9 : 0
      }

      // epicenter column + shockwave
      const bo = beamMat.uniforms.uOpacity
      if (sel !== null) {
        const t = towers[sel]
        beam.position.set(t.x, 0.12 + t.h, t.z)
        beam.scale.set(t.w, span * 0.9, t.w)
        bo.value += (0.9 - bo.value) * 0.06
        rings.forEach((r, k) => {
          const u = ((selDt - k * 240) % 2600) / 1700
          const mat = r.material as THREE.MeshBasicMaterial
          if (u < 0 || u > 1) {
            mat.opacity = 0
            return
          }
          const rad = 1 + (1 - Math.pow(1 - u, 3)) * span * 0.55
          r.scale.set(rad, rad, 1)
          r.position.x = t.x
          r.position.z = t.z
          mat.opacity = 0.75 * (1 - u) * (1 - u)
        })
      } else {
        bo.value *= 0.9
        rings.forEach((r) => ((r.material as THREE.MeshBasicMaterial).opacity *= 0.85))
      }

      if (hover >= 0) {
        const t = towers[hover]
        hoverBox.visible = true
        hoverBox.position.set(t.x, 0.12, t.z)
        hoverBox.scale.set(t.w * 1.04, Math.max(0.01, t.h) * 1.01, t.w * 1.04)
      } else hoverBox.visible = false

      controls.update()
      composer.render()
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el2.removeEventListener('pointermove', onMove)
      el2.removeEventListener('pointerdown', onDown)
      el2.removeEventListener('pointerup', onUp)
      el2.removeEventListener('pointerleave', onLeave)
      el2.removeEventListener('wheel', onWheel)
      controls.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      towers.forEach((t) => t.mat.emissiveMap?.dispose())
      disposables.forEach((d) => d.dispose())
      composer.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [model, onSelect])

  const n = tip ? model.nodes[tip.i] : null
  return (
    <div ref={host} className="view-canvas city">
      {n && tip && (
        <div className="tooltip" style={{ left: tip.x + 16, top: tip.y + 12 }}>
          <div className="tooltip-path">{n.id}</div>
          <div className="tooltip-row">
            <span>M</span>
            <b style={{ color: heat(n.magnitude) }}>{fmtM(n.magnitude)}</b>
            <span>BLAST</span>
            <b>{n.blast_size}</b>
            <span>CHURN</span>
            <b>{n.churn}</b>
          </div>
        </div>
      )}
    </div>
  )
}
