import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { ProgressSection } from '../../components/profile/ProgressSection'
import { addDays, addMonths, localDate } from '../../domain/dates'
import { createUserFood, logFood } from '../../domain/food'
import { addExpense, addIncome } from '../../domain/money'
import { contribute, createGoal } from '../../domain/savings'
import { customExercise, finishWorkout, logSet, startWorkout } from '../../domain/training'

const today = localDate()
const lastMonth = addMonths(today, -1)
const monthName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { month: 'long' })

async function withMoney() {
  const db = await freshDb({ onboarded: true })
  await addExpense(db, { amountPence: 1200, categoryId: 'cat-groceries', logDate: today })
  await addExpense(db, { amountPence: 3400, categoryId: 'cat-bills', logDate: lastMonth })
  await addIncome(db, { amountPence: 200000, logDate: today })
  const g = await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 100000 })
  await contribute(db, g, 500, today)
  return db
}

describe('progress section', () => {
  it('shows only Money when no optional pillars are on', async () => {
    renderApp(<ProgressSection />, await withMoney())
    expect(await screen.findByRole('img', { name: new RegExp(`Spent £12.00 and saved £5.00 in ${monthName(today)}`) })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Food' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Training' })).toBeNull()
  })
  it('a new account gets an invitation, not an empty axis', async () => {
    const db = await freshDb({ onboarded: true })
    renderApp(<ProgressSection />, db)
    expect(await screen.findByText('Log a few weeks of spending to see your trend')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('radio', { name: '3 months' })).toBeNull()
  })
  it('averages per week start from the first week with activity', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const squat = await customExercise(db, 'Squat')
    for (let i = 0; i < 2; i++) {
      const w = await startWorkout(db)
      await logSet(db, { workoutId: w, exerciseId: squat, reps: 5, weightKg: 100 })
      await finishWorkout(db, w)
    }
    const user = userEvent.setup()
    renderApp(<ProgressSection />, db)
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    const stat = (await screen.findByText('Workouts per week', { selector: 'dt' })).parentElement!
    expect(within(stat).getByText('2.0')).toBeInTheDocument()
  })
  it('shows the data as a table, with month names, and follows the range', async () => {
    const user = userEvent.setup()
    renderApp(<ProgressSection />, await withMoney())
    await user.click(await screen.findByRole('button', { name: 'Show as table' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3)
    expect(within(table).getByText(monthName(today).slice(0, 3))).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '6 months' }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(1 + 6)
  })
  it('summarises money in plain numbers', async () => {
    renderApp(<ProgressSection />, await withMoney())
    expect(await screen.findByText('Average monthly spend')).toBeInTheDocument()
    expect(screen.getByText('Saved this year')).toBeInTheDocument()
    expect(screen.getByText(/goals? on track/)).toBeInTheDocument()
  })
  it('food never shows calories when they are hidden', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, hideCalories: true })
    const f = await createUserFood(db, { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null, name: 'Chicken', kcal100g: 100, protein100g: 20, carbs100g: 0, fat100g: 2 })
    for (let i = 0; i < 5; i++) await logFood(db, { foodId: f, grams: 150, slot: 'lunch', logDate: addDays(today, -i) })
    const user = userEvent.setup()
    renderApp(<ProgressSection />, db)
    await user.click(await screen.findByRole('radio', { name: 'Food' }))
    expect(await screen.findByRole('img', { name: /protein/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i)
  })
  it('training shows workouts and best lifts in the chosen unit', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'], weightUnit: 'lb' })
    const squat = await customExercise(db, 'Squat')
    for (let i = 0; i < 2; i++) {
      const w = await startWorkout(db)
      await logSet(db, { workoutId: w, exerciseId: squat, reps: 5, weightKg: 100 })
      await finishWorkout(db, w)
    }
    const user = userEvent.setup()
    renderApp(<ProgressSection />, db)
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    expect(await screen.findByRole('img', { name: /workouts/i })).toBeInTheDocument()
    const lifts = screen.getByRole('list', { name: 'Best lifts' })
    expect(within(lifts).getByText('Squat')).toBeInTheDocument()
    expect(within(lifts).getByText(/257.5 lb/)).toBeInTheDocument()
  })
})

