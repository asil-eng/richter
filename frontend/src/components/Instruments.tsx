import { heat, shortName } from '../lib/heat'
import type { RiskModel } from '../lib/types'

// Small explanatory instruments for the file inspector. Both are clickable maps
// of the whole repo, so a first-time viewer sees the file *in context*.

const HOP = ['#fff0e6', '#ff2d1f', '#ff6a1a', '#ffb02e']

/** Every file on two axes: how much depends on it (x) and how often it's reworked (y). */
export function RiskQuadrant({ model, i, onSelect }: { model: RiskModel; i: number; onSelect: (j: number) => void }) {
  const W = 300
  const H = 200
  const pad = 14
  const X = (v: number) => pad + v * (W - pad * 2)
  const Y = (v: number) => H - pad - v * (H - pad * 2)
  const me = model.nodes[i]
  return (
    <svg className="quad" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="risk map of all files">
      {/* zones */}
      <rect x={X(0)} y={Y(1)} width={X(0.5) - X(0)} height={Y(0.5) - Y(1)} className="quad-z quad-churn" />
      <rect x={X(0.5)} y={Y(1)} width={X(1) - X(0.5)} height={Y(0.5) - Y(1)} className="quad-z quad-danger" />
      <rect x={X(0)} y={Y(0.5)} width={X(0.5) - X(0)} height={Y(0) - Y(0.5)} className="quad-z quad-quiet" />
      <rect x={X(0.5)} y={Y(0.5)} width={X(1) - X(0.5)} height={Y(0) - Y(0.5)} className="quad-z quad-load" />
      <line x1={X(0.5)} x2={X(0.5)} y1={Y(0)} y2={Y(1)} className="quad-mid" />
      <line x1={X(0)} x2={X(1)} y1={Y(0.5)} y2={Y(0.5)} className="quad-mid" />
      <text x={X(0) + 6} y={Y(1) + 14} className="quad-t">CHURNING</text>
      <text x={X(1) - 6} y={Y(1) + 14} className="quad-t quad-t-hot" textAnchor="end">DANGER ZONE</text>
      <text x={X(0) + 6} y={Y(0) - 8} className="quad-t">QUIET</text>
      <text x={X(1) - 6} y={Y(0) - 8} className="quad-t" textAnchor="end">LOAD-BEARING</text>

      {/* every other file */}
      {model.nodes.map((n, j) =>
        j === i ? null : (
          <circle
            key={j}
            cx={X(n.structural)}
            cy={Y(n.human)}
            r={2.6}
            fill={heat(n.magnitude, 0.75)}
            className="quad-dot"
            onClick={() => onSelect(j)}
          >
            <title>{`${n.id} · M ${(n.magnitude * 10).toFixed(1)}`}</title>
          </circle>
        ),
      )}

      {/* this file: crosshair + pulse */}
      <line x1={X(me.structural)} x2={X(me.structural)} y1={Y(0)} y2={Y(1)} className="quad-cross" />
      <line x1={X(0)} x2={X(1)} y1={Y(me.human)} y2={Y(me.human)} className="quad-cross" />
      <circle cx={X(me.structural)} cy={Y(me.human)} r={6} className="quad-pulse" style={{ stroke: heat(me.magnitude) }} />
      <circle cx={X(me.structural)} cy={Y(me.human)} r={5.5} fill={heat(me.magnitude)} stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}

/** The blast radius as a shockwave: epicenter in the middle, one ring per import hop. */
export function ShockRings({ model, i, onSelect }: { model: RiskModel; i: number; onSelect: (j: number) => void }) {
  const W = 300
  const H = 220
  const cx = W / 2
  const cy = H / 2
  const radii = [0, 42, 72, 100]
  const byHop = new Map<number, number[]>()
  for (const [j, h] of model.nodes[i].blast) byHop.set(Math.min(3, h), [...(byHop.get(Math.min(3, h)) ?? []), j])

  return (
    <svg className="shock" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="blast radius rings">
      {[1, 2, 3].map((h) => (
        <circle key={h} cx={cx} cy={cy} r={radii[h]} className="shock-ring" />
      ))}
      {[0, 1, 2].map((k) => (
        <circle key={`w${k}`} cx={cx} cy={cy} r={radii[3]} className="shock-wave" style={{ animationDelay: `${k * 0.9}s` }} />
      ))}
      {[1, 2, 3].map((h) => {
        const js = byHop.get(h) ?? []
        const shown = js.slice(0, 90)
        const r = shown.length > 40 ? 2.2 : 3.2
        return shown.map((j, k) => {
          const a = (k / shown.length) * Math.PI * 2 - Math.PI / 2 + h * 0.4
          return (
            <circle
              key={j}
              cx={cx + Math.cos(a) * radii[h]}
              cy={cy + Math.sin(a) * radii[h]}
              r={r}
              fill={HOP[h]}
              className="shock-dot"
              style={{ animationDelay: `${h * 260 + k * 6}ms` }}
              onClick={() => onSelect(j)}
            >
              <title>{`hop ${h}: ${shortName(model.nodes[j].id)}`}</title>
            </circle>
          )
        })
      })}
      <circle cx={cx} cy={cy} r={8} fill={HOP[0]} className="shock-core" />
      <circle cx={cx} cy={cy} r={8} fill="none" stroke="#ff2d1f" strokeWidth={2} />
    </svg>
  )
}
