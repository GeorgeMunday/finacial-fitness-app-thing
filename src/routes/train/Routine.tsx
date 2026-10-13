import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { createRoutine, customExercise, searchExercises } from '../../domain/training'
import { useDb } from '../../state/DbProvider'

type Item = { exerciseId: string; name: string; targetSets: number; targetReps: number }

export default function Routine() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const { data: matches } = useAsync(() => (q.trim() ? searchExercises(db, q.trim(), 8) : Promise.resolve([])), [db, q])
  const add = (exerciseId: string, n: string) => {
    setItems((cur) => [...cur, { exerciseId, name: n, targetSets: 3, targetReps: 8 }])
    setQ('')
  }
  const num = (i: number, k: 'targetSets' | 'targetReps', v: string) =>
    setItems((cur) => cur.map((it, j) => (j === i ? { ...it, [k]: Math.max(1, Math.min(50, Number(v) || 1)) } : it)))
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">New routine</h1>
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
          await createRoutine(db, name, items)
          toast.show('Routine saved')
          navigate('/train', { replace: true })
        }}
      >
        Save routine
      </Button>
    </div>
  )
}
