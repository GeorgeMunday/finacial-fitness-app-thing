import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NutritionPanel } from '../../components/NutritionPanel'
import { TallyMarks } from '../../components/ui/TallyMarks'
import { rangeStatus, ringProgress } from '../../domain/targets'
import type { Settings } from '../../state/settings'

type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number; fibreG: number; sugarsG: number; saltG: number; fibreUnknown: number }

const fmt = (n: number) => n.toLocaleString('en-GB')

/** A reach goal: fills toward 100% and stays full. Marigold with a tick once reached; never red. */
function Ring({ label, value, target }: { label: string; value: number; target: number }) {
  const p = ringProgress(value, target)!
  const R = 30
  const C = 2 * Math.PI * R
  return (
    <div className="flex items-center gap-2.5">
      <svg
        role="img" aria-label={p.done ? `${label} reached` : `${label} ${p.percent}% of your target, ${fmt(p.toGo)} g to go`}
        viewBox="0 0 72 72" width={60} height={60} className="shrink-0 -rotate-90"
      >
        <circle cx={36} cy={36} r={R} fill="none" stroke="var(--fog)" strokeWidth={7} />
        <circle
          cx={36} cy={36} r={R} fill="none" strokeWidth={7} strokeLinecap="round"
          stroke={p.done ? 'var(--marigold)' : 'var(--pond)'} strokeDasharray={C} strokeDashoffset={C * (1 - p.percent / 100)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
        />
      </svg>
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="whitespace-nowrap text-sm tabular">{`${fmt(value)} of ${fmt(target)} g`}</p>
        <p className="flex items-center gap-1 whitespace-nowrap text-sm text-slate">
          {p.done ? <><Check aria-hidden="true" size={16} className="text-amber-ink" /> Reached</> : `${fmt(p.toGo)} g to go`}
        </p>
      </div>
    </div>
  )
}

/** Calories, carbs and fat: where today sits against a ±10% band, in words. No score, no "over" colour. */
function RangeRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: 'kcal' | 'g' }) {
  const r = rangeStatus(value, target)
  const max = Math.max(r.high * 1.25, value)
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const u = unit === 'kcal' ? ' kcal' : ' g'
  const status = r.status === 'in' ? 'In your range' : r.status === 'below' ? `${fmt(r.toRange)}${u} to your range` : 'Above your range'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-slate tabular">{`${fmt(value)} of ${fmt(r.low)}–${fmt(r.high)}${u}`}</span>
      </div>
      <div aria-hidden="true" className="relative h-2.5 rounded-full bg-fog">
        <div className="absolute inset-y-0 rounded-full bg-pond/30" style={{ left: pct(r.low), width: `calc(${pct(r.high)} - ${pct(r.low)})` }} />
        <div className="absolute -top-1 h-[18px] w-1 -translate-x-1/2 rounded-full bg-pond" style={{ left: pct(value) }} />
      </div>
      <p className="text-sm">{status}</p>
    </div>
  )
}

const WEEKDAY = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })

export function TargetsCard({ totals, settings, week, streak }: {
  totals: Totals; settings: Settings; week: { date: string; reached: boolean }[] | null; streak: number
}) {
  const hide = settings.hideCalories
  const { proteinTarget: protein, fibreTarget: fibre, kcalTarget: kcal, carbsTarget: carbs, fatTarget: fat } = settings
  const any = protein || fibre || kcal || carbs || fat
  if (!any) {
    return (
      <section aria-label="Totals" className="flex flex-col gap-3">
        <div className="flex gap-6">
          {hide ? null : (
            <div>
              <p className="font-display text-2xl font-semibold tabular">{fmt(totals.kcal)}</p>
              <p className="text-sm text-slate">kcal</p>
            </div>
          )}
          <div>
            <p className="font-display text-2xl font-semibold tabular">{totals.proteinG} g</p>
            <p className="text-sm text-slate">protein</p>
          </div>
        </div>
        <Link to="/you/food/targets" className="flex min-h-11 items-center self-start text-pond">Set your targets</Link>
      </section>
    )
  }
  const reached = week?.filter((d) => d.reached).length ?? 0
  return (
    <section aria-label="Your targets" className="flex flex-col gap-5 rounded-2xl bg-surface p-4">
      {protein || fibre ? (
        <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
          {protein ? <Ring label="Protein" value={totals.proteinG} target={protein} /> : null}
          {fibre ? <Ring label="Fibre" value={totals.fibreG} target={fibre} /> : null}
        </div>
      ) : null}
      {fibre && totals.fibreUnknown > 0 ? (
        <p className="-mt-3 text-sm text-slate">{`${totals.fibreUnknown} ${totals.fibreUnknown === 1 ? 'entry has' : 'entries have'} no fibre information, so fibre may be higher.`}</p>
      ) : null}
      {!hide && kcal ? <RangeRow label="Calories" value={totals.kcal} target={kcal} unit="kcal" /> : null}
      {!hide && !kcal ? <p><span className="font-semibold">Calories</span> <span className="tabular">{`${fmt(totals.kcal)} kcal`}</span></p> : null}
      {carbs ? <RangeRow label="Carbs" value={totals.carbsG} target={carbs} unit="g" /> : null}
      {fat ? <RangeRow label="Fat" value={totals.fatG} target={fat} unit="g" /> : null}
      <NutritionPanel n={{ ...totals, fibreG: null, sugarsG: null, saltG: null }} hideCalories={hide} table={false} />
      {(protein && week) || streak > 0 ? (
        <div className="flex flex-col gap-3 border-t border-fog pt-4">
          {protein && week ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate">{`Protein target reached on ${reached} of the last 7 days`}</p>
              <ul aria-label={`Protein target, last 7 days: reached on ${reached}`} className="flex justify-between">
                {week.map((d) => (
                  <li key={d.date} aria-label={`${WEEKDAY(d.date)}: ${d.reached ? 'reached' : 'not reached'}`} className="flex flex-col items-center gap-1">
                    <span className={`flex size-7 items-center justify-center rounded-full ${d.reached ? 'bg-marigold text-on-marigold' : 'border-2 border-fog'}`}>
                      {d.reached ? <Check aria-hidden="true" size={14} /> : null}
                    </span>
                    <span aria-hidden="true" className="text-xs text-slate">{WEEKDAY(d.date).charAt(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {streak > 0 ? (
            <div className="flex flex-col gap-1">
              <TallyMarks percent={Math.min(streak, 20) * 5} seed="food-streak" label={`${streak} ${streak === 1 ? 'day' : 'days'} logged in a row`} />
              <p aria-hidden="true" className="text-sm text-slate">{`${streak} ${streak === 1 ? 'day' : 'days'} logged in a row`}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
