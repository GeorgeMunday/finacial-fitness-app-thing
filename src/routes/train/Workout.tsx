import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Minus, Plus } from 'lucide-react'
import { RestTimer } from '../../components/RestTimer'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { useRestTimer } from '../../hooks/useRestTimer'
import { useWakeLock } from '../../hooks/useWakeLock'
import { fromKg, toKg } from '../../domain/units'
import { ShortfallSheet, type Shortfall } from '../../components/train/ShortfallSheet'
import { Sheet } from '../../components/ui/Sheet'
import { suggestWeights } from '../../domain/programmes/plan'
import { applyProgression, progressionShortfalls } from '../../domain/programmes/progression'
import type { ProgressionOutcome } from '../../domain/programmes/types'
import { finishWorkout, getExercise, getWorkout, logSet, previousSets, routineExercises, searchExercises, workoutSets } from '../../domain/training'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'

function Stepper({ value, disabled, lessLabel, moreLabel, onLess, onMore }: { value: string; disabled: boolean; lessLabel: string; moreLabel: string; onLess: () => void; onMore: () => void }) {
  return (
    <div className="flex items-center rounded-xl border border-fog bg-surface">
      <button type="button" aria-label={lessLabel} disabled={disabled} onClick={onLess} className="flex size-11 items-center justify-center text-pond disabled:text-slate disabled:opacity-50">
        <Minus aria-hidden="true" size={18} />
      </button>
      <span className="min-w-0 flex-1 text-center tabular">{value}</span>
      <button type="button" aria-label={moreLabel} disabled={disabled} onClick={onMore} className="flex size-11 items-center justify-center text-pond disabled:text-slate disabled:opacity-50">
        <Plus aria-hidden="true" size={18} />
      </button>
    </div>
  )
}

type Row = { weight: number; reps: number; done: boolean; hint?: string }
type Block = { key: string; exerciseId: string; altExerciseId?: string | null; name: string; note?: string | null; rows: Row[] }

const range = (min: number, max: number) => (min === max ? '' : `${min}–${max}`)

/** One line for the toast: what to lift next time, for the first couple of lifts that moved or were held. */
function summarise(outcomes: ProgressionOutcome[], show: (kg: number) => string): string {
  const lines: string[] = []
  for (const o of outcomes) {
    if (o.result === 'not_done') continue
    if (o.result === 'progressed') lines.push(`${o.name}: ${show(o.toKg)} next time`)
    else if (o.result === 'held' || o.result === 'incomplete') lines.push(`${o.name}: same weight next time`)
    else if (o.result === 'stage_change') lines.push(`${o.name}: same weight, new reps next time`)
    else if (o.result === 'cycle_up') lines.push(`${o.name} training max: ${show(o.toKg)}`)
    else lines.push(`${o.name}: ${show(o.toKg)} next time after a ${o.result === 'deload' ? 'lighter reset' : o.result}`)
    if (lines.length === 2) break
  }
  return lines.length ? lines.join('. ') : 'Workout saved'
}

