import { useEffect, useMemo, useRef, useState } from 'react'
import { askRepo, LiveOnly, STATIC } from '../lib/data'
import type { Turn } from '../lib/data'
import { heat, shortName } from '../lib/heat'
import type { AskResult, RiskModel } from '../lib/types'
import { Seismo } from './Seismo'

// Precomputed for demo repos (backend agent.SUGGESTED_QUESTIONS) — answer instantly offline.
const CACHED = ['Which files are most fragile?', 'Where is hidden coupling?', 'What would break if I refactor the core?']

interface Suggestion {
  q: string
  tag: string
  cached: boolean
}

interface Props {
  slug: string
  model: RiskModel
  selected: number | null
  onHighlight: (files: Set<number>) => void
  onSelect: (i: number) => void
}

interface Exchange {
  q: string
  about: string | null
  res?: AskResult
  err?: string
}

// A command line, not a chat bubble: a running conversation about the repo's risk, where
// follow-ups ("and the safest one?") carry the earlier turns, and named files are targeted
// on the instrument.
export function AskBar({ slug, model, selected, onHighlight, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [thread, setThread] = useState<Exchange[]>([])
  const threadEnd = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // the selected file is sent as context unless the user detaches it
  const [detached, setDetached] = useState<number | null>(null)
  // the hosted demo only has precomputed whole-repo answers, so it never sends a focus
  const focusNode = !STATIC && selected !== null && selected !== detached ? model.nodes[selected] : null

  const suggestions = useMemo<Suggestion[]>(() => {
    if (focusNode) {
      const f = shortName(focusNode.id)
      return [
        { q: `What breaks if I change ${f}?`, tag: 'IMPACT', cached: false },
        { q: `Why is ${f} risky, and how do I change it safely?`, tag: 'FILE', cached: false },
        { q: `Which files in ${focusNode.dir}/ are the riskiest?`, tag: 'FOLDER', cached: false },
        { q: `What is ${f} secretly coupled to?`, tag: 'COUPLING', cached: false },
      ]
    }
    const top = [...model.nodes].sort((a, b) => b.magnitude - a.magnitude)[0]
    const wide = [...model.nodes].sort((a, b) => b.blast_size - a.blast_size)[0]
    const tags = ['FRAGILE', 'COUPLING', 'IMPACT']
    const out: Suggestion[] = CACHED.map((q, k) => ({ q, tag: tags[k], cached: true }))
    if (STATIC) return out
    if (top) out.push({ q: `Why is ${shortName(top.id)} so risky?`, tag: 'FILE', cached: false })
    if (wide && wide !== top) out.push({ q: `What breaks if I change ${shortName(wide.id)}?`, tag: 'IMPACT', cached: false })
    return out
  }, [model, focusNode])

  const filtered = q.trim()
    ? suggestions.filter((s) => s.q.toLowerCase().includes(q.trim().toLowerCase()))
    : suggestions
  // with a conversation open, an empty focused input keeps the thread visible for a follow-up
  const showSugs = focus && !busy && filtered.length > 0 && (thread.length === 0 || q.trim() !== '')

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end' })
  }, [thread, busy])

  // `A` focuses the ask bar from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      if (!typing && (e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const highlight = (files: string[]) => {
    const idx = new Map(model.nodes.map((n, i) => [n.id, i]))
    onHighlight(new Set(files.map((f) => idx.get(f)!).filter((i) => i !== undefined)))
  }

  const submit = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    const about = focusNode?.id ?? null
    const history: Turn[] = thread.filter((t) => t.res).slice(-6).map((t) => ({ q: t.q, a: t.res!.answer, about: t.about }))
    setThread((th) => [...th, { q: text, about }])
    setBusy(true)
    setQ('')
    setCursor(-1)
    const settle = (patch: Partial<Exchange>) => setThread((th) => th.map((t, k) => (k === th.length - 1 ? { ...t, ...patch } : t)))
    try {
      const r = await askRepo(slug, text, focusNode?.id, history)
      settle({ res: r })
      highlight(r.files)
    } catch (e) {
      const m = (e as Error).message
      settle({
        err:
          e instanceof LiveOnly
            ? history.length
              ? 'Follow-up questions need the live engine. Run Richter locally with an OpenAI key to have a full conversation.'
              : 'This hosted demo answers the ⚡ questions from a precomputed cache. Run Richter locally with an OpenAI key to ask anything, including questions about the selected file.'
            : m.includes('API key')
              ? 'Free-form questions need an OpenAI key (OPENAI_API_KEY in .env). The suggested questions marked ⚡ work without one.'
              : m.includes('Failed to fetch') || m.includes('502')
                ? 'The Richter API is not reachable. Start the backend to ask new questions.'
                : m,
      })
      onHighlight(new Set())
    } finally {
      setBusy(false)
    }
  }
  const clear = () => {
    setThread([])
    onHighlight(new Set())
  }
  const copy = async () => {
    const text = thread.map((t) => `Q: ${t.q}\nA: ${t.res?.answer ?? t.err ?? ''}`).join('\n\n')
    await navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && showSugs) {
      e.preventDefault()
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
    } else if (e.key === 'ArrowUp' && showSugs) {
      e.preventDefault()
      setCursor((c) => Math.max(-1, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit(cursor >= 0 && showSugs ? filtered[cursor].q : q)
    } else if (e.key === 'Escape') {
      if (q) setQ('')
      else input.current?.blur()
    }
  }

  return (
    <div className={`ask ${focus ? 'is-focus' : ''}`}>
      {thread.length > 0 && !showSugs && (
        <div className="ask-card">
          <div className="ask-card-head">
            <span className="ask-card-label">{busy ? 'READING' : 'CONVERSATION'}</span>
            <span className="ask-count">{thread.length} {thread.length === 1 ? 'QUESTION' : 'QUESTIONS'}</span>
            {!busy && (
              <span className="ask-card-actions">
                <button onClick={copy} className="ask-act">
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <button onClick={clear} className="ask-act">
                  NEW CHAT ✕
                </button>
              </span>
            )}
          </div>
          <div className="ask-thread">
            {thread.map((t, k) => (
              <div key={k} className={`ask-turn ${k === thread.length - 1 ? 'is-last' : ''}`}>
                <div className="ask-q">
                  “{t.q}”{t.about && <span className="ask-about"> — about {shortName(t.about)}</span>}
                  {t.res?.cached && <span className="ask-badge">⚡</span>}
                </div>
                {!t.res && !t.err && (
                  <div className="ask-reading">
                    <Seismo level={0.75} color="#ff6a1a" height={26} speed={1.6} />
                    <span>Reading the risk model…</span>
                  </div>
                )}
                {t.err && <p className="ask-err">{t.err}</p>}
                {t.res && (
                  <>
                    <p className="ask-answer">{t.res.answer}</p>
                    {t.res.files.length > 0 && (
                      <div className="ask-files">
                        {t.res.files.map((f) => {
                          const i = model.nodes.findIndex((n) => n.id === f)
                          const m = model.nodes[i]?.magnitude ?? 0
                          return (
                            <button key={f} className="ask-file" onClick={() => onSelect(i)} title={f}>
                              <i style={{ background: heat(m) }} />
                              {shortName(f)}
                              <b style={{ color: heat(m) }}>{(m * 10).toFixed(1)}</b>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {t.res.dropped > 0 && <div className="muted">{t.res.dropped} path(s) the model invented were discarded</div>}
                  </>
                )}
              </div>
            ))}
            <div ref={threadEnd} />
          </div>
        </div>
      )}

      {showSugs && (
        <div className="ask-pop" onMouseDown={(e) => e.preventDefault()}>
          <div className="ask-pop-head">
            <span>{q ? 'MATCHING' : focusNode ? `ASK ABOUT ${shortName(focusNode.id).toUpperCase()}` : 'TRY ASKING'}</span>
            <span className="ask-pop-hint">
              {focusNode ? "'this file' and 'this folder' mean your selection" : "answers come from this repo's risk model"}
            </span>
          </div>
          {filtered.map((s, k) => (
            <button
              key={s.q}
              className={`ask-sug ${k === cursor ? 'is-cursor' : ''}`}
              onMouseEnter={() => setCursor(k)}
              onClick={() => submit(s.q)}
            >
              <span className={`ask-tag tag-${s.tag.toLowerCase()}`}>{s.tag}</span>
              <span className="ask-sug-q">{s.q}</span>
              {s.cached && <span className="ask-sug-fast" title="precomputed, works offline">⚡</span>}
            </button>
          ))}
        </div>
      )}

      <form
        className={`ask-bar ${busy ? 'is-busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
      >
        <span className="ask-prompt">
          <span className="ask-dot" />
          ASK
        </span>
        {STATIC ? (
          <span className="ask-ctx ask-ctx-repo" title="Hosted demo: precomputed answers">DEMO · ⚡ CACHED</span>
        ) : focusNode ? (
          <span className="ask-ctx" title={`Questions are answered with ${focusNode.id} as context`}>
            <span className="ask-ctx-pin">◉</span>
            <span className="ask-ctx-file">{shortName(focusNode.id)}</span>
            <span className="ask-ctx-dir">{focusNode.dir === '.' ? '/' : focusNode.dir + '/'}</span>
            <button
              type="button"
              className="ask-ctx-x"
              onClick={() => setDetached(selected)}
              aria-label="ask about the whole repo instead"
            >
              ✕
            </button>
          </span>
        ) : (
          <span className="ask-ctx ask-ctx-repo">WHOLE REPO</span>
        )}
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(-1)
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={onKeyDown}
          placeholder={
            thread.length ? 'Ask a follow-up…' : focusNode ? 'Ask about this file or its folder…' : "Ask anything about this codebase's risk…"
          }
          spellCheck={false}
          aria-label="Ask the repo"
        />
        {!focus && !q && <kbd className="ask-kbd">A</kbd>}
        <button type="submit" className="ask-go" disabled={busy || !q.trim()} aria-label="run">
          {busy ? <span className="ask-spin" /> : <>RUN <span className="ask-enter">↵</span></>}
        </button>
        {busy && <div className="ask-scan" />}
      </form>
    </div>
  )
}
