import { useState } from 'react'
import { pollJob, startAnalyze } from '../lib/data'
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
            className={`view-tab ${view === v.id ? 'is-on' : ''}`}
            onClick={() => onView(v.id)}
            disabled={v.id === 'city' && !cityReady}
          >
            <kbd>{v.key}</kbd>
            <span className="long">{v.label}</span>
            <span className="short">{v.short}</span>
          </button>
        ))}
      </nav>

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
    </header>
  )
}
