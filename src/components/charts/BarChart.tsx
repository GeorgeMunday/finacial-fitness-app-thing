import { useState } from 'react'

export type Series = { key: string; label: string; color: string; values: number[] }
export type ChartTable = { columns: string[]; rows: string[][] }

type Props = {
  /** One label per group along the x axis ("Oct", "12 Oct"). */
  labels: string[]
  /** Bars drawn side by side in each group. */
  series: Series[]
  /** An optional neutral reference line on the same scale (one axis only). */
  line?: { label: string; values: number[] }
  xAxisLabel: string
  yAxisLabel: string
  /** Formats a value for the axis ticks. */
  formatTick: (v: number) => string
  /** The accessible summary read in place of the drawing. */
  summary: string
  /** Text shown above the chart for the selected group (defaults to the latest). */
  describe: (i: number) => string
  table: ChartTable
}

const W = 343
const H = 196
const M = { top: 10, right: 6, bottom: 26, left: 44 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

/** Rounds a maximum up to a tidy value so ticks read cleanly (e.g. 1,240 → 1,500). */
export function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10
  return step * p
}

/** A bar path with 4 px rounded data ends, anchored square to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function BarChart({ labels, series, line, xAxisLabel, yAxisLabel, formatTick, summary, describe, table }: Props) {
  const n = labels.length
  const [selected, setSelected] = useState(n - 1)
  const [asTable, setAsTable] = useState(false)
  const sel = Math.min(selected, n - 1)
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values), ...(line?.values ?? [])))
  const y = (v: number) => M.top + PH - (v / max) * PH
  const gw = PW / n
  const k = series.length
  const barW = Math.max(2, Math.min(18, (gw - 4) / k - 2))
  const groupW = k * barW + (k - 1) * 2
  const every = n <= 13 ? 1 : Math.ceil(n / 7)
  const showLabel = (i: number) => i === n - 1 || (n - 1 - i) % every === 0
  const ticks = [0, max / 2, max]
  const legend = [...series.map((s) => ({ label: s.label, color: s.color, dashed: false })), ...(line ? [{ label: line.label, color: 'var(--slate)', dashed: true }] : [])]

  return (
    <div className="flex flex-col gap-2">
      {legend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate" aria-label="Key">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="16" height="10" aria-hidden="true">
                {l.dashed ? <line x1="0" y1="5" x2="16" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray="4 3" /> : <rect width="16" height="10" rx="2" fill={l.color} />}
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="tabular min-h-6 text-sm" aria-live="polite">{describe(sel)}</p>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-left text-sm">
            <thead>
              <tr className="border-b border-fog text-slate">
                {table.columns.map((c, i) => <th key={c} scope="col" className={`py-2 font-normal ${i ? 'text-right' : ''}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r[0]} className="border-b border-fog">
                  {r.map((c, i) => (i === 0 ? <th key={i} scope="row" className="py-2 font-normal">{c}</th> : <td key={i} className="py-2 text-right">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="tabular h-auto w-full overflow-visible" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {/* recessive grid and y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--fog)" strokeWidth="1" />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--slate)">{formatTick(t)}</text>
            </g>
          ))}
          <text x={0} y={M.top - 2} fontSize="10" fill="var(--slate)" dy="-0.2em">{yAxisLabel}</text>
          {/* selected group band */}
          <rect x={M.left + sel * gw} y={M.top} width={gw} height={PH} fill="var(--fog)" opacity="0.45" rx="4" />
          {labels.map((label, i) => {
            const gx = M.left + i * gw + (gw - groupW) / 2
            return (
              <g key={label + i}>
                {series.map((s, j) => {
                  const v = s.values[i] ?? 0
                  if (v <= 0) return null
                  const top = y(v)
                  return <path key={s.key} d={barPath(gx + j * (barW + 2), top, barW, M.top + PH - top)} fill={s.color} />
                })}
                {showLabel(i) ? (
                  <text x={M.left + i * gw + gw / 2} y={H - M.bottom + 14} textAnchor="middle" fontSize="10" fill={i === sel ? 'var(--ink)' : 'var(--slate)'}>{label}</text>
                ) : null}
              </g>
            )
          })}
          {line ? (
            <>
              <polyline
                points={line.values.map((v, i) => `${M.left + i * gw + gw / 2},${y(v)}`).join(' ')}
                fill="none" stroke="var(--slate)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round"
              />
              {line.values.map((v, i) => (
                <circle key={i} cx={M.left + i * gw + gw / 2} cy={y(v)} r={n > 13 ? 0 : 3} fill="var(--slate)" stroke="var(--chalk)" strokeWidth="2" />
              ))}
            </>
          ) : null}
          <text x={M.left + PW / 2} y={H - 1} textAnchor="middle" fontSize="10" fill="var(--slate)">{xAxisLabel}</text>
          {/* hit targets wider than the marks: tap or hover a group to read its values */}
          {labels.map((label, i) => (
            <rect
              key={`hit-${label}-${i}`} x={M.left + i * gw} y={M.top} width={gw} height={PH + 18} fill="transparent" aria-hidden="true"
              onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)}
            />
          ))}
        </svg>
      )}
      <button type="button" className="min-h-11 self-start text-pond underline-offset-4 hover:underline" onClick={() => setAsTable((t) => !t)}>
        {asTable ? 'Show as chart' : 'Show as table'}
      </button>
    </div>
  )
}