export default function Workout() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const unit = settings.weightUnit
  const step = unit === 'kg' ? 2.5 : 5
  const timer = useRestTimer(settings.restSeconds)
  const { data } = useAsync(async () => {
    const workout = await getWorkout(db, id)
    if (!workout) return null
    const logged = await workoutSets(db, id)
    const blocks: Block[] = []
    if (workout.programmeDayId) {
      // A programme day: sets, rep ranges and weights come from the plan; sets already logged tick their rows.
      const plan = await suggestWeights(db, workout.programmeDayId)
      const working = logged.filter((s) => !s.isWarmup)
      const cursor = new Map<string, number>()
      plan.forEach((pe, idx) => {
        const all = working.filter((s) => s.exerciseId === pe.exerciseId)
        const start = cursor.get(pe.exerciseId) ?? 0
        const lastForExercise = !plan.slice(idx + 1).some((x) => x.exerciseId === pe.exerciseId)
        const taken = lastForExercise ? all.slice(start) : all.slice(start, start + pe.sets.length)
        cursor.set(pe.exerciseId, start + pe.sets.length)
        const count = Math.max(pe.sets.length, taken.length)
        const rows: Row[] = Array.from({ length: count }, (_, i) => {
          const d = taken[i]
          const planned = pe.sets[Math.min(i, pe.sets.length - 1)]
          const hint = planned.amrap ? ` · ${planned.minReps}+` : range(planned.minReps, planned.maxReps) ? ` · ${range(planned.minReps, planned.maxReps)}` : ''
          return d
            ? { weight: fromKg(d.weightKg, unit), reps: d.reps, done: true, hint }
            : { weight: fromKg(planned.weightKg, unit), reps: planned.reps, done: false, hint }
        })
        blocks.push({ key: pe.dayExerciseId, exerciseId: pe.exerciseId, altExerciseId: pe.altExerciseId, name: pe.name, note: pe.note, rows })
      })
      const planned = new Set(plan.map((p) => p.exerciseId))
      for (const exId of new Set(working.map((s) => s.exerciseId))) {
        if (planned.has(exId)) continue
        const done = working.filter((s) => s.exerciseId === exId)
        blocks.push({
          key: exId, exerciseId: exId, name: (await getExercise(db, exId))?.name ?? 'Exercise',
          rows: done.map((d) => ({ weight: fromKg(d.weightKg, unit), reps: d.reps, done: true })),
        })
      }
      return { workout, blocks }
    }
    const plan = workout.routineId ? await routineExercises(db, workout.routineId) : []
    const ids = [...new Set([...plan.map((p) => p.exerciseId), ...logged.map((s) => s.exerciseId)])]
    for (const exId of ids) {
      const p = plan.find((x) => x.exerciseId === exId)
      const prev = await previousSets(db, exId)
      const done = logged.filter((s) => s.exerciseId === exId && !s.isWarmup)
      const count = Math.max(p?.targetSets ?? 0, prev.length, done.length, 1)
      const name = p?.name ?? (await getExercise(db, exId))?.name ?? 'Exercise'
      const rows: Row[] = Array.from({ length: count }, (_, i) => {
        const d = done[i]
        const src = d ?? prev[i] ?? prev[prev.length - 1]
        return { weight: src ? fromKg(src.weightKg, unit) : 0, reps: src?.reps ?? p?.targetReps ?? 8, done: !!d }
      })
      blocks.push({ key: exId, exerciseId: exId, name, rows })
    }
    return { workout, blocks }
  }, [db, id, unit])
  const [blocks, setBlocks] = useState<Block[]>([])
  useEffect(() => setBlocks(data?.blocks ?? []), [data])
  const [adding, setAdding] = useState('')
  const [swapping, setSwapping] = useState<number | null>(null)
  const [swapQ, setSwapQ] = useState('')
  const [shortfalls, setShortfalls] = useState<Shortfall[] | null>(null)
  const { data: swapMatches } = useAsync(() => (swapQ.trim() ? searchExercises(db, swapQ.trim(), 8) : Promise.resolve([])), [db, swapQ])
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const { data: matches } = useAsync(() => (adding.trim() ? searchExercises(db, adding.trim(), 8) : Promise.resolve([])), [db, adding])
  useWakeLock(!!data && !data.workout.endedAt)

  if (data === undefined) return null
  if (data === null) return <p>That workout couldn't be found.</p>

  /** A set is ticked only once it is stored; a failed save stays unticked with a Retry. */
  async function saveSet(bi: number, ri: number, exerciseId: string, row: Row) {
    const key = `${bi}:${ri}`
    setSaving((cur) => new Set(cur).add(key))
    try {
      await logSet(db, { workoutId: id, exerciseId, reps: row.reps, weightKg: toKg(row.weight, unit) })
      patch(bi, ri, { done: true })
      timer.start()
    } catch {
      toast.show("Couldn't save that set. Nothing was logged.", { action: { label: 'Retry', run: () => saveSet(bi, ri, exerciseId, row) } })
    } finally {
      setSaving((cur) => {
        const next = new Set(cur)
        next.delete(key)
        return next
      })
    }
  }

  const swap = async (bi: number, exerciseId: string, name: string) => {
    const prev = (await previousSets(db, exerciseId))[0]
    setBlocks((cur) => cur.map((bl, i) => (i !== bi ? bl : {
      ...bl, exerciseId, name, altExerciseId: null, note: null,
      rows: bl.rows.map((r) => ({ ...r, weight: prev ? fromKg(prev.weightKg, unit) : 0 })),
    })))
    setSwapping(null)
    setSwapQ('')
  }

  /** Stores the workout's end, then (for a programme day) moves the programme on and says what to lift next time. */
  async function complete(decisions: Record<string, 'miss' | 'ignore'>) {
    let message = 'Workout saved'
    if (data!.workout.programmeDayId) {
      message = summarise(await applyProgression(db, id, decisions), (kg) => `${fromKg(kg, unit)} ${unit}`)
    }
    setShortfalls(null)
    toast.show(message)
    navigate('/train', { replace: true })
  }

  const patch = (b: number, r: number, change: Partial<Row>) =>
    setBlocks((cur) => cur.map((bl, i) => (i !== b ? bl : { ...bl, rows: bl.rows.map((row, j) => (j === r ? { ...row, ...change } : row)) })))

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-xl font-semibold">Workout</h1>
      <RestTimer remaining={timer.remaining} running={timer.running} onAdd={() => timer.add(30)} onStop={timer.stop} />
      {blocks.map((b, bi) => (
        <section key={b.key} aria-label={b.name}>
          <h2 className="border-b border-fog pb-2 font-semibold"><Link to={`/train/exercise/${b.exerciseId}`}>{b.name}</Link></h2>
          {b.note ? <p className="pt-2 text-sm text-slate">{b.note}</p> : null}
          {b.rows.map((row, ri) => {
            const label = `set ${ri + 1} of ${b.name}`
            return (
              <div key={ri} className={`flex flex-col gap-2 border-b border-fog py-3 ${row.done ? 'text-slate' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate">{`Set ${ri + 1}${row.hint ?? ''}`}</span>
                  {!row.done ? (
                    <Button variant="quiet" aria-label={`Skip ${label}`} onClick={() => setBlocks((cur) => cur.map((bl, i) => (i === bi ? { ...bl, rows: bl.rows.filter((_, j) => j !== ri) } : bl)))}>
                      Skip set
                    </Button>
                  ) : null}
                  <Button
                    variant={row.done ? 'quiet' : 'secondary'} aria-label={row.done ? `Logged ${label}` : `Log ${label}`} disabled={row.done || saving.has(`${bi}:${ri}`)}
                    className={row.done ? 'text-pond' : ''}
                    onClick={() => void saveSet(bi, ri, b.exerciseId, row)}
                  >
                    <Check aria-hidden="true" size={20} strokeWidth={2.5} />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stepper
                    value={`${row.weight} ${unit}`} disabled={row.done}
                    lessLabel={`Less weight for ${label}`} moreLabel={`More weight for ${label}`}
                    onLess={() => patch(bi, ri, { weight: Math.max(0, row.weight - step) })} onMore={() => patch(bi, ri, { weight: row.weight + step })}
                  />
                  <Stepper
                    value={`×${row.reps}`} disabled={row.done}
                    lessLabel={`Fewer reps for ${label}`} moreLabel={`More reps for ${label}`}
                    onLess={() => patch(bi, ri, { reps: Math.max(1, row.reps - 1) })} onMore={() => patch(bi, ri, { reps: row.reps + 1 })}
                  />
                </div>
              </div>
            )
          })}
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => setBlocks((cur) => cur.map((bl, i) => (i === bi ? { ...bl, rows: [...bl.rows, { ...(bl.rows[bl.rows.length - 1] ?? { weight: 0, reps: 8 }), done: false }] } : bl)))}>
              Add set
            </Button>
            {data.workout.programmeDayId && !b.rows.some((r) => r.done) ? (
              <Button variant="quiet" aria-label={`Swap ${b.name}`} onClick={() => setSwapping(bi)}>Swap exercise</Button>
            ) : null}
          </div>
        </section>
      ))}
      <section aria-label="Add exercise" className="flex flex-col gap-1">
        <label className="flex flex-col gap-1">
          Add exercise
          <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" type="search" value={adding} onChange={(e) => setAdding(e.target.value)} />
        </label>
        {matches?.map((m) => (
          <button
            key={m.id} className="min-h-11 border-b border-fog text-left"
            onClick={async () => {
              const prev = await previousSets(db, m.id)
              const first = prev[0]
              setBlocks((cur) => (cur.some((c) => c.exerciseId === m.id) ? cur : [...cur, { key: m.id, exerciseId: m.id, name: m.name, rows: [{ weight: first ? fromKg(first.weightKg, unit) : 0, reps: first?.reps ?? 8, done: false }] }]))
              setAdding('')
            }}
          >
            {m.name}
          </button>
        ))}
      </section>
      <Button
        onClick={async () => {
          await finishWorkout(db, id)
          timer.stop()
          if (data.workout.programmeDayId) {
            const short = await progressionShortfalls(db, id)
            if (short.length) {
              setShortfalls(short)
              return
            }
          }
          await complete({})
        }}
      >
        Finish workout
      </Button>
      <ShortfallSheet shortfalls={shortfalls} onSave={complete} />
      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title="Swap exercise">
        <div className="flex flex-col gap-1">
          {swapping !== null && blocks[swapping]?.altExerciseId ? <AltOption id={blocks[swapping].altExerciseId!} onPick={(exId, name) => void swap(swapping, exId, name)} /> : null}
          <label className="flex flex-col gap-1">
            Search exercises
            <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" type="search" value={swapQ} onChange={(e) => setSwapQ(e.target.value)} />
          </label>
          {swapMatches?.map((m) => (
            <button key={m.id} className="min-h-11 border-b border-fog text-left" onClick={() => swapping !== null && void swap(swapping, m.id, m.name)}>{m.name}</button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/** The programme's suggested alternative (for example pull-ups for lat pulldowns), shown first in the swap sheet. */
function AltOption({ id, onPick }: { id: string; onPick: (exerciseId: string, name: string) => void }) {
  const db = useDb()
  const { data } = useAsync(() => getExercise(db, id), [db, id])
  if (!data) return null
  return <button className="min-h-11 border-b border-fog text-left font-semibold" onClick={() => onPick(data.id, data.name)}>{data.name}</button>
}
