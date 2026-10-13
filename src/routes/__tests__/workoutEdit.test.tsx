import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, begin, dayOf, liftState } from '../../../test/programmeHelpers'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { startProgrammeWorkout } from '../../domain/programmes/plan'
import { seedAll } from '../../domain/seed'
import { createRoutine, customExercise, startWorkout } from '../../domain/training'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/train/*" element={<Train />} />
  </Routes>
)

async function routineWorkout() {
  const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
  const bench = await customExercise(db, 'Bench press', 'chest')
  const row = await customExercise(db, 'Cable row', 'middle back')
  await customExercise(db, 'Dumbbell press', 'chest')
  const routine = await createRoutine(db, 'Push', [{ exerciseId: bench, targetSets: 3, targetReps: 5 }, { exerciseId: row, targetSets: 3, targetReps: 10 }])
  const w = await startWorkout(db, routine)
  return { db, w }
}
const sets = (db: Awaited<ReturnType<typeof freshDb>>, w: string) =>
  db.all<{ name: string }>('SELECT e.name FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.workout_id = ?', [w])

describe('editing a workout', () => {
  it('removes an exercise from a routine workout, with Undo', async () => {
    const { db, w } = await routineWorkout()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Remove Cable row' }))
    expect(screen.queryByRole('region', { name: 'Cable row' })).toBeNull()
    expect(await screen.findByText('Removed Cable row')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('region', { name: 'Cable row' })).toBeInTheDocument()
  })
  it('replaces an exercise in a routine workout, and sets are logged under the new one', async () => {
    const { db, w } = await routineWorkout()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Replace Bench press' }))
    await user.type(await screen.findByLabelText('Search exercises'), 'Dumbbell')
    await user.click(await screen.findByRole('button', { name: 'Dumbbell press' }))
    expect(screen.queryByRole('region', { name: 'Bench press' })).toBeNull()
    const block = screen.getByRole('region', { name: 'Dumbbell press' })
    expect(within(block).getAllByRole('button', { name: /^Log set/ })).toHaveLength(3)
    await user.click(within(block).getByRole('button', { name: 'Log set 1 of Dumbbell press' }))
    await waitFor(async () => expect(await sets(db, w)).toEqual([{ name: 'Dumbbell press' }]))
  })
  it('keeps the routine itself unchanged', async () => {
    const { db, w } = await routineWorkout()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Remove Cable row' }))
    const items = await db.all('SELECT * FROM routine_exercises WHERE deleted_at IS NULL')
    expect(items).toHaveLength(2)
  })
  it('hides Remove and Replace once a set of that exercise is logged', async () => {
    const { db, w } = await routineWorkout()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Log set 1 of Bench press' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Bench press' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Replace Bench press' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Cable row' })).toBeInTheDocument()
  })
  it('removes an exercise added to an empty workout', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    await customExercise(db, 'Goblet squat', 'quadriceps')
    const w = await startWorkout(db)
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.type(await screen.findByRole('searchbox', { name: 'Add exercise' }), 'Goblet')
    await user.click(await screen.findByRole('button', { name: 'Goblet squat' }))
    await user.click(screen.getByRole('button', { name: 'Remove Goblet squat' }))
    expect(screen.queryByRole('region', { name: 'Goblet squat' })).toBeNull()
  })
  it('a removed programme lift is left alone while the rest progress', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    await seedAll(db, realSeed())
    await begin(db, 'ppl', { [`${BENCH}|main`]: 60, [`${DEADLIFT}|main`]: 100 })
    const pull = await startProgrammeWorkout(db, await dayOf(db, 'ppl', 'Pull day'), localDate())
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${pull}`)
    await user.click(await screen.findByRole('button', { name: 'Remove Face Pull' }))
    const dl = screen.getByRole('region', { name: DEADLIFT })
    for (const n of [1, 2, 3]) await user.click(within(dl).getByRole('button', { name: `Log set ${n} of ${DEADLIFT}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(105))
    expect((await liftState(db, 'Face Pull|main')).weightKg).toBe(10)
  })
})
