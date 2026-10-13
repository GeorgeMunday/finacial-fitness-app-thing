import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useAsync } from '../hooks/useAsync'
import { lastWorkoutDate, listRoutines, startWorkout } from '../domain/training'
import { useDb } from '../state/DbProvider'
import Exercise from './train/Exercise'
import Routine from './train/Routine'
import Workout from './train/Workout'

function TrainHome() {
  const db = useDb()
  const navigate = useNavigate()
  const { data } = useAsync(async () => ({
    routines: await listRoutines(db),
    last: await lastWorkoutDate(db),
    open: await db.all<{ id: string }>('SELECT id FROM workouts WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1'),
  }), [db])
  if (!data) return null
  const start = async (routineId?: string) => navigate(`/train/workout/${await startWorkout(db, routineId)}`)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-semibold">Train</h1>
      {data.last ? <p className="text-slate">Last workout {data.last}</p> : null}
      {data.open[0] ? <Link to={`/train/workout/${data.open[0].id}`} className="flex min-h-11 items-center text-pond">Carry on with your open workout</Link> : null}
      {data.routines.length === 0 ? <EmptyState message="No routines yet" action={{ label: 'New routine', onClick: () => navigate('/train/routine/new') }} /> : null}
      {data.routines.map((r) => (
        <div key={r.id} className="flex min-h-14 items-center justify-between border-b border-fog">
          <span>{r.name}</span>
          <Button variant="secondary" aria-label={`Start ${r.name}`} onClick={() => start(r.id)}>Start</Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button onClick={() => start()}>Start empty workout</Button>
        {data.routines.length > 0 ? <Button variant="secondary" onClick={() => navigate('/train/routine/new')}>New routine</Button> : null}
      </div>
    </div>
  )
}

export default function Train() {
  return (
    <Routes>
      <Route index element={<TrainHome />} />
      <Route path="routine/new" element={<Routine />} />
      <Route path="workout/:id" element={<Workout />} />
      <Route path="exercise/:id" element={<Exercise />} />
    </Routes>
  )
}
