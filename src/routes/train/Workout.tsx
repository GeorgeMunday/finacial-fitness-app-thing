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

type Row = { weight: number; reps: number; done: boolean }
type Block = { exerciseId: string; name: string; rows: Row[] }

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
    const plan = workout.routineId ? await routineExercises(db, workout.routineId) : []
    const logged = await workoutSets(db, id)
    const ids = [...new Set([...plan.map((p) => p.exerciseId), ...logged.map((s) => s.exerciseId)])]
    const blocks: Block[] = []
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
      blocks.push({ exerciseId: exId, name, rows })
    }
    return { workout, blocks }
  }, [db, id, unit])
  const [blocks, setBlocks] = useState<Block[]>([])
  useEffect(() => setBlocks(data?.blocks ?? []), [data])
  const [adding, setAdding] = useState('')
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

  const patch = (b: number, r: number, change: Partial<Row>) =>
    setBlocks((cur) => cur.map((bl, i) => (i !== b ? bl : { ...bl, rows: bl.rows.map((row, j) => (j === r ? { ...row, ...change } : row)) })))

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-xl font-semibold">Workout</h1>
      <RestTimer remaining={timer.remaining} running={timer.running} onAdd={() => timer.add(30)} onStop={timer.stop} />
      {blocks.map((b, bi) => (
        <section key={b.exerciseId} aria-label={b.name}>
          <h2 className="border-b border-fog pb-2 font-semibold"><Link to={`/train/exercise/${b.exerciseId}`}>{b.name}</Link></h2>
          {b.rows.map((row, ri) => {
            const label = `set ${ri + 1} of ${b.name}`
            return (
              <div key={ri} className={`flex flex-col gap-2 border-b border-fog py-3 ${row.done ? 'text-slate' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate">Set {ri + 1}</span>
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
          <Button variant="quiet" onClick={() => setBlocks((cur) => cur.map((bl, i) => (i === bi ? { ...bl, rows: [...bl.rows, { ...bl.rows[bl.rows.length - 1], done: false }] } : bl)))}>
            Add set
          </Button>
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
              setBlocks((cur) => (cur.some((c) => c.exerciseId === m.id) ? cur : [...cur, { exerciseId: m.id, name: m.name, rows: [{ weight: first ? fromKg(first.weightKg, unit) : 0, reps: first?.reps ?? 8, done: false }] }]))
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
          toast.show('Workout saved')
          navigate('/train', { replace: true })
        }}
      >
        Finish workout
      </Button>
    </div>
  )
}
