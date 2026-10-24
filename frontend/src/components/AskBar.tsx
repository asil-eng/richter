import { useEffect, useMemo, useRef, useState } from 'react'
import { askRepo } from '../lib/data'
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

// A command line, not a chat bubble: one question in, one plain-English reading out,
// with the named files targeted on the instrument.
export function AskBar({ slug, model, selected, onHighlight, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [focus, setFocus] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AskResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // the selected file is sent as context unless the user detaches it
  const [detached, setDetached] = useState<number | null>(null)
  const focusNode = selected !== null && selected !== detached ? model.nodes[selected] : null
  const [askedAbout, setAskedAbout] = useState<string | null>(null)

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
    if (top) out.push({ q: `Why is ${shortName(top.id)} so risky?`, tag: 'FILE', cached: false })
    if (wide && wide !== top) out.push({ q: `What breaks if I change ${shortName(wide.id)}?`, tag: 'IMPACT', cached: false })
    return out
  }, [model, focusNode])

  const filtered = q.trim()
    ? suggestions.filter((s) => s.q.toLowerCase().includes(q.trim().toLowerCase()))
    : suggestions
  const showSugs = focus && !busy && filtered.length > 0 && !(res && !q)

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

  const submit = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setErr(null)
    setRes(null)
    setAsked(text)
    setAskedAbout(focusNode?.id ?? null)
    setQ('')
    setCursor(-1)
    input.current?.blur()
    try {
      const r = await askRepo(slug, text, focusNode?.id)
      setRes(r)
      const idx = new Map(model.nodes.map((n, i) => [n.id, i]))
      onHighlight(new Set(r.files.map((f) => idx.get(f)!).filter((i) => i !== undefined)))
    } catch (e) {
      const m = (e as Error).message
      setErr(
        m.includes('API key')
          ? 'Free-form questions need an OpenAI key (OPENAI_API_KEY in .env). The suggested questions marked ⚡ work without one.'
          : m.includes('Failed to fetch') || m.includes('502')
            ? 'The Richter API is not reachable. Start the backend to ask new questions.'
            : m,
      )
      onHighlight(new Set())
    } finally {
      setBusy(false)
    }
  }
  const clear = () => {
    setRes(null)
    setErr(null)
    setAsked('')
    onHighlight(new Set())
  }
  const copy = async () => {
    if (!res) return
    await navigator.clipboard?.writeText(`${asked}\n\n${res.answer}\n\nFiles: ${res.files.join(', ')}`).catch(() => {})
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
      {(busy || res || err) && !showSugs && (
        <div className={`ask-card ${err ? 'is-err' : ''}`}>
          <div className="ask-card-head">
            <span className="ask-card-label">{busy ? 'READING' : err ? 'NO READING' : 'ANSWER'}</span>
            {res?.cached && <span className="ask-badge">⚡ CACHED</span>}
            {!busy && (
              <span className="ask-card-actions">
                {res && (
                  <button onClick={copy} className="ask-act">
                    {copied ? 'COPIED' : 'COPY'}
                  </button>
                )}
                <button onClick={clear} className="ask-act">
                  CLEAR ✕
                </button>
              </span>
            )}
          </div>
          <div className="ask-q">
            “{asked}”{askedAbout && <span className="ask-about"> — about {shortName(askedAbout)}</span>}
          </div>
          {busy && (
            <div className="ask-reading">
              <Seismo level={0.75} color="#ff6a1a" height={26} speed={1.6} />
              <span>Reading the risk model…</span>
            </div>
          )}
          {err && <p className="ask-err">{err}</p>}
          {res && (
            <>
              <p className="ask-answer">{res.answer}</p>
              {res.files.length > 0 && (
                <>
                  <div className="ask-files-head">
                    <span>{res.files.length} FILES</span>
                    <span className="ask-files-hint">highlighted on the map · click to open</span>
                  </div>
                  <div className="ask-files">
                    {res.files.map((f) => {
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
                </>
              )}
              {res.dropped > 0 && <div className="muted">{res.dropped} path(s) the model invented were discarded</div>}
            </>
          )}
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
        {focusNode ? (
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
          placeholder={focusNode ? 'Ask about this file or its folder…' : "Ask anything about this codebase's risk…"}
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
