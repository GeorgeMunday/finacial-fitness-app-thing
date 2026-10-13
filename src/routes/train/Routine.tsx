import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { createRoutine, customExercise, deleteRoutine, getRoutine, restoreRoutine, searchExercises, updateRoutine } from '../../domain/training'
import { useDb } from '../../state/DbProvider'

type Item = { exerciseId: string; name: string; targetSets: number; targetReps: number }

export default function Routine() {
  const { id } = useParams()
  const editing = id !== undefined && id !== 'new'
  const db = useDb()
  const { data: existing } = useAsync(() => (editing ? getRoutine(db, id) : Promise.resolve(undefined)), [db, id])
  if (editing && existing === undefined) return null
  if (editing && existing === null) return <p>That routine couldn't be found.</p>
  return <RoutineForm key={id} id={editing ? id : undefined} initial={existing ?? undefined} />
}

function RoutineForm({ id, initial }: { id?: string; initial?: { name: string; items: Item[] } }) {
  const editing = id !== undefined
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [items, setItems] = useState<Item[]>(initial?.items.map((i) => ({ exerciseId: i.exerciseId, name: i.name, targetSets: i.targetSets, targetReps: i.targetReps })) ?? [])
  const [q, setQ] = useState('')
  const { data: matches } = useAsync(() => (q.trim() ? searchExercises(db, q.trim(), 8) : Promise.resolve([])), [db, q])
  const add = (exerciseId: string, n: string) => {
    setItems((cur) => (cur.some((it) => it.exerciseId === exerciseId) ? cur : [...cur, { exerciseId, name: n, targetSets: 3, targetReps: 8 }]))
    setQ('')
  }
  const num = (i: number, k: 'targetSets' | 'targetReps', v: string) =>
    setItems((cur) => cur.map((it, j) => (j === i ? { ...it, [k]: Math.max(1, Math.min(50, Number(v) || 1)) } : it)))
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">{editing ? 'Edit routine' : 'New routine'}</h1>
      <label className="flex flex-col gap-1">Routine name<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {items.map((it, i) => (
        <div key={i} className="flex items-end gap-2 border-b border-fog py-2">
          <span className="min-w-0 flex-1 truncate">{it.name}</span>
          <label className="flex flex-col text-sm text-slate">Sets<input inputMode="numeric" className="min-h-11 w-16 rounded-xl border border-fog bg-surface px-2 text-ink" value={it.targetSets} onChange={(e) => num(i, 'targetSets', e.target.value)} /></label>
          <label className="flex flex-col text-sm text-slate">Reps<input inputMode="numeric" className="min-h-11 w-16 rounded-xl border border-fog bg-surface px-2 text-ink" value={it.targetReps} onChange={(e) => num(i, 'targetReps', e.target.value)} /></label>
          <Button variant="quiet" aria-label={`Remove ${it.name}`} onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}>Remove</Button>
        </div>
      ))}
      <label className="flex flex-col gap-1">Add exercise<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {matches?.map((m) => <button key={m.id} className="min-h-11 border-b border-fog text-left" onClick={() => add(m.id, m.name)}>{m.name}</button>)}
      {q.trim() ? <Button variant="quiet" className="self-start" onClick={async () => add(await customExercise(db, q), q.trim())}>Create “{q.trim()}”</Button> : null}
      <Button
        disabled={!name.trim() || items.length === 0}
        onClick={async () => {
          if (editing) await updateRoutine(db, id, name, items)
          else await createRoutine(db, name, items)
          toast.show('Routine saved')
          navigate('/train', { replace: true })
        }}
      >
        Save routine
      </Button>
      {editing ? (
        <Button
          variant="quiet" className="self-start"
          onClick={async () => {
            await deleteRoutine(db, id)
            toast.show('Routine deleted', { undo: () => restoreRoutine(db, id) })
            navigate('/train', { replace: true })
          }}
        >
          Delete routine
        </Button>
      ) : null}
    </div>
  )
}
