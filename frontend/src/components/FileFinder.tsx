import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtM, heat } from '../lib/heat'
import type { RiskModel } from '../lib/types'

// Jump to any file by name. `f` focuses it from anywhere.
export function FileFinder({ model, onSelect }: { model: RiskModel; onSelect: (i: number) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return model.nodes
      .map((n, i) => ({ n, i, at: n.id.toLowerCase().lastIndexOf(needle) }))
      .filter((m) => m.at >= 0)
      // filename hits first, then the riskiest
      .sort((a, b) => Number(b.at > b.n.id.lastIndexOf('/')) - Number(a.at > a.n.id.lastIndexOf('/')) || b.n.magnitude - a.n.magnitude)
      .slice(0, 8)
  }, [model, q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      if (!typing && (e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (i: number) => {
    onSelect(i)
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className={`finder ${open && matches.length ? 'is-open' : ''}`}>
      <div className="finder-bar">
        <span className="finder-icon">⌕</span>
        <input
          ref={input}
          value={q}
          placeholder="find file"
          spellCheck={false}
          aria-label="Find file"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(matches.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter' && matches[cursor]) choose(matches[cursor].i)
            else if (e.key === 'Escape') {
              setQ('')
              input.current?.blur()
            }
          }}
        />
        {!q && <kbd>F</kbd>}
      </div>
      {open && q && (
        <ul className="finder-list">
          {matches.map((m, k) => (
            <li key={m.i}>
              <button
                className={k === cursor ? 'is-cursor' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setCursor(k)}
                onClick={() => choose(m.i)}
              >
                <span className="finder-path">
                  <span className="finder-dir">{m.n.dir === '.' ? '' : m.n.dir + '/'}</span>
                  {m.n.id.split('/').pop()}
                </span>
                <span className="finder-m" style={{ color: heat(m.n.magnitude) }}>
                  {fmtM(m.n.magnitude)}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="finder-none">no file matches “{q}”</li>}
        </ul>
      )}
    </div>
  )
}
