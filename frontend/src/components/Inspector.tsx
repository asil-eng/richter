import { useEffect, useMemo, useState } from 'react'
import { fetchNote, STATIC } from '../lib/data'
import { descriptor, fmtM, heat, shortName } from '../lib/heat'
import type { Note, RiskModel, Snapshots } from '../lib/types'
import { Gauge, Meter } from './Gauge'
import { RiskQuadrant, ShockRings } from './Instruments'

interface Props {
  model: RiskModel
  slug: string
  snapshots: Snapshots | null
  selected: number | null
  onSelect: (i: number | null) => void
}

type Kind = 'guard' | 'unblock'

export function Inspector({ model, slug, snapshots, selected, onSelect }: Props) {
  if (selected === null || !model.nodes[selected]) return <EmptyInspector model={model} onSelect={onSelect} />
  return (
    <FileInspector key={`${slug}:${selected}`} model={model} slug={slug} snapshots={snapshots} i={selected} onSelect={onSelect} />
  )
}

function EmptyInspector({ model, onSelect }: { model: RiskModel; onSelect: (i: number) => void }) {
  const picks = useMemo(() => {
    const idx = [...model.nodes.keys()]
    const best = (score: (i: number) => number) => idx.reduce((a, b) => (score(b) > score(a) ? b : a), idx[0])
    const nodes = model.nodes
    const out = [
      { why: 'MOST DANGEROUS', i: best((i) => nodes[i].magnitude), note: (i: number) => `M ${fmtM(nodes[i].magnitude)} · fragile and reworked` },
      { why: 'WIDEST REACH', i: best((i) => nodes[i].blast_size), note: (i: number) => `${nodes[i].blast_size} files break if it changes` },
      { why: 'MOST REWORKED', i: best((i) => nodes[i].fixes), note: (i: number) => `${nodes[i].fixes} fix commits` },
    ]
    const lone = idx.filter((i) => nodes[i].bus_factor)
    if (lone.length) {
      const i = lone.reduce((a, b) => (nodes[b].magnitude > nodes[a].magnitude ? b : a))
      out.push({ why: 'ONE AUTHOR', i, note: () => 'only one person has ever changed it' })
    }
    return out
  }, [model])

  return (
    <aside className="rail rail-right">
      <section className="panel">
        <div className="label">START HERE</div>
        <div className="empty-title">Pick an epicenter</div>
        <p className="empty-copy">Click any file in the view, or one of these, to see what breaks if it changes.</p>
        <div className="starts">
          {picks.map((p) => (
            <button key={p.why} className="start" onClick={() => onSelect(p.i)}>
              <span className="start-why">{p.why}</span>
              <span className="start-file">{shortName(model.nodes[p.i].id)}</span>
              <span className="start-note">{p.note(p.i)}</span>
              <span className="start-m" style={{ color: heat(model.nodes[p.i].magnitude) }}>
                {fmtM(model.nodes[p.i].magnitude)}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="label">HOW TO READ</div>
        <ul className="legend-list">
          <li>
            <span className="lg-size">
              <i />
              <i />
              <i />
            </span>
            <span><b>Size</b> — importance: how central the file is</span>
          </li>
          <li>
            <span className="lg-ramp" />
            <span><b>Color</b> — magnitude 0–10: fragile <em>and</em> reworked</span>
          </li>
          <li>
            <span className="lg-hops">
              <i style={{ background: '#ff2d1f' }} />
              <i style={{ background: '#ff6a1a' }} />
              <i style={{ background: '#ffb02e' }} />
            </span>
            <span><b>After a click</b> — dependents 1, 2, 3+ hops away</span>
          </li>
          <li>
            <span className="lg-iso" />
            <span><b>Contours</b> — isoseismal lines M5–M8: where risk concentrates</span>
          </li>
          <li>
            <span className="lg-ghost" />
            <span><b>Ghost edge</b> — change together, never import each other</span>
          </li>
          <li>
            <span className="lg-bus" />
            <span><b>Broken ring</b> — only one author ever</span>
          </li>
        </ul>
      </section>
      <section className="panel panel-grow">
        <div className="label">KEYS</div>
        <div className="empty-keys">
          <span><kbd>1</kbd> graph</span>
          <span><kbd>2</kbd> risk map</span>
          <span><kbd>3</kbd> city</span>
          <span><kbd>F</kbd> find file</span>
          <span><kbd>/</kbd> switch repo</span>
          <span><kbd>esc</kbd> clear</span>
        </div>
      </section>
    </aside>
  )
}

const HOP_COLOR = ['#fff0e6', '#ff2d1f', '#ff6a1a', '#ffb02e']
const hopColor = (h: number) => HOP_COLOR[Math.min(3, h)]
const HOP_NOTE = ['', 'imports it directly', 'imports a hop-1 file', 'further downstream']

// One plain-English reading of where a file sits on the two axes.
function verdict(structural: number, human: number): { text: string; hot: boolean } {
  const s = structural >= 0.5
  const h = human >= 0.5
  if (s && h) return { text: 'Fragile and reworked — touch with care', hot: true }
  if (s) return { text: 'Load-bearing but stable', hot: false }
  if (h) return { text: 'Reworked often, but few files depend on it', hot: false }
  return { text: 'Quiet corner of the codebase', hot: false }
}

function FileInspector({
  model,
  slug,
  snapshots,
  i,
  onSelect,
}: {
  model: RiskModel
  slug: string
  snapshots: Snapshots | null
  i: number
  onSelect: Props['onSelect']
}) {
  const n = model.nodes[i]
  const [kind, setKind] = useState<Kind>(n.human > n.structural ? 'unblock' : 'guard')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const rings = useMemo(() => {
    const byHop = new Map<number, number[]>()
    for (const [j, h] of n.blast) byHop.set(h, [...(byHop.get(h) ?? []), j])
    for (const js of byHop.values()) js.sort((a, b) => model.nodes[b].importance - model.nodes[a].importance)
    return [...byHop.entries()].sort((a, b) => a[0] - b[0])
  }, [model, n])
  const partners = useMemo(
    () =>
      model.cochange
        .filter((c) => c.ghost && (c.a === i || c.b === i))
        .sort((a, b) => b.shared - a.shared)
        .map((c) => ({ j: c.a === i ? c.b : c.a, shared: c.shared })),
    [model, i],
  )
  const history = useMemo(() => snapshots?.frames.map((f) => ({ ts: f.ts, m: f.magnitude[i] })) ?? [], [snapshots, i])

  const parts = n.id.split('/')
  const file = parts.pop()
  const total = Math.max(1, model.nodes.length - 1)
  const pct = Math.round((n.blast_size / total) * 100)
  const m10 = n.magnitude * 10
  const v = verdict(n.structural, n.human)

  return (
    <aside className="rail rail-right">
      <section className="panel insp-head">
        <div className="label">
          EPICENTER
          <button className="x" onClick={() => onSelect(null)} aria-label="clear selection">
            ESC ✕
          </button>
        </div>
        <div className="insp-dir">
          {parts.join('/') || '.'}/<span className="insp-lang">{n.lang ?? 'python'}</span>
        </div>
        <div className="insp-file">{file}</div>

        <p className="insp-summary">
          Change <b>{file}</b> and{' '}
          {n.blast_size ? (
            <>
              <b className="hot">{n.blast_size} files</b> ({pct}% of {model.repo.name.split('/').pop()}) could break.
            </>
          ) : (
            <>nothing else in the repo imports it.</>
          )}{' '}
          It has been changed <b>{n.churn}×</b>, <b>{n.fixes}</b> of those were fixes, by <b>{n.authors}</b>{' '}
          {n.authors === 1 ? 'person' : 'people'}.
        </p>

        <div className="insp-gauge">
          <Gauge value={m10} size={168} />
          <div className="insp-gauge-side">
            <div className="insp-mag-num" style={{ color: heat(n.magnitude), textShadow: `0 0 28px ${heat(n.magnitude, 0.4)}` }}>
              {fmtM(n.magnitude)}
            </div>
            <div className="insp-desc" style={{ color: heat(n.magnitude) }}>
              {descriptor(m10)}
            </div>
          </div>
        </div>
        <div className={`insp-verdict ${v.hot ? 'is-hot' : ''}`}>{v.text}</div>
        {n.bus_factor && <div className="flag">BUS FACTOR 1 — one author has written every commit</div>}
      </section>

      <section className="panel">
        <div className="label">
          WHY IT'S RISKY <span className="label-dim">/ every file in the repo</span>
        </div>
        <RiskQuadrant model={model} i={i} onSelect={(j) => onSelect(j)} />
        <div className="axes">
          <Axis name="DEPENDED ON" hint="structural: importance + blast radius" value={n.structural} cool />
          <Axis name="REWORKED" hint="human: churn × fix ratio" value={n.human} />
        </div>
        <p className="caption">
          Right = more code depends on it. Up = more often fixed and reworked. The top-right corner is where changes hurt most.
        </p>
      </section>

      <section className="panel blast-card">
        <div className="label">BLAST RADIUS</div>
        <ShockRings model={model} i={i} onSelect={(j) => onSelect(j)} />
        <div className="blast-hero">
          <span className="blast-num" style={{ color: n.blast_size ? 'var(--orange)' : 'var(--text-2)' }}>
            {n.blast_size}
          </span>
          <span className="blast-copy">
            {n.blast_size === 1 ? 'file breaks' : 'files break'} if this changes
            <b>{pct}% of the codebase</b>
          </span>
        </div>
        <div className="blast-bar" title="share of the codebase, split by hops">
          {rings.map(([h, js]) => (
            <span key={h} style={{ width: `${(js.length / total) * 100}%`, background: hopColor(h) }} />
          ))}
        </div>
        <div className="blast-keys">
          {rings.map(([h, js]) => (
            <span key={h}>
              <i style={{ background: hopColor(h) }} />
              HOP {h} <b>{js.length}</b>
            </span>
          ))}
          {rings.length === 0 && <span className="muted">Nothing inside the repo imports it.</span>}
        </div>
        <p className="caption">
          Centre = this file. Ring 1 imports it directly, ring 2 imports ring 1, and so on. Click a dot to jump there.
        </p>
      </section>

      <section className="panel stats-strip">
        <Stat k="CHURN" v={n.churn} u="commits" />
        <Stat k="FIXES" v={n.fixes} u={`${Math.round(n.fix_ratio * 100)}% ratio`} hot={n.fix_ratio > 0.25} />
        <Stat k="AUTHORS" v={n.authors} u={n.authors === 1 ? 'only one' : 'people'} hot={n.bus_factor} />
        <Stat k="LOC" v={n.loc.toLocaleString()} u="lines" />
      </section>

      {history.some((h) => h.m !== null) && <History points={history} now={n.magnitude} />}

      <section className="panel">
        <div className="label">
          DOWNSTREAM <span className="label-dim">/ who breaks, nearest first</span>
        </div>
        {rings.length === 0 && <div className="muted">No in-repo dependents. Callers outside the repo may still rely on it.</div>}
        <div className="rings">
          {rings.map(([h, js]) => {
            const open = expanded.has(h)
            const shown = open ? js : js.slice(0, 8)
            return (
              <div key={h} className="ring" style={{ animationDelay: `${h * 200}ms`, borderColor: hopColor(h) }}>
                <div className="ring-h">
                  <span className="ring-dot" style={{ background: hopColor(h), color: hopColor(h) }} />
                  HOP {h}
                  <span className="ring-note">{HOP_NOTE[Math.min(3, h)]}</span>
                  <b>{js.length}</b>
                </div>
                <div className="chips">
                  {shown.map((j) => (
                    <button key={j} className="chip" onClick={() => onSelect(j)} title={model.nodes[j].id}>
                      <i className="chip-dot" style={{ background: heat(model.nodes[j].magnitude) }} />
                      {shortName(model.nodes[j].id)}
                    </button>
                  ))}
                  {js.length > 8 && (
                    <button
                      className="chip chip-more"
                      onClick={() =>
                        setExpanded((s) => {
                          const next = new Set(s)
                          if (open) next.delete(h)
                          else next.add(h)
                          return next
                        })
                      }
                    >
                      {open ? 'show less' : `+${js.length - 8} more`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {partners.length > 0 && (
        <section className="panel">
          <div className="label">
            HIDDEN COUPLING <span className="label-dim">/ change together, no import</span>
          </div>
          <div className="chips">
            {partners.slice(0, 8).map((p) => (
              <button key={p.j} className="chip chip-ghost" onClick={() => onSelect(p.j)} title={model.nodes[p.j].id}>
                {shortName(model.nodes[p.j].id)} <b>{p.shared}×</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel panel-grow agent">
        <div className="tabs">
          <button className={kind === 'guard' ? 'is-on' : ''} onClick={() => setKind('guard')}>
            GUARD NOTE
          </button>
          <button className={kind === 'unblock' ? 'is-on' : ''} onClick={() => setKind('unblock')}>
            UNBLOCK PLAN
          </button>
        </div>
        <AgentNote key={kind} slug={slug} file={n.id} kind={kind} />
      </section>
    </aside>
  )
}

function Axis({ name, hint, value, cool }: { name: string; hint: string; value: number; cool?: boolean }) {
  return (
    <div className="axis" title={hint}>
      <span className="axis-name">{name}</span>
      <Meter value={value} hot={!cool} />
      <span className="axis-val">{value.toFixed(2)}</span>
    </div>
  )
}

function Stat({ k, v, u, hot }: { k: string; v: string | number; u: string; hot?: boolean }) {
  return (
    <div className={`sstat ${hot ? 'is-hot' : ''}`}>
      <div className="sstat-k">{k}</div>
      <div className="sstat-v">{v}</div>
      <div className="sstat-u">{u}</div>
    </div>
  )
}

// Magnitude across the time-travel snapshots: when did this file become dangerous?
function History({ points, now }: { points: { ts: number; m: number | null }[]; now: number }) {
  const W = 300
  const H = 54
  const n = points.length
  const xy = points.map((p, k) => (p.m === null ? null : [(k / Math.max(1, n - 1)) * W, H - 4 - p.m * (H - 10)]))
  let d = ''
  xy.forEach((p, k) => {
    if (!p) return
    d += `${!xy[k - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)} `
  })
  const born = points.findIndex((p) => p.m !== null)
  const last = points[n - 1].m ?? 0
  const year = (ts: number) => new Date(ts * 1000).getFullYear()
  return (
    <section className="panel">
      <div className="label">
        MAGNITUDE OVER HISTORY <span className="label-dim">/ {points.length} snapshots</span>
      </div>
      <svg className="hist" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H - 4 - g * (H - 10)} y2={H - 4 - g * (H - 10)} className="hist-grid" />
        ))}
        <path d={d} className="hist-line" style={{ stroke: heat(last) }} />
        {xy[n - 1] && <circle cx={xy[n - 1]![0]} cy={xy[n - 1]![1]} r="3" fill={heat(last)} />}
      </svg>
      <div className="hist-axis">
        <span>{born > 0 ? `born ${year(points[born].ts)}` : year(points[0].ts)}</span>
        <span>now · M {fmtM(now)}</span>
      </div>
    </section>
  )
}

function AgentNote({ slug, file, kind }: { slug: string; file: string; kind: Kind }) {
  const [note, setNote] = useState<Note | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchNote(slug, file, kind)
      .then((r) => live && setNote(r))
      .catch((e: Error) => live && setErr(e.message))
    return () => {
      live = false
    }
  }, [slug, file, kind])

  if (err)
    return (
      <div className="note note-err">
        <div className="label-dim">{STATIC ? 'NOT IN THE DEMO CACHE' : 'AGENT OFFLINE'}</div>
        <p>
          {STATIC
            ? "The hosted demo ships AI notes for each repo's riskiest files and every START HERE pick. Run Richter locally with an OpenAI key to generate notes for any file."
            : `Notes need the Richter API running (uvicorn richter.api:app). ${err}`}
        </p>
      </div>
    )
  if (!note)
    return (
      <div className="note note-loading">
        <div className="scan" />
        <div className="label-dim">TRANSMITTING…</div>
        <div className="skeleton" style={{ width: '82%' }} />
        <div className="skeleton" style={{ width: '64%' }} />
        <div className="skeleton" style={{ width: '74%' }} />
      </div>
    )

  const list = kind === 'guard' ? note.what_breaks : note.plan
  return (
    <div className="note">
      <div className={`note-src ${note.source === 'ai' ? 'is-ai' : ''}`}>
        {note.source === 'ai' ? `AI · GPT-4O-MINI${note.cached ? ' · CACHED' : ''}` : 'RULE-BASED · NO API KEY'}
      </div>
      <div className="note-headline">{note.headline}</div>
      {kind === 'guard' ? <p>{note.why}</p> : <p>{note.diagnosis}</p>}
      {list && list.length > 0 && (
        <>
          <div className="label-dim">{kind === 'guard' ? 'WHAT BREAKS' : 'PLAN'}</div>
          <ol className="note-list">
            {list.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ol>
        </>
      )}
      {kind === 'guard' && note.checklist && (
        <>
          <div className="label-dim">BEFORE YOU MERGE</div>
          <ul className="note-check">
            {note.checklist.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {kind === 'unblock' && note.owner_hint && <p className="note-owner">{note.owner_hint}</p>}
    </div>
  )
}
