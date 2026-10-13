import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { createRoutine, customExercise, finishWorkout, logSet, startWorkout } from '../../domain/training'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/train/*" element={<Train />} />
  </Routes>
)

async function setup(unit: 'kg' | 'lb' = 'kg') {
  const db = await freshDb({ onboarded: true, optionalPillars: ['train'], weightUnit: unit })
  const bench = await customExercise(db, 'Bench press', 'chest')
  const routine = await createRoutine(db, 'Push', [{ exerciseId: bench, targetSets: 3, targetReps: 5 }])
  const old = await startWorkout(db, routine)
  for (let i = 0; i < 3; i++) await logSet(db, { workoutId: old, exerciseId: bench, reps: 5, weightKg: 60 })
  await finishWorkout(db, old)
  const w = await startWorkout(db, routine)
  return { db, bench, w }
}

describe('workout screen', () => {
  it('logs a pre-filled set in one press and starts the rest timer', async () => {
    const { db, w } = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Log set 1 of Bench press' }))
    await waitFor(async () => {
      const rows = await db.all<{ reps: number; weight_kg: number }>('SELECT * FROM workout_sets WHERE workout_id = ?', [w])
      expect(rows).toEqual([expect.objectContaining({ reps: 5, weight_kg: 60 })])
    })
    expect(await screen.findByText('1:30')).toBeInTheDocument()
  })
  it('steppers adjust weight and reps', async () => {
    const { db, w } = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'More weight for set 1 of Bench press' }))
    await user.click(screen.getByRole('button', { name: 'Fewer reps for set 1 of Bench press' }))
    await user.click(screen.getByRole('button', { name: 'Log set 1 of Bench press' }))
    await waitFor(async () => {
      const rows = await db.all<{ reps: number; weight_kg: number }>('SELECT * FROM workout_sets WHERE workout_id = ?', [w])
      expect(rows).toEqual([expect.objectContaining({ reps: 4, weight_kg: 62.5 })])
    })
  })
  it('shows and stores pounds correctly', async () => {
    const { db, w } = await setup('lb')
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    expect((await screen.findAllByText('132.5 lb')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Log set 1 of Bench press' }))
    await waitFor(async () => {
      const [r] = await db.all<{ weight_kg: number }>('SELECT * FROM workout_sets WHERE workout_id = ?', [w])
      expect(r.weight_kg).toBeCloseTo(60.1, 1)
    })
  })
  it('finish ends the workout', async () => {
    const { db, w } = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
    await waitFor(async () => {
      const [r] = await db.all<{ ended_at: string | null }>('SELECT ended_at FROM workouts WHERE id = ?', [w])
      expect(r.ended_at).not.toBeNull()
    })
  })
  it('only ticks a set once it is saved, and offers Retry when saving fails', async () => {
    const { db: inner, w } = await setup()
    let failNext = true
    const db = {
      ...inner,
      run: async (sql: string, params?: unknown[]) => {
        if (failNext && sql.includes('INSERT INTO workout_sets')) {
          failNext = false
          throw new Error('disk full')
        }
        return inner.run(sql, params)
      },
    }
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Log set 1 of Bench press' }))
    expect(await screen.findByText(/Couldn't save that set/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log set 1 of Bench press' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Logged set 1 of Bench press' })).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Logged set 1 of Bench press' })).toBeInTheDocument()
    expect(await inner.all('SELECT * FROM workout_sets WHERE workout_id = ?', [w])).toHaveLength(1)
  })
})
