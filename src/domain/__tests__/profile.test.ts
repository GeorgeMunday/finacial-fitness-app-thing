import { describe, expect, it } from 'vitest'
import { freshDb } from '../../../test/renderApp'
import { createUserFood, deleteLog, logFood } from '../food'
import { addExpense, addIncome, deleteTransaction } from '../money'
import { foodProgress, moneyProgress, topLifts, trainingProgress } from '../profile'
import { contribute, createGoal, deleteContribution } from '../savings'
import { customExercise, deleteSet, finishWorkout, logSet, startWorkout } from '../training'

const food = { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null }

async function workoutOn(db: Awaited<ReturnType<typeof freshDb>>, logDate: string) {
  const w = await startWorkout(db)
  await db.run('UPDATE workouts SET log_date = ? WHERE id = ?', [logDate, w])
  return w
}

describe('moneyProgress', () => {
  it('returns one row per month, oldest first, with zeros for empty months', async () => {
    const db = await freshDb()
    await addExpense(db, { amountPence: 1000, categoryId: 'cat-groceries', logDate: '2026-08-03' })
    expect(await moneyProgress(db, 3, '2026-10-13')).toEqual([
      { month: '2026-08', incomePence: 0, spentPence: 1000, savedPence: 0 },
      { month: '2026-09', incomePence: 0, spentPence: 0, savedPence: 0 },
      { month: '2026-10', incomePence: 0, spentPence: 0, savedPence: 0 },
    ])
  })
  it('crosses a year boundary', async () => {
    const db = await freshDb()
    const rows = await moneyProgress(db, 3, '2027-01-05')
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('never counts income as spent, and excludes soft-deleted rows', async () => {
    const db = await freshDb()
    const g = await createGoal(db, { name: 'G', period: 'year', targetPence: 100000 })
    await addIncome(db, { amountPence: 200000, logDate: '2026-10-01' })
    await addExpense(db, { amountPence: 3000, categoryId: 'cat-bills', logDate: '2026-10-02' })
    const gone = await addExpense(db, { amountPence: 9999, categoryId: 'cat-bills', logDate: '2026-10-02' })
    await deleteTransaction(db, gone)
    await contribute(db, g, 5000, '2026-10-03')
    const goneC = await contribute(db, g, 7777, '2026-10-03')
    await deleteContribution(db, goneC)
    expect(await moneyProgress(db, 1, '2026-10-13')).toEqual([{ month: '2026-10', incomePence: 200000, spentPence: 3000, savedPence: 5000 }])
  })
})

describe('foodProgress', () => {
  it('averages protein and kcal over logged days per Monday week, with zeros for empty weeks', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const f = await createUserFood(db, { ...food, name: 'Chicken', kcal100g: 100, protein100g: 20, carbs100g: 0, fat100g: 2 })
    await logFood(db, { foodId: f, grams: 100, slot: 'lunch', logDate: '2026-10-12' }) // Mon: 20 g, 100 kcal
    await logFood(db, { foodId: f, grams: 200, slot: 'lunch', logDate: '2026-10-13' }) // Tue: 40 g, 200 kcal
    await logFood(db, { foodId: f, grams: 50, slot: 'lunch', logDate: '2026-10-13' }) // Tue: +10 g, +50 kcal
    const gone = await logFood(db, { foodId: f, grams: 500, slot: 'dinner', logDate: '2026-10-13' })
    await deleteLog(db, gone)
    expect(await foodProgress(db, 2, '2026-10-14')).toEqual([
      { weekStart: '2026-10-05', avgProteinG: 0, avgKcal: 0, daysLogged: 0 },
      { weekStart: '2026-10-12', avgProteinG: 35, avgKcal: 175, daysLogged: 2 },
    ])
  })
  it('omits kcal entirely when calorie numbers are hidden', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, hideCalories: true })
    const rows = await foodProgress(db, 1, '2026-10-14')
    expect(rows).toEqual([{ weekStart: '2026-10-12', avgProteinG: 0, daysLogged: 0 }])
    expect('avgKcal' in rows[0]).toBe(false)
  })
})

describe('trainingProgress and topLifts', () => {
  it('counts workouts and working volume per week, excluding warm-ups and deleted sets', async () => {
    const db = await freshDb()
    const squat = await customExercise(db, 'Squat')
    const w1 = await workoutOn(db, '2026-10-12')
    await logSet(db, { workoutId: w1, exerciseId: squat, reps: 5, weightKg: 100 }) // 500
    await logSet(db, { workoutId: w1, exerciseId: squat, reps: 5, weightKg: 60, isWarmup: true }) // excluded
    const gone = await logSet(db, { workoutId: w1, exerciseId: squat, reps: 5, weightKg: 200 })
    await deleteSet(db, gone)
    await finishWorkout(db, w1)
    const w2 = await workoutOn(db, '2026-10-14')
    await logSet(db, { workoutId: w2, exerciseId: squat, reps: 3, weightKg: 110 }) // 330
    expect(await trainingProgress(db, 2, '2026-10-15', 'kg')).toEqual([
      { weekStart: '2026-10-05', workouts: 0, volume: 0 },
      { weekStart: '2026-10-12', workouts: 2, volume: 830 },
    ])
  })
  it('converts volume to pounds', async () => {
    const db = await freshDb()
    const bench = await customExercise(db, 'Bench')
    const w = await workoutOn(db, '2026-10-12')
    await logSet(db, { workoutId: w, exerciseId: bench, reps: 10, weightKg: 100 }) // 1000 kg → 2204.6 lb
    const [row] = await trainingProgress(db, 1, '2026-10-12', 'lb')
    expect(row.volume).toBe(2205)
  })
  it('a workout with only warm-ups or no sets does not count', async () => {
    const db = await freshDb()
    const bench = await customExercise(db, 'Bench')
    await workoutOn(db, '2026-10-12')
    const w = await workoutOn(db, '2026-10-13')
    await logSet(db, { workoutId: w, exerciseId: bench, reps: 10, weightKg: 20, isWarmup: true })
    expect((await trainingProgress(db, 1, '2026-10-13', 'kg'))[0]).toEqual({ weekStart: '2026-10-12', workouts: 0, volume: 0 })
  })
  it('topLifts ranks exercises by best estimated 1RM, ignoring warm-ups', async () => {
    const db = await freshDb()
    const [a, b, c, d] = await Promise.all(['Squat', 'Bench', 'Row', 'Curl'].map((n) => customExercise(db, n)))
    const w = await workoutOn(db, '2026-10-12')
    await logSet(db, { workoutId: w, exerciseId: a, reps: 5, weightKg: 100 }) // 116.7
    await logSet(db, { workoutId: w, exerciseId: b, reps: 5, weightKg: 60 }) // 70
    await logSet(db, { workoutId: w, exerciseId: b, reps: 1, weightKg: 200, isWarmup: true })
    await logSet(db, { workoutId: w, exerciseId: c, reps: 8, weightKg: 70 }) // 88.7
    await logSet(db, { workoutId: w, exerciseId: d, reps: 10, weightKg: 15 }) // 20
    expect(await topLifts(db, 3)).toEqual([
      { exerciseId: a, name: 'Squat', est1rmKg: 116.7, heaviestKg: 100 },
      { exerciseId: c, name: 'Row', est1rmKg: 88.7, heaviestKg: 70 },
      { exerciseId: b, name: 'Bench', est1rmKg: 70, heaviestKg: 60 },
    ])
  })
})
