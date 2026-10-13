import { useFormatDate } from '../hooks/useFormatDate'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useAsync } from '../hooks/useAsync'
import { NextWorkoutCard } from '../components/train/NextWorkoutCard'
import { startProgrammeWorkout } from '../domain/programmes/plan'
import { activeProgramme } from '../domain/programmes/catalog'
import { localDate } from '../domain/dates'
import { lastWorkoutDate, listRoutines, startWorkout } from '../domain/training'
import { useDb } from '../state/DbProvider'
import Exercise from './train/Exercise'
import ProgrammeDetail from './train/ProgrammeDetail'
import Programmes from './train/Programmes'
import Routine from './train/Routine'
import Workout from './train/Workout'

function TrainHome() {
  const db = useDb()
  const fmt = useFormatDate()
  const navigate = useNavigate()
  const { data } = useAsync(async () => ({
    routines: await listRoutines(db),
    active: await activeProgramme(db),
    last: await lastWorkoutDate(db),
    open: await db.all<{ id: string }>('SELECT id FROM workouts WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1'),
  }), [db])
  if (!data) return null
  const start = async (routineId?: string) => navigate(`/train/workout/${await startWorkout(db, routineId)}`)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-semibold">Train</h1>
      {data.active ? (
        <>
          <NextWorkoutCard onStart={async (n) => navigate(`/train/workout/${await startProgrammeWorkout(db, n.dayId, localDate())}`)} />
          <Link to="/train/programmes" className="flex min-h-11 items-center self-start text-pond">Change programme</Link>
        </>
      ) : (
        <Link to="/train/programmes" className="flex min-h-16 flex-col justify-center border-b border-fog">
          <span className="font-semibold text-pond">Choose a programme</span>
          <span className="text-sm text-slate">Ready-made plans with the weights worked out for you</span>
        </Link>
      )}
      {data.last ? <p className="text-slate">Last workout {fmt(data.last)}</p> : null}
      {data.open[0] ? <Link to={`/train/workout/${data.open[0].id}`} className="flex min-h-11 items-center text-pond">Carry on with your open workout</Link> : null}
      {data.routines.length === 0 ? <EmptyState message="No routines yet" action={{ label: 'New routine', onClick: () => navigate('/train/routine/new') }} /> : null}
      {data.routines.map((r) => (
        <div key={r.id} className="flex min-h-14 items-center justify-between border-b border-fog">
          <Link to={`/train/routine/${r.id}`} className="flex min-h-11 flex-1 items-center">{r.name}</Link>
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
      <Route path="programmes" element={<Programmes />} />
      <Route path="programmes/:key" element={<ProgrammeDetail />} />
      <Route path="routine/:id" element={<Routine />} />
      <Route path="workout/:id" element={<Workout />} />
      <Route path="exercise/:id" element={<Exercise />} />
    </Routes>
  )
}
