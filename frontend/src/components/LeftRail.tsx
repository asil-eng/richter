import { useMemo } from 'react'
import { descriptor, fmtM, heat } from '../lib/heat'
import { buildReport } from '../lib/report'
import type { RiskModel } from '../lib/types'
import { Gauge, Meter } from './Gauge'

interface Props {
  model: RiskModel
  selected: number | null
  onSelect: (i: number) => void
  layers: { ghost: boolean; bus: boolean }
  setLayers: (l: { ghost: boolean; bus: boolean }) => void
}

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()

export function LeftRail({ model, selected, onSelect, layers, setLayers }: Props) {
  const report = useMemo(() => buildReport(model), [model])
  const index = useMemo(() => new Map(model.nodes.map((n, i) => [n.id, i])), [model])
  const hottest = useMemo(
    () => [...model.nodes.keys()].sort((a, b) => model.nodes[b].magnitude - model.nodes[a].magnitude).slice(0, 10),
    [model],
  )
  const r = model.repo

  return (
    <aside className="rail rail-left">
      <section className="panel">
        <div className="label">SOURCE</div>
        <div className="repo-name">{r.name}</div>
        <div className="kv-inline">
          <span>{r.head.slice(0, 7)}</span>
          <span>
            {fmtDate(r.first_ts)} → {fmtDate(r.last_ts)}
          </span>
        </div>
        <div className="stat-grid">
          <Stat k="COMMITS" v={r.commits.toLocaleString()} />
          <Stat k="AUTHORS" v={r.authors.toLocaleString()} />
          <Stat k="FILES" v={model.summary.files} />
          <Stat k="IMPORTS" v={model.summary.edges} />
        </div>
      </section>

      <section className="panel report">
        <div className="label">
          REPO MAGNITUDE <span className="label-dim">/ report card</span>
        </div>
        <div className="report-head">
          <Gauge value={report.magnitude} size={176} />
          <div className="grade" style={{ borderColor: heat(report.magnitude / 10, 0.6) }}>
            <span className="grade-letter" style={{ color: heat(report.magnitude / 10) }}>
              {report.grade}
            </span>
            <span className="grade-sub">GRADE</span>
          </div>
        </div>
        <div className="report-reading">
          <span className="report-m">M {report.magnitude.toFixed(1)}</span>
          <span className="report-desc" style={{ color: heat(report.magnitude / 10) }}>
            {descriptor(report.magnitude)}
          </span>
        </div>
        <div className="signals">
          {report.signals.map((s) => (
            <div key={s.label} className="signal" title={s.detail}>
              <div className="signal-head">
                <span>{s.label}</span>
                <b>{Math.round(s.value * 100)}%</b>
              </div>
              <Meter value={s.value} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="label">TOP RISKS</div>
        <ol className="risks">
          {report.risks.map((rk, k) => (
            <li key={k}>
              <button className="risk" onClick={() => onSelect(index.get(rk.file)!)}>
                <span className={`risk-kind risk-${rk.kind.toLowerCase()}`}>{rk.kind}</span>
                <span className="risk-title">{rk.title}</span>
                <span className="risk-detail">{rk.detail}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel panel-grow">
        <div className="label">
          HOTTEST FILES <span className="label-dim">/ by magnitude</span>
        </div>
        <ul className="hotlist">
          {hottest.map((i, k) => {
            const n = model.nodes[i]
            return (
              <li key={n.id}>
                <button
                  className={`hot-row ${selected === i ? 'is-active' : ''}`}
                  onClick={() => onSelect(i)}
                  style={{ animationDelay: `${300 + k * 40}ms` }}
                >
                  <span className="hot-rank">{String(k + 1).padStart(2, '0')}</span>
                  <span className="hot-path" title={n.id}>
                    <span className="hot-dir">{n.dir === '.' ? '' : n.dir + '/'}</span>
                    {n.id.split('/').pop()}
                  </span>
                  <span className="hot-m" style={{ color: heat(n.magnitude) }}>
                    {fmtM(n.magnitude)}
                  </span>
                  <span className="hot-bar" style={{ transform: `scaleX(${n.magnitude})`, background: heat(n.magnitude) }} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="label">LAYERS</div>
        <Toggle
          on={layers.ghost}
          set={(v) => setLayers({ ...layers, ghost: v })}
          name="GHOST EDGES"
          hint={`${model.summary.ghost_edges} hidden couplings`}
          swatch={<span className="sw-ghost" />}
        />
        <Toggle
          on={layers.bus}
          set={(v) => setLayers({ ...layers, bus: v })}
          name="BUS FACTOR"
          hint={`${model.summary.bus_factor_files} single-author files`}
          swatch={<span className="sw-bus" />}
        />
        <div className="legend">
          <div className="legend-ramp" />
          <div className="legend-scale">
            <span>0</span>
            <span>2</span>
            <span>4</span>
            <span>6</span>
            <span>8</span>
            <span>10</span>
          </div>
        </div>
      </section>
    </aside>
  )
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
    </div>
  )
}

function Toggle({
  on,
  set,
  name,
  hint,
  swatch,
}: {
  on: boolean
  set: (v: boolean) => void
  name: string
  hint: string
  swatch: React.ReactNode
}) {
  return (
    <button className={`toggle ${on ? 'is-on' : ''}`} onClick={() => set(!on)} aria-pressed={on}>
      <span className="toggle-switch">
        <span className="toggle-knob" />
      </span>
      {swatch}
      <span className="toggle-name">{name}</span>
      <span className="toggle-hint">{hint}</span>
    </button>
  )
}
