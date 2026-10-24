import { useLayoutEffect, useRef, useState } from 'react'
import { pollJob, startAnalyze, STATIC } from '../lib/data'
import type { Job } from '../lib/data'
import type { RepoEntry, View } from '../lib/types'
import { RepoPicker } from './RepoPicker'
import { Seismo } from './Seismo'

interface Props {
  repos: RepoEntry[]
  slug: string | null
  onRepo: (slug: string) => void
  view: View
  onView: (v: View) => void
  onAnalyzed: (slug: string) => void
  cityReady: boolean
}

const VIEWS: { id: View; label: string; short: string; key: string }[] = [
  { id: 'graph', label: 'DEPENDENCY GRAPH', short: 'GRAPH', key: '1' },
  { id: 'risk', label: 'RISK MAP', short: 'RISK', key: '2' },
  { id: 'city', label: 'CODE CITY', short: 'CITY', key: '3' },
]

const STAGES: Job['stage'][] = ['queued', 'clone', 'history', 'score', 'done']

export function TopBar({ repos, slug, onRepo, view, onView, onAnalyzed, cityReady }: Props) {
  const [url, setUrl] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // callout pointing at the CODE CITY tab, shown on every visit until the city is opened
  // (or the callout dismissed) during that visit
  const cityTab = useRef<HTMLButtonElement>(null)
  const [hintSeen, setHintSeen] = useState(false)
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null)
  const dismissHint = () => setHintSeen(true)

  // matching callout under the repo switcher, until the visitor switches repo or dismisses it
  const [repoHintSeen, setRepoHintSeen] = useState(false)
  const [firstSlug, setFirstSlug] = useState(slug)
  if (firstSlug === null && slug !== null) setFirstSlug(slug)
  else if (firstSlug !== null && slug !== firstSlug && !repoHintSeen) setRepoHintSeen(true)
  const [repoPos, setRepoPos] = useState<{ x: number; y: number } | null>(null)
  const openPicker = () => {
    setRepoHintSeen(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' })) // RepoPicker's shortcut
  }
  // opening the city by any route (tab, key 3, callout) retires the hint; React's
  // "adjust state while rendering" pattern, guarded so it runs once
  if (view === 'city' && !hintSeen) dismissHint()
  useLayoutEffect(() => {
    const place = () => {
      const r = cityTab.current?.getBoundingClientRect()
      setHintPos(r ? { x: r.left, y: r.bottom } : null)
      const p = document.querySelector('.picker-btn')?.getBoundingClientRect()
      setRepoPos(p ? { x: p.left + 12, y: p.bottom } : null)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [repos, slug])
  const showHint = !hintSeen && view !== 'city' && cityReady && hintPos
  const showRepoHint = !repoHintSeen && repos.length > 1 && repoPos

  const run = async () => {
    setErr(null)
    try {
      let j = await startAnalyze(url.trim())
      setJob(j)
      while (j.stage !== 'done' && j.stage !== 'error') {
        await new Promise((r) => setTimeout(r, 900))
        j = await pollJob(j.id)
        setJob(j)
      }
      if (j.stage === 'error') setErr(j.detail)
      else if (j.slug) {
        onAnalyzed(j.slug)
        setUrl('')
      }
    } catch (e) {
      setErr((e as Error).message.includes('Failed') ? 'API offline — start the backend to analyze new repos' : (e as Error).message)
    } finally {
      setTimeout(() => setJob(null), 1600)
    }
  }
  const running = job && job.stage !== 'done' && job.stage !== 'error'

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-word">RICHTER</span>
        <Seismo level={running ? 0.9 : 0.22} color={running ? '#ff6a1a' : '#4d8583'} height={20} />
      </div>

      <RepoPicker repos={repos} slug={slug} onRepo={onRepo} />

      <nav className="views" aria-label="view">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            ref={v.id === 'city' ? cityTab : undefined}
            className={`view-tab ${view === v.id ? 'is-on' : ''} ${v.id === 'city' && showHint ? 'is-beckon' : ''}`}
            onClick={() => onView(v.id)}
            disabled={v.id === 'city' && !cityReady}
          >
            <kbd>{v.key}</kbd>
            <span className="long">{v.label}</span>
            <span className="short">{v.short}</span>
            {v.id === 'city' && <span className="tab-3d">3D</span>}
          </button>
        ))}
      </nav>

      {STATIC ? (
        <a className="analyze analyze-demo" href="https://github.com/asil-eng/richter#-run-it" target="_blank" rel="noreferrer">
          <span>LIVE DEMO · 4 REPOS</span>
          <b>ANALYZE YOUR REPO →</b>
        </a>
      ) : (
      <form
        className={`analyze ${running ? 'is-running' : ''} ${err ? 'is-err' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim() && !running) run()
        }}
      >
        {running ? (
          <div className="analyze-status">
            <div className="analyze-steps">
              {STAGES.slice(1, 4).map((s) => (
                <span key={s} className={STAGES.indexOf(job!.stage) > STAGES.indexOf(s) ? 'done' : job!.stage === s ? 'now' : ''}>
                  {s.toUpperCase()}
                </span>
              ))}
            </div>
            <div className="analyze-detail">{job!.detail}</div>
          </div>
        ) : (
          <>
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setErr(null)
              }}
              placeholder={err ?? 'github.com/owner/repo'}
              spellCheck={false}
              aria-label="GitHub repository URL"
            />
            <button type="submit">ANALYZE</button>
          </>
        )}
      </form>
      )}
      {showRepoHint && (
        <div className="city-hint repo-hint" style={{ left: repoPos.x, top: repoPos.y + 10 }}>
          <button className="city-hint-go" onClick={openPicker}>
            <span className="city-hint-icon">⇄</span>
            <span>
              <b>Try another repo</b>
              <small>
                {repos.length} analyzed ·{' '}
                {[...repos]
                  .filter((r) => r.slug !== slug)
                  .sort((a, b) => b.summary.files - a.summary.files)
                  .slice(0, 2)
                  .map((r) => r.name.split('/')[1] ?? r.name)
                  .join(', ')}
                …
              </small>
            </span>
            <span className="city-hint-arrow">→</span>
          </button>
          <button className="city-hint-x" onClick={() => setRepoHintSeen(true)} aria-label="dismiss">
            ✕
          </button>
        </div>
      )}
      {showHint && (
        <div className="city-hint city-hint-left" style={{ left: hintPos.x, top: hintPos.y + 10 }}>
          <button className="city-hint-go" onClick={() => onView('city')}>
            <span className="city-hint-icon">▲</span>
            <span>
              <b>See this repo as a 3D city</b>
              <small>towers = files · glow = risk · replay its history</small>
            </span>
            <span className="city-hint-arrow">→</span>
          </button>
          <button className="city-hint-x" onClick={dismissHint} aria-label="dismiss">
            ✕
          </button>
        </div>
      )}
    </header>
  )
}
