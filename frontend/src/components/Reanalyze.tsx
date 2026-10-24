import { useState } from 'react'
import { pollJob, startAnalyze } from '../lib/data'

// Models built before multi-language support have no `summary.languages`; an empty
// one may simply be stale, so offer a one-click refresh.
export function Reanalyze({ url, onDone }: { url: string; onDone: (slug: string) => void }) {
  const [state, setState] = useState<string | null>(null)
  const run = async () => {
    try {
      let j = await startAnalyze(url)
      while (j.stage !== 'done' && j.stage !== 'error') {
        setState(j.detail || j.stage)
        await new Promise((r) => setTimeout(r, 900))
        j = await pollJob(j.id)
      }
      if (j.stage === 'error') setState(`failed: ${j.detail}`)
      else if (j.slug) onDone(j.slug)
    } catch (e) {
      setState(`failed: ${(e as Error).message}`)
    }
  }
  return (
    <div className="reanalyze">
      <p>This result was produced before Richter could read other languages. Re-analyzing may find source files.</p>
      <button onClick={run} disabled={state !== null && !state.startsWith('failed')}>
        {state && !state.startsWith('failed') ? 'ANALYZING…' : 'RE-ANALYZE'}
      </button>
      {state && <span className="muted">{state}</span>}
    </div>
  )
}
