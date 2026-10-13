import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonths, localDate, monthLabel } from '../../domain/dates'
import { formatPence } from '../../domain/money'
import { foodProgress, liftHistory, moneyProgress, topLifts, trackedLifts, trainingProgress } from '../../domain/profile'
import { listGoals, yearlySummary } from '../../domain/savings'
import { fromKg, toKg, type WeightUnit } from '../../domain/units'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { BarChart } from '../charts/BarChart'
import { LineChart } from '../charts/LineChart'
import { Chip } from '../ui/Chip'
import { Button } from '../ui/Button'

type Tab = 'money' | 'food' | 'train'
type Range = 3 | 6 | 12
const WEEKS: Record<Range, number> = { 3: 13, 6: 26, 12: 52 }

/** Whole pounds for axis ticks: "£1,200". */
const tickPounds = (p: number) => `£${Math.round(p / 100).toLocaleString('en-GB')}`
const longMonth = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long' })
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${monthLabel(d.slice(0, 7))}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** Periods from the first one with any activity: weeks before someone started tracking shouldn't drag averages down. */
const fromFirst = <T,>(xs: T[], active: (x: T) => boolean) => {
  const i = xs.findIndex(active)
  return i < 0 ? [] : xs.slice(i)
}

function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-fog bg-surface p-1">
      {options.map((o) => (
        <button
          key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-lg px-2 text-sm ${o.value === value ? 'bg-pond font-semibold text-on-pond' : 'text-slate'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-fog py-2">
      <dt className="text-slate">{label}</dt>
      <dd className="tabular font-display text-lg font-semibold">{value}</dd>
    </div>
  )
}

function Invite({ message, action, to }: { message: string; action: string; to: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-start gap-3 py-4">
      <p>{message}</p>
      <Button onClick={() => navigate(to)}>{action}</Button>
    </div>
  )
}

function MoneyProgress({ range, controls }: { range: Range; controls: ReactNode }) {
  const db = useDb()
  const today = localDate()
  const { data } = useAsync(async () => ({
    months: await moneyProgress(db, range, today),
    goals: await listGoals(db, today),
    savedThisYear: (await yearlySummary(db, Number(today.slice(0, 4)))).savedPence,
  }), [db, range, today])
  if (!data) return null
  const { months, goals, savedThisYear } = data
  const active = months.filter((m) => m.spentPence || m.savedPence || m.incomePence).length
  if (active < 2) return <Invite message="Log a few weeks of spending to see your trend" action="Add expense" to="/money/add?kind=expense" />
  const last = months[months.length - 1]
  const onTrack = goals.filter((g) => g.onTrack).length
  const hasIncome = months.some((m) => m.incomePence > 0)
  const line = (m: (typeof months)[number]) =>
    `${longMonth(m.month)}: spent ${formatPence(m.spentPence)}, saved ${formatPence(m.savedPence)}${hasIncome ? `, income ${formatPence(m.incomePence)}` : ''}`
  return (
    <>
      {controls}
      <BarChart
        labels={months.map((m) => monthLabel(m.month))}
        series={[
          { key: 'spent', label: 'Spent', color: 'var(--chart-spent)', values: months.map((m) => m.spentPence) },
          { key: 'saved', label: 'Saved', color: 'var(--chart-saved)', values: months.map((m) => m.savedPence) },
        ]}
        line={hasIncome ? { label: 'Income', values: months.map((m) => m.incomePence) } : undefined}
        xAxisLabel="Month" yAxisLabel="£ per month" formatTick={tickPounds}
        summary={`Spent ${formatPence(last.spentPence)} and saved ${formatPence(last.savedPence)} in ${longMonth(last.month)}${hasIncome ? `, with ${formatPence(last.incomePence)} income` : ''}. Chart of the last ${range} months.`}
        describe={(i) => line(months[i])}
        table={{
          columns: ['Month', 'Spent', 'Saved', ...(hasIncome ? ['Income'] : [])],
          rows: months.map((m) => [monthLabel(m.month), formatPence(m.spentPence), formatPence(m.savedPence), ...(hasIncome ? [formatPence(m.incomePence)] : [])]),
        }}
      />
      <dl>
        <Stat label="Average monthly spend" value={formatPence(Math.round(avg(fromFirst(months, (m) => m.spentPence > 0).map((m) => m.spentPence))))} />
        <Stat label="Saved this year" value={formatPence(savedThisYear)} />
        <Stat label="Savings goals on track" value={`${onTrack} of ${goals.length}`} />
      </dl>
    </>
  )
}

function FoodProgress({ range, controls }: { range: Range; controls: ReactNode }) {
  const db = useDb()
  const { settings } = useSettings()
  const today = localDate()
  const { data: weeks } = useAsync(() => foodProgress(db, WEEKS[range], today), [db, range, today, settings.hideCalories])
  if (!weeks) return null
  const days = weeks.reduce((a, w) => a + w.daysLogged, 0)
  if (days < 3) return <Invite message="Log food on a few days to see your protein trend" action="Log food" to="/food/search" />
  const logged = weeks.filter((w) => w.daysLogged > 0)
  const proteinPerDay = logged.reduce((a, w) => a + w.avgProteinG * w.daysLogged, 0) / days
  const kcalPerDay = settings.hideCalories ? undefined : logged.reduce((a, w) => a + (w.avgKcal ?? 0) * w.daysLogged, 0) / days
  const last = weeks[weeks.length - 1]
  const describe = (w: (typeof weeks)[number]) =>
    `Week of ${shortDay(w.weekStart)}: ${w.avgProteinG} g protein a day, ${w.daysLogged} of 7 days logged`
  return (
    <>
      {controls}
      <BarChart
        labels={weeks.map((w) => shortDay(w.weekStart))}
        series={[{ key: 'protein', label: 'Protein', color: 'var(--chart-spent)', values: weeks.map((w) => w.avgProteinG) }]}
        xAxisLabel="Week starting" yAxisLabel="g protein a day" formatTick={(v) => `${Math.round(v)}`}
        summary={`Protein per logged day, weekly averages over ${range} months. Latest week: ${last.avgProteinG} g a day, ${last.daysLogged} of 7 days logged.`}
        describe={(i) => describe(weeks[i])}
        table={{ columns: ['Week starting', 'Protein a day', 'Days logged'], rows: weeks.map((w) => [shortDay(w.weekStart), `${w.avgProteinG} g`, `${w.daysLogged} of 7`]) }}
      />
      <dl>
        <Stat label="Protein per logged day" value={`${Math.round(proteinPerDay)} g`} />
        <Stat label="Days logged per week" value={`${avg(fromFirst(weeks, (w) => w.daysLogged > 0).map((w) => w.daysLogged)).toFixed(1)} of 7`} />
        {kcalPerDay !== undefined ? <Stat label="Energy per logged day" value={`${Math.round(kcalPerDay).toLocaleString('en-GB')} kcal`} /> : null}
      </dl>
    </>
  )
}

/** A one-rep-max estimate in the user's unit: kg to 0.1, pounds to the nearest pound. */
const liftWeight = (kg: number, unit: WeightUnit) => (unit === 'kg' ? Math.round(kg * 10) / 10 : Math.round(kg / toKg(1, 'lb')))

function StrengthOverTime({ range }: { range: Range }) {
  const db = useDb()
  const { settings } = useSettings()
  const unit = settings.weightUnit
  const from = addMonths(localDate(), -range)
  const [picked, setPicked] = useState<string | null>(null)
  const { data: lifts } = useAsync(() => trackedLifts(db, from), [db, from])
  const current = lifts?.find((l) => l.exerciseId === picked) ?? lifts?.[0]
  const { data: history } = useAsync(() => (current ? liftHistory(db, current.exerciseId, from) : Promise.resolve([])), [db, current?.exerciseId, from])
  if (!lifts) return null
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">Strength over time</h3>
      {!current ? (
        <p className="text-slate">Log the same lift on two different days to see it here.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Lift">
            {lifts.map((l) => <Chip key={l.exerciseId} selected={l.exerciseId === current.exerciseId} onClick={() => setPicked(l.exerciseId)}>{l.name}</Chip>)}
          </div>
          {history && history.length >= 2 ? (() => {
            const w = history.map((h) => liftWeight(h.est1rmKg, unit))
            const change = Math.round((w[w.length - 1] - w[0]) * 10) / 10
            const moved = change === 0 ? 'no change' : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)} ${unit}`
            return (
              <LineChart
                key={current.exerciseId}
                points={history.map((h, i) => ({ date: h.logDate, value: w[i] }))}
                formatDate={shortDay}
                formatTick={(v) => `${Math.round(v)}`}
                yAxisLabel={`Estimated one-rep max (${unit})`}
                summary={`${current.name} estimated one-rep max over ${range} months: ${w[0]} ${unit} to ${w[w.length - 1]} ${unit}, ${moved} across ${history.length} sessions.`}
                describe={(i) => `${shortDay(history[i].logDate)}: ${w[i]} ${unit} estimated one-rep max, heaviest set ${fromKg(history[i].heaviestKg, unit)} ${unit}`}
                table={{
                  columns: ['Date', 'Estimated 1RM', 'Heaviest set'],
                  rows: history.map((h, i) => [shortDay(h.logDate), `${w[i]} ${unit}`, `${fromKg(h.heaviestKg, unit)} ${unit}`]),
                }}
              />
            )
          })() : null}
          <p className="text-sm text-slate">Estimated from your best set each day (weight × (1 + reps ÷ 30)).</p>
        </>
      )}
    </section>
  )
}

function TrainingProgress({ range, controls }: { range: Range; controls: ReactNode }) {
  const db = useDb()
  const { settings } = useSettings()
  const unit = settings.weightUnit
  const today = localDate()
  const { data } = useAsync(async () => ({ weeks: await trainingProgress(db, WEEKS[range], today, unit), lifts: await topLifts(db, 3) }), [db, range, today, unit])
  if (!data) return null
  const { weeks, lifts } = data
  const total = weeks.reduce((a, w) => a + w.workouts, 0)
  if (total < 2) return <Invite message="Log a couple of workouts to see your training trend" action="Start a workout" to="/train" />
  const last = weeks[weeks.length - 1]
  const labels = weeks.map((w) => shortDay(w.weekStart))
  return (
    <>
      {controls}
      <StrengthOverTime range={range} />
      <h3 className="font-semibold">Workouts per week</h3>
      <BarChart
        labels={labels}
        series={[{ key: 'workouts', label: 'Workouts', color: 'var(--chart-spent)', values: weeks.map((w) => w.workouts) }]}
        xAxisLabel="Week starting" yAxisLabel="workouts" formatTick={(v) => `${Math.round(v * 10) / 10}`}
        summary={`Workouts per week over ${range} months: ${total} in total, ${last.workouts} in the latest week.`}
        describe={(i) => `Week of ${labels[i]}: ${weeks[i].workouts} ${weeks[i].workouts === 1 ? 'workout' : 'workouts'}`}
        table={{ columns: ['Week starting', 'Workouts'], rows: weeks.map((w, i) => [labels[i], String(w.workouts)]) }}
      />
      <h3 className="font-semibold">Volume per week</h3>
      <BarChart
        labels={labels}
        series={[{ key: 'volume', label: 'Volume', color: 'var(--chart-spent)', values: weeks.map((w) => w.volume) }]}
        xAxisLabel="Week starting" yAxisLabel={`${unit} lifted (sets × reps × weight)`} formatTick={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`)}
        summary={`Volume lifted per week in ${unit} over ${range} months. Latest week: ${last.volume.toLocaleString('en-GB')} ${unit}.`}
        describe={(i) => `Week of ${labels[i]}: ${weeks[i].volume.toLocaleString('en-GB')} ${unit}`}
        table={{ columns: ['Week starting', `Volume (${unit})`], rows: weeks.map((w, i) => [labels[i], w.volume.toLocaleString('en-GB')]) }}
      />
      <dl>
        <Stat label="Workouts per week" value={avg(fromFirst(weeks, (w) => w.workouts > 0).map((w) => w.workouts)).toFixed(1)} />
        <Stat label="Total volume" value={`${weeks.reduce((a, w) => a + w.volume, 0).toLocaleString('en-GB')} ${unit}`} />
      </dl>
      {lifts.length ? (
        <section className="flex flex-col">
          <h3 className="font-semibold">Best lifts</h3>
          <ul aria-label="Best lifts">
            {lifts.map((l) => (
              <li key={l.exerciseId} className="flex min-h-14 items-center justify-between gap-3 border-b border-fog py-2">
                <span>{l.name}</span>
                <span className="tabular text-right">
                  <span className="font-semibold">{fromKg(l.est1rmKg, unit)} {unit}</span>
                  <span className="block text-sm text-slate">estimated 1 rep max</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** `asPage` makes the title the screen's one top-level heading (the Progress screen); otherwise it is a section of the profile. */
export function ProgressSection({ asPage = false }: { asPage?: boolean } = {}) {
  const { settings } = useSettings()
  const food = settings.optionalPillars.includes('food')
  const train = settings.optionalPillars.includes('train')
  const [tab, setTab] = useState<Tab>('money')
  const [range, setRange] = useState<Range>(3)
  const current: Tab = (tab === 'food' && !food) || (tab === 'train' && !train) ? 'money' : tab
  const tabs: { value: Tab; label: string }[] = [
    { value: 'money', label: 'Money' },
    ...(food ? [{ value: 'food' as const, label: 'Food' }] : []),
    ...(train ? [{ value: 'train' as const, label: 'Training' }] : []),
  ]
  // The range control only appears once there's something to range over.
  const controls = (
    <Segmented
      label="Range" value={range} onChange={setRange}
      options={[{ value: 3, label: '3 months' }, { value: 6, label: '6 months' }, { value: 12, label: '12 months' }]}
    />
  )
  let body: ReactNode
  if (current === 'money') body = <MoneyProgress range={range} controls={controls} />
  else if (current === 'food') body = <FoodProgress range={range} controls={controls} />
  else body = <TrainingProgress range={range} controls={controls} />
  return (
    <section aria-labelledby="progress" className="flex flex-col gap-4">
      {asPage
        ? <h1 id="progress" className="font-display text-xl font-semibold">Your progress</h1>
        : <h2 id="progress" className="font-display text-lg font-semibold">Your progress</h2>}
      {tabs.length > 1 ? <Segmented label="Progress for" options={tabs} value={current} onChange={setTab} /> : null}
      {body}
    </section>
  )
}

