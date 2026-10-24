import { useEffect, useMemo, useRef, useState } from 'react'
import type { RepoEntry } from '../lib/types'

// Searchable repo switcher. `/` opens it from anywhere; arrows + Enter pick.
export function RepoPicker({
  repos,
  slug,
  onRepo,
}: {
  repos: RepoEntry[]
  slug: string | null
  onRepo: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const current = repos.find((r) => r.slug === slug)

  const matches = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return repos.filter((r) => terms.every((t) => r.name.toLowerCase().includes(t)))
  }, [repos, q])

  const show = (v: boolean) => {
    setOpen(v)
    setQ('')
    setCursor(0)
  }
  const pick = (s: string) => {
    onRepo(s)
    show(false)
  }

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // `/` opens from anywhere; clicking outside closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        show(true)
      }
    }
    const onDown = (e: PointerEvent) => {
      if (open && !root.current?.contains(e.target as Node)) show(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(matches.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter' && matches[cursor]) {
      pick(matches[cursor].slug)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      show(false)
    }
  }

  const [owner, name] = current ? current.name.split('/') : ['', 'select repo']

  return (
    <div className={`picker ${open ? 'is-open' : ''}`} ref={root}>
      <button className="picker-btn" onClick={() => show(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="picker-label">REPO</span>
        <span className="picker-name">
          {owner && <span className="picker-owner">{owner}/</span>}
          {name}
        </span>
        <span className="picker-count">{repos.length}</span>
        <svg className="picker-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1.5 3.5 L5 7 L8.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      {open && (
        <div className="picker-pop" role="listbox">
          <div className="picker-search">
            <span className="picker-search-icon">⌕</span>
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setCursor(0)
              }}
              onKeyDown={onInputKey}
              placeholder="search analyzed repos"
              spellCheck={false}
              aria-label="Search repos"
            />
            <kbd>esc</kbd>
          </div>
          <ul className="picker-list">
            {matches.map((r, k) => (
              <li key={r.slug}>
                <button
                  className={`picker-row ${k === cursor ? 'is-cursor' : ''} ${r.slug === slug ? 'is-current' : ''}`}
                  onMouseEnter={() => setCursor(k)}
                  onClick={() => pick(r.slug)}
                  role="option"
                  aria-selected={r.slug === slug}
                >
                  <span className="picker-row-name">
                    <span className="picker-owner">{r.name.split('/')[0]}/</span>
                    {r.name.split('/')[1] ?? r.name}
                  </span>
                  <span className="picker-row-meta">
                    {r.summary.languages && Object.keys(r.summary.languages).length > 0 && (
                      <span className="picker-lang">{Object.keys(r.summary.languages).slice(0, 2).join(' · ')} · </span>
                    )}
                    {r.summary.files ? `${r.summary.files} files` : 'no supported files'} · {r.commits.toLocaleString()} commits
                  </span>
                  {r.has_snapshots && <span className="picker-tag">TIME-TRAVEL</span>}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="picker-empty">No analyzed repo matches “{q}”. Use ANALYZE to add it.</li>}
          </ul>
          <div className="picker-foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>enter</kbd> open
            </span>
            <span>
              <kbd>/</kbd> anywhere
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
