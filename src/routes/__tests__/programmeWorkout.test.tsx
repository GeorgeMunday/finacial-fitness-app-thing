import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, SQUAT, begin, dayOf, liftState } from '../../../test/programmeHelpers'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { nextWorkout, startProgrammeWorkout } from '../../domain/programmes/plan'
import { seedAll } from '../../domain/seed'
import { finishWorkout, startWorkout } from '../../domain/training'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/train/*" element={<Train />} />
  </Routes>
)

async function setup(key: 'ppl' | 'gzclp', day: string, startKg: Record<string, number>) {
  const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
  await seedAll(db, realSeed())
  await begin(db, key, startKg)
  const w = await startProgrammeWorkout(db, await dayOf(db, key, day), localDate())
  return { db, w }
}
const sets = (db: Awaited<ReturnType<typeof freshDb>>, w: string) =>
  db.all<{ reps: number; weight_kg: number; exercise_id: string }>('SELECT reps, weight_kg, exercise_id FROM workout_sets WHERE workout_id = ? ORDER BY rowid', [w])

describe('programme workout', () => {
  it('opens with the suggested weights and the bottom of the rep range, and one tap logs a set as shown', async () => {
    const { db, w } = await setup('ppl', 'Push day', { [`${BENCH}|main`]: 60 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    expect(await screen.findAllByText('60 kg')).toHaveLength(4)
    expect(screen.getAllByText('Set 1 · 6–8').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: `Log set 1 of ${BENCH}` }))
    await waitFor(async () => expect(await sets(db, w)).toEqual([expect.objectContaining({ reps: 6, weight_kg: 60 })]))
    expect(await screen.findByText('1:30')).toBeInTheDocument()
  })
  it('shows AMRAP sets as 3+ and prefills the minimum', async () => {
    const { db, w } = await setup('gzclp', 'Day 1', { [`${SQUAT}|t1`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    expect(await screen.findByText('Set 5 · 3+')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Log set 5 of ${SQUAT}` }))
    await waitFor(async () => expect(await sets(db, w)).toEqual([expect.objectContaining({ reps: 3, weight_kg: 100 })]))
  })
  it('swap exercise replaces the block, and the prescribed lift is then not done', async () => {
    const { db, w } = await setup('ppl', 'Push day', { [`${BENCH}|main`]: 60 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: `Replace ${BENCH}` }))
    await user.type(await screen.findByLabelText('Search exercises'), 'Dumbbell Flyes')
    await user.click(await screen.findByRole('button', { name: 'Dumbbell Flyes' }))
    expect(screen.queryByRole('region', { name: BENCH })).toBeNull()
    await user.click(within(screen.getByRole('region', { name: 'Dumbbell Flyes' })).getByRole('button', { name: 'Log set 1 of Dumbbell Flyes' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => expect((await liftState(db, `${BENCH}|main`)).weightKg).toBe(60))
    const [row] = await sets(db, w)
    expect(row.exercise_id).not.toBeUndefined()
    expect(await db.all("SELECT name FROM exercises WHERE id = ?", [row.exercise_id])).toEqual([{ name: 'Dumbbell Flyes' }])
  })
  it('offers the alternative first when the programme has one', async () => {
    const { db, w } = await setup('ppl', 'Pull day', {})
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Replace Wide-Grip Lat Pulldown' }))
    expect(await screen.findByRole('button', { name: 'Pullups' })).toBeInTheDocument()
  })
  it('skip set removes an unlogged set, and progression then treats the lift as short', async () => {
    const { db, w } = await setup('ppl', 'Push day', { [`${BENCH}|main`]: 60 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: `Skip set 4 of ${BENCH}` }))
    expect(screen.queryByRole('button', { name: `Log set 4 of ${BENCH}` })).toBeNull()
    for (const n of [1, 2, 3]) await user.click(screen.getByRole('button', { name: `Log set ${n} of ${BENCH}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => expect((await nextWorkout(db, localDate()))!.dayName).toBe('Pull day'))
    expect((await liftState(db, `${BENCH}|main`)).weightKg).toBe(60)
  })
  it('extra sets can be added and are ignored by progression', async () => {
    const { db, w } = await setup('ppl', 'Pull day', { [`${DEADLIFT}|main`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    const block = await screen.findByRole('region', { name: DEADLIFT })
    await user.click(within(block).getByRole('button', { name: 'Add set' }))
    for (const n of [1, 2, 3, 4]) await user.click(within(block).getByRole('button', { name: `Log set ${n} of ${DEADLIFT}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(105))
  })
  it('finishing a clean workout says what to lift next time and moves the next workout on', async () => {
    const { db, w } = await setup('ppl', 'Pull day', { [`${DEADLIFT}|main`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    const block = await screen.findByRole('region', { name: DEADLIFT })
    for (const n of [1, 2, 3]) await user.click(within(block).getByRole('button', { name: `Log set ${n} of ${DEADLIFT}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(await screen.findByText(`${DEADLIFT}: 105 kg next time`)).toBeInTheDocument()
    expect((await nextWorkout(db, localDate()))!.dayName).toBe('Legs day')
  })
  it('a short T1 lift asks before counting a miss; Don\'t count leaves the stage alone', async () => {
    const { db, w } = await setup('gzclp', 'Day 1', { [`${SQUAT}|t1`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    for (const n of [1, 2, 3, 4]) await user.click(await screen.findByRole('button', { name: `Log set ${n} of ${SQUAT}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(await screen.findByText(`You did 4 of 5 sets of ${SQUAT}. Count this as a missed session?`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await waitFor(async () => expect((await nextWorkout(db, localDate()))!.dayName).toBe('Day 2'))
    expect(await liftState(db, `${SQUAT}|t1`)).toMatchObject({ stage: 1, weightKg: 100 })
  })
  it('Count as a miss moves the lift to the next stage', async () => {
    const { db, w } = await setup('gzclp', 'Day 1', { [`${SQUAT}|t1`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    for (const n of [1, 2, 3, 4]) await user.click(await screen.findByRole('button', { name: `Log set ${n} of ${SQUAT}` }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await user.click(await screen.findByRole('button', { name: `Count as a miss: ${SQUAT}` }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await waitFor(async () => expect(await liftState(db, `${SQUAT}|t1`)).toMatchObject({ stage: 2, weightKg: 100 }))
  })
  it('a plain routine workout finishes as before, with no questions and no progression', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const w = await startWorkout(db)
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
    expect(await screen.findByText('Workout saved')).toBeInTheDocument()
    expect(await db.all('SELECT ended_at FROM workouts WHERE id = ?', [w])).toEqual([{ ended_at: expect.any(String) }])
  })
  it('tapping Finish twice applies progression once', async () => {
    const { db, w } = await setup('ppl', 'Pull day', { [`${DEADLIFT}|main`]: 100 })
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    const block = await screen.findByRole('region', { name: DEADLIFT })
    for (const n of [1, 2, 3]) await user.click(within(block).getByRole('button', { name: `Log set ${n} of ${DEADLIFT}` }))
    await user.dblClick(screen.getByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(105))
    await new Promise((r) => setTimeout(r, 50))
    expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(105)
    void finishWorkout
  })
})
