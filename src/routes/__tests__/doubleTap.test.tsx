import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { addDays, localDate } from '../../domain/dates'
import { createUserFood, logFood } from '../../domain/food'
import { getMonthlyIncome, saveMonthlyIncome } from '../../domain/income'
import { listRecurring } from '../../domain/money'
import { createRoutine, customExercise } from '../../domain/training'
import Food from '../Food'
import Money from '../Money'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/money/*" element={<Money />} />
    <Route path="/food/*" element={<Food />} />
    <Route path="/train/*" element={<Train />} />
  </Routes>
)
const count = async (db: Awaited<ReturnType<typeof freshDb>>, sql: string) => (await db.all(sql)).length

describe('double taps never duplicate', () => {
  it('Save expense', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense')
    await user.type(await screen.findByLabelText('Amount'), '4.50')
    const save = screen.getByRole('button', { name: 'Save expense' })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(async () => expect(await count(db, 'SELECT * FROM transactions')).toBe(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(await count(db, 'SELECT * FROM transactions')).toBe(1)
  })
  it('Copy yesterday', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const f = await createUserFood(db, { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null, name: 'Oats', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 })
    await logFood(db, { foodId: f, grams: 40, slot: 'breakfast', logDate: addDays(localDate(), -1) })
    renderApp(app(), db, '/food')
    const [copy] = await screen.findAllByRole('button', { name: 'Copy yesterday' })
    fireEvent.click(copy)
    fireEvent.click(copy)
    await waitFor(async () => expect(await count(db, `SELECT * FROM food_logs WHERE log_date = '${localDate()}'`)).toBe(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(await count(db, `SELECT * FROM food_logs WHERE log_date = '${localDate()}'`)).toBe(1)
  })
  it('Start a routine', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const ex = await customExercise(db, 'Squat')
    await createRoutine(db, 'Legs', [{ exerciseId: ex, targetSets: 3, targetReps: 5 }])
    renderApp(app(), db, '/train')
    const start = await screen.findByRole('button', { name: 'Start Legs' })
    fireEvent.click(start)
    fireEvent.click(start)
    await waitFor(async () => expect(await count(db, 'SELECT * FROM workouts')).toBe(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(await count(db, 'SELECT * FROM workouts')).toBe(1)
  })
  it('two concurrent income saves make one rule', async () => {
    const db = await freshDb()
    await Promise.all([
      saveMonthlyIncome(db, { amountPence: 100000, payDay: 1, today: '2026-10-13' }),
      saveMonthlyIncome(db, { amountPence: 100000, payDay: 1, today: '2026-10-13' }),
    ])
    expect(await listRecurring(db)).toHaveLength(1)
    expect(await getMonthlyIncome(db)).toEqual({ amountPence: 100000, payDay: 1 })
  })
})
