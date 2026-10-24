import { useCallback, useEffect, useState } from 'react'
import { AskBar } from './components/AskBar'
import { BootScreen } from './components/BootScreen'
import { Inspector } from './components/Inspector'
import { LeftRail } from './components/LeftRail'
import { FileFinder } from './components/FileFinder'
import { Reanalyze } from './components/Reanalyze'
import { Timeline } from './components/Timeline'
import { TopBar } from './components/TopBar'
import { listRepos, loadModel, loadSnapshots } from './lib/data'
import type { RepoEntry, RiskModel, Snapshots, View } from './lib/types'
import { CityView } from './views/CityView'
import { GraphView } from './views/GraphView'

const PREFERRED = 'textualize__rich'
const VIEW_NAME: Record<View, string> = { graph: 'DEPENDENCY GRAPH', risk: 'RISK MAP', city: 'CODE CITY' }

export default function App() {
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [model, setModel] = useState<RiskModel | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshots | null>(null)
  const [time, setTime] = useState<number | null>(null)
  const [view, setView] = useState<View>('risk') // open on the most informative view
  const [selected, setSelected] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<Set<number>>(new Set())
  const [layers, setLayers] = useState({ ghost: false, bus: false })
  const [boot, setBoot] = useState<string[]>(['POWERING INSTRUMENT', 'CALIBRATING SENSORS'])
  const [booted, setBooted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepos()
      .then((rs) => {
        setRepos(rs)
        const first = rs.find((r) => r.slug === PREFERRED) ?? rs[0]
        if (first) setSlug(first.slug)
        else setError('No analyzed repos found. Run `python -m richter.cli analyze <url>`.')
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!slug) return
    let live = true
    loadSnapshots(slug).then((s) => live && setSnapshots(s))
    loadModel(slug)
      .then((m) => {
        if (!live) return
        setBoot((b) => [
          ...b.slice(0, 2),
          `READING ${m.repo.name.toUpperCase()}`,
          `${m.repo.commits.toLocaleString()} COMMITS · ${m.repo.authors} AUTHORS`,
          `${m.summary.files} FILES · ${m.summary.edges} IMPORT EDGES · ${m.summary.ghost_edges} GHOST`,
          'SIGNAL LOCKED',
        ])
        setModel(m)
        setTimeout(() => live && setBooted(true), 900)
      })
      .catch((e) => setError(String(e)))
    return () => {
      live = false
    }
  }, [slug])

  const select = useCallback((i: number | null) => setSelected(i), [])
  const openRepo = useCallback((s: string) => {
    // re-clicking the open repo must not wipe its snapshots (the load effect won't re-run)
    if (s === slug) return
    setSlug(s)
    setSelected(null)
    setHighlight(new Set())
    setTime(null)
    setSnapshots(null)
  }, [slug])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Escape') {
        setSelected(null)
        setHighlight(new Set())
      }
      if (e.key === '1') setView('graph')
      if (e.key === '2') setView('risk')
      if (e.key === '3') setView('city')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onAnalyzed = async (s: string) => {
    setRepos(await listRepos())
    if (s !== slug) return openRepo(s)
    // re-analysis of the open repo: same slug, so reload its data explicitly
    setSelected(null)
    setModel(await loadModel(s, true))
    setSnapshots(await loadSnapshots(s))
  }

  return (
    <div className="app">
      <TopBar
        repos={repos}
        slug={slug}
        onRepo={openRepo}
        view={view}
        onView={setView}
        onAnalyzed={onAnalyzed}
        cityReady
      />
      {model && slug && model.nodes.length === 0 && (
        <main className="stage stage-empty">
          <div className="no-python">
            <div className="label">NO SIGNAL</div>
            <div className="no-python-title">{model.repo.name} has no source files Richter can read</div>
            <p>
              Richter builds the import graph for Python, JavaScript/TypeScript, Go, Java/Kotlin/Scala, Rust, C/C++, C#,
              Ruby and PHP. Its {model.repo.commits.toLocaleString()} commits were read, but no files in those languages
              were found outside tests/, docs/ and examples/.
            </p>
            <p className="muted">Pick another repo from the REPO menu, or analyze a project in a supported language.</p>
            {!model.summary.languages && model.repo.url && (
              <Reanalyze url={model.repo.url} onDone={onAnalyzed} />
            )}
          </div>
        </main>
      )}
      {model && slug && model.nodes.length > 0 && (
        <>
          <LeftRail model={model} selected={selected} onSelect={select} layers={layers} setLayers={setLayers} />
          <main className={`stage stage-${view}`} key={slug}>
            <div className="hud hud-tl">
              <div className="hud-row">
                <span className="hud-view">{VIEW_NAME[view]}</span>
                <span>{model.summary.files} FILES</span>
                {view === 'city' ? (
                  <>
                    <span title="Folders with analyzed source files. tests/, docs/ and examples/ are excluded by default.">DISTRICT = FOLDER</span>
                    <span>HEIGHT = IMPORTANCE</span>
                    <span>GLOW = MAGNITUDE</span>
                  </>
                ) : (
                  <>
                    <span>{model.summary.edges} EDGES</span>
                    <span>{view === 'risk' ? 'COLOR = MAGNITUDE' : 'SIZE = IMPORTANCE'}</span>
                  </>
                )}
              </div>
              <div className="hud-hint">
                {view === 'city' ? 'DRAG ORBIT · RIGHT-DRAG PAN · SCROLL ZOOM' : 'SCROLL ZOOM · DRAG PAN · DBL-CLICK FIT'}
              </div>
            </div>
            {view === 'city' ? (
              <CityView
                model={model}
                snapshots={snapshots}
                time={time}
                selected={selected}
                highlight={highlight}
                onSelect={select}
              />
            ) : (
              <GraphView
                model={model}
                mode={view === 'risk' ? 'risk' : 'graph'}
                selected={selected}
                highlight={highlight}
                layers={layers}
                onSelect={select}
              />
            )}
            {view === 'city' && snapshots && <Timeline snapshots={snapshots} time={time} setTime={setTime} />}
            {view === 'city' && !snapshots && <div className="hud hud-bl">NO SNAPSHOTS — run `richter.cli snapshots` for time-travel</div>}
            <FileFinder model={model} onSelect={select} />
            <AskBar slug={slug} model={model} onHighlight={setHighlight} onSelect={select} />
          </main>
          <Inspector model={model} slug={slug} snapshots={snapshots} selected={selected} onSelect={select} />
        </>
      )}
      {error && <div className="fatal">{error}</div>}
      <BootScreen lines={boot} done={booted} />
    </div>
  )
}
