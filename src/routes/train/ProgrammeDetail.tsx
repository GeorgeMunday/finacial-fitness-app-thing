import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import { localDate } from '../../domain/dates'
import { copyProgrammeToRoutines, getProgramme, type ProgrammeSummary } from '../../domain/programmes/catalog'
import { roundKg } from '../../domain/programmes/rounding'
import { defaultStartKg, defaultTrainingMaxKg, estimateTrainingMax, programmeLifts, startProgramme, type StartLift } from '../../domain/programmes/start'
import { fromKg, parseWeight, toKg } from '../../domain/units'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { daysLabel, levelLabel } from './Programmes'

type Lift = StartLift & { equipment: string | null }

const TIER_LABEL: Record<string, string> = { t1: 'T1', t2: 'T2', t3: 'T3', power: 'power', hypertrophy: 'hypertrophy' }
/** Names a lift for the weights form; the same exercise can appear twice (GZCLP tiers, PHUL's two leg curls). */
export function liftLabel(l: Lift): string {
  const suffix = l.liftKey.split('|')[1]
  const base = l.kind === 'trainingMax' ? `${l.name} training max` : l.name
  return suffix && TIER_LABEL[suffix] ? `${base} (${TIER_LABEL[suffix]})` : base
}

const range = (e: { repMin: number; repMax: number }) => (e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`)
function prescription(e: ProgrammeSummary['days'][number]['exercises'][number]): string {
  if (e.tier === 'm531') return `${e.sets} working sets`
  if (e.tier === 'bw') return `${e.sets}× as many reps as you can`
  return `${e.sets}×${range(e)}${e.amrap ? '+' : ''}`
}

export default function ProgrammeDetail() {
  const { key = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const unit = settings.weightUnit
  const { data } = useAsync(async () => {
    const programme = await getProgramme(db, key)
    if (!programme) return null
    const lifts = await programmeLifts(db, programme.id)
    const [prev] = await db.all<{ lifts: string }>('SELECT lifts FROM programme_progress WHERE programme_id = ?', [programme.id])
    const before = prev ? (JSON.parse(prev.lifts) as Record<string, { weightKg: number; trainingMaxKg?: number }>) : {}
    const prefill: Record<string, string> = {}
    for (const l of lifts) {
      const kg = before[l.liftKey] ? (before[l.liftKey].trainingMaxKg ?? before[l.liftKey].weightKg) : l.kind === 'trainingMax' ? await estimateTrainingMax(db, l.exerciseId) : null
      if (kg != null) prefill[l.liftKey] = String(fromKg(kg, unit))
    }
    return { programme, lifts, prefill }
  }, [db, key, unit])

  const [values, setValues] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => {
    if (data) {
      setValues(data.prefill)
      setDays(data.programme.daysPerWeekOptions[0])
    }
  }, [data])

  if (data === undefined) return null
  if (data === null) return <p>That programme couldn't be found.</p>
  const { programme: p, lifts } = data
  const bad = (id: string) => parseWeight(values[id] ?? '') === null
  const canStart = lifts.every((l) => !bad(l.liftKey))
  const fillDefaults = () => {
    const next: Record<string, string> = {}
    for (const l of lifts) {
      const kg = l.kind === 'trainingMax' ? defaultTrainingMaxKg(l.name) : defaultStartKg(l.name, l.equipment)
      next[l.liftKey] = String(fromKg(roundKg(kg, unit), unit))
    }
    setValues(next)
  }
  return (
    <div className="flex flex-col gap-5 pb-16">
      <Link to="/train/programmes" className="flex min-h-11 items-center self-start text-pond">All programmes</Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">{p.name}</h1>
        <p className="text-sm text-slate">{daysLabel(p.daysPerWeekOptions)} · {levelLabel(p.level)}{p.author ? ` · Credit: ${p.author}` : ''}</p>
        <p>{p.description}</p>
      </header>
      {p.days.map((d) => (
        <section key={d.id} aria-label={d.name}>
          <h2 className="border-b border-fog pb-2 font-semibold">{d.name}</h2>
          <ul>
            {d.exercises.map((e, i) => <li key={i} className="min-h-9 border-b border-fog py-2">{`${e.name} ${prescription(e)}`}</li>)}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-3" aria-label="Starting weights">
        <h2 className="font-display text-lg font-semibold">{p.progression === 'wendler531' ? 'Your training maxes' : 'Starting weights'}</h2>
        {p.progression === 'wendler531'
          ? <p className="text-slate">A training max is 90% of your one-rep max. If you are unsure, start light: the weights are small at first and rise each cycle.</p>
          : <p className="text-slate">Weights in {unit}. Pick something you can lift for every set with good form.</p>}
        {p.daysPerWeekOptions.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {p.daysPerWeekOptions.map((n) => <Chip key={n} selected={days === n} onClick={() => setDays(n)}>{n} days a week</Chip>)}
          </div>
        ) : null}
        <Button variant="secondary" className="self-start" onClick={fillDefaults}>I don't know, start light</Button>
        {lifts.map((l) => {
          const label = liftLabel(l)
          const showError = touched.has(l.liftKey) && bad(l.liftKey)
          return (
            <label key={l.liftKey} className="flex flex-col gap-1">
              {label}
              <input
                inputMode="decimal" className="min-h-11 rounded-xl border border-fog bg-surface px-3" value={values[l.liftKey] ?? ''}
                aria-invalid={showError || undefined}
                onChange={(e) => setValues((cur) => ({ ...cur, [l.liftKey]: e.target.value }))}
                onBlur={() => setTouched((cur) => new Set(cur).add(l.liftKey))}
              />
              {showError ? <span className="text-sm text-amber-ink">Use numbers like 60 or 62.5.</span> : null}
            </label>
          )
        })}
      </section>
      <Button
        variant="secondary"
        onClick={async () => {
          const [first] = await copyProgrammeToRoutines(db, p.id)
          toast.show('Copied to your routines')
          navigate(`/train/routine/${first}`)
        }}
      >
        Copy and edit
      </Button>
      <Button
        disabled={!canStart}
        onClick={async () => {
          const startKg: Record<string, number> = {}
          for (const l of lifts) startKg[l.liftKey] = toKg(parseWeight(values[l.liftKey])!, unit)
          await startProgramme(db, p.id, { onDate: localDate(), daysPerWeek: days ?? undefined, startKg })
          toast.show(`${p.name} started`)
          navigate('/train')
        }}
      >
        Start this programme
      </Button>
    </div>
  )
}
