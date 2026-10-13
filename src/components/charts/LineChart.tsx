import { useState } from 'react'
import { daysBetween } from '../../domain/dates'
import type { ChartTable } from './BarChart'

type Props = {
  /** One point per date (YYYY-MM-DD), oldest first. Dates set the x position, so gaps between sessions show. */
  points: { date: string; value: number }[]
  /** Short x tick for a date ("12 Oct"). */
  formatDate: (date: string) => string
  formatTick: (v: number) => string
  yAxisLabel: string
  /** The accessible summary read in place of the drawing. */
  summary: string
  /** Text shown above the chart for the selected point (defaults to the latest). */
  describe: (i: number) => string
  table: ChartTable
}

const W = 343
const H = 196
const M = { top: 12, right: 10, bottom: 20, left: 44 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

/** A tidy step (1, 2, 2.5 or 5 × 10ⁿ) that gives about `count` intervals over `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / count
  const p = 10 ** Math.floor(Math.log10(raw))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

/**
 * One series over time. The y axis is fitted to the data (not from zero) so steady progress is visible; the ticks
 * say where it starts. Tap or hover anywhere near a point to read it.
 */
export function LineChart({ points, formatDate, formatTick, yAxisLabel, summary, describe, table }: Props) {
  const n = points.length
  const [selected, setSelected] = useState(n - 1)
  const [asTable, setAsTable] = useState(false)
  const sel = Math.min(selected, n - 1)
  const values = points.map((p) => p.value)
  const lo0 = Math.min(...values)
  const hi0 = Math.max(...values)
  const step = niceStep(Math.max(hi0 - lo0, hi0 * 0.1, 1), 2)
  const lo = Math.max(0, Math.floor(lo0 / step) * step)
  const hi = Math.max(lo + step, Math.ceil(hi0 / step) * step)
  const ticks = [lo, (lo + hi) / 2, hi]
  const span = Math.max(1, daysBetween(points[0].date, points[n - 1].date))
  const x = (i: number) => (n === 1 ? M.left + PW / 2 : M.left + (daysBetween(points[0].date, points[i].date) / span) * PW)
  const y = (v: number) => M.top + PH - ((v - lo) / (hi - lo)) * PH
  // Hit areas run halfway to each neighbour, so every point is easy to tap even when sessions are close together.
  const edges = points.map((_, i) => (i === 0 ? M.left : (x(i - 1) + x(i)) / 2))

  return (
    <div className="flex flex-col gap-2">
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
        <div>
          <p className="text-xs text-slate" aria-hidden="true">{yAxisLabel}</p>
          <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="tabular h-auto w-full overflow-visible" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--fog)" strokeWidth="1" />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--slate)">{formatTick(t)}</text>
              </g>
            ))}
            {/* crosshair on the selected point */}
            <line x1={x(sel)} x2={x(sel)} y1={M.top} y2={M.top + PH} stroke="var(--slate)" strokeWidth="1" strokeDasharray="2 3" />
            <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--chart-spent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === sel ? 5 : n > 20 ? 0 : 4} fill="var(--chart-spent)" stroke="var(--chalk)" strokeWidth="2" />
            ))}
            {[0, n - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => (
              <text key={i} x={x(i)} y={H - M.bottom + 14} textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : 'end'} fontSize="10" fill="var(--slate)">{formatDate(points[i].date)}</text>
            ))}
            {points.map((p, i) => (
              <rect
                key={`hit-${p.date}`} x={edges[i]} y={M.top} width={(i === n - 1 ? M.left + PW : edges[i + 1]) - edges[i] || PW} height={PH + 18}
                fill="transparent" aria-hidden="true" onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)}
              />
            ))}
          </svg>
        </div>
      )}
      <button type="button" className="min-h-11 self-start text-pond underline-offset-4 hover:underline" onClick={() => setAsTable((t) => !t)}>
        {asTable ? 'Show as chart' : 'Show as table'}
      </button>
    </div>
  )
}