describe('strength over time', () => {
  async function withLifts() {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const squat = await customExercise(db, 'Squat', 'quadriceps')
    const bench = await customExercise(db, 'Bench', 'chest')
    const days = [addDays(today, -21), addDays(today, -14), addDays(today, -7)]
    for (const [i, d] of days.entries()) {
      const w = await startWorkout(db)
      await db.run('UPDATE workouts SET log_date = ? WHERE id = ?', [d, w])
      await logSet(db, { workoutId: w, exerciseId: squat, reps: 5, weightKg: 100 + i * 5 })
      if (i > 0) await logSet(db, { workoutId: w, exerciseId: bench, reps: 5, weightKg: 60 })
      await finishWorkout(db, w)
    }
    return db
  }
  it('charts the most-trained lift and says how much it has moved', async () => {
    const user = userEvent.setup()
    renderApp(<ProgressSection />, await withLifts())
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    expect(await screen.findByRole('heading', { name: 'Strength over time' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Squat' })).toHaveAttribute('aria-pressed', 'true')
    // 100, 105, 110 kg × 5 → estimated one-rep max 116.7, 122.5, 128.3
    expect(await screen.findByRole('img', { name: /Squat estimated one-rep max over 3 months: 116\.7 kg to 128\.3 kg, up 11\.6 kg across 3 sessions/ })).toBeInTheDocument()
  })
  it('switches lift with the chips', async () => {
    const user = userEvent.setup()
    renderApp(<ProgressSection />, await withLifts())
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    await user.click(await screen.findByRole('button', { name: 'Bench' }))
    expect(await screen.findByRole('img', { name: /Bench estimated one-rep max over 3 months: 70 kg to 70 kg, no change across 2 sessions/ })).toBeInTheDocument()
  })
  it('has a table view with one row per session', async () => {
    const user = userEvent.setup()
    renderApp(<ProgressSection />, await withLifts())
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    const section = (await screen.findByRole('heading', { name: 'Strength over time' })).closest('section')!
    await within(section).findByRole('img', { name: /Squat estimated/ })
    await user.click(within(section).getByRole('button', { name: 'Show as table' }))
    expect(within(section).getAllByRole('row')).toHaveLength(4) // header + 3 sessions
    expect(within(section).getByText('128.3 kg')).toBeInTheDocument()
  })
  it('shows pounds for pound users', async () => {
    const db = await withLifts()
    const { updateSettings } = await import('../../state/settings')
    await updateSettings(db, { weightUnit: 'lb' })
    const user = userEvent.setup()
    renderApp(<ProgressSection />, db)
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    expect(await screen.findByRole('img', { name: /Squat estimated one-rep max over 3 months: 257 lb to 283 lb/ })).toBeInTheDocument()
  })
  it('without a lift done on two days it explains what to do', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const squat = await customExercise(db, 'Squat', 'quadriceps')
    for (const d of [addDays(today, -3), addDays(today, -2)]) {
      const w = await startWorkout(db)
      await db.run('UPDATE workouts SET log_date = ? WHERE id = ?', [d, w])
      await logSet(db, { workoutId: w, exerciseId: squat, reps: 5, weightKg: 100 })
      if (d === addDays(today, -2)) await db.run('UPDATE workout_sets SET exercise_id = ? WHERE workout_id = ?', ['other', w])
      await finishWorkout(db, w)
    }
    const user = userEvent.setup()
    renderApp(<ProgressSection />, db)
    await user.click(await screen.findByRole('radio', { name: 'Training' }))
    expect(await screen.findByText('Log the same lift on two different days to see it here.')).toBeInTheDocument()
  })
})
