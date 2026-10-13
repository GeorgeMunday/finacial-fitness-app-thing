import { describe, expect, it } from 'vitest'
import { freshDb } from '../../../test/renderApp'
import { createUserFood, logFood } from '../food'
import { addExpense, addIncome } from '../money'
import { contribute, createGoal } from '../savings'
import { todaySummary, weeklyFoodSpend } from '../today'
import { finishWorkout, logSet, customExercise, startWorkout } from '../training'

const food = { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null }

describe('todaySummary', () => {
  it('money only when no optional pillars', async () => {
    const db = await freshDb({ onboarded: true })
    const s = await todaySummary(db, '2026-10-12')
    expect(s.money).toBeDefined()
    expect('food' in s).toBe(false)
    expect('train' in s).toBe(false)
  })
  it('top goal is the least complete', async () => {
    const db = await freshDb({ onboarded: true })
    const a = await createGoal(db, { name: 'A', period: 'month', targetPence: 10000 })
    const b = await createGoal(db, { name: 'B', period: 'month', targetPence: 10000 })
    await contribute(db, a, 2500, '2026-10-02')
    await contribute(db, b, 8000, '2026-10-02')
    const s = await todaySummary(db, '2026-10-12')
    expect(s.money.topGoal).toMatchObject({ name: 'A', percent: 25, remainingPence: 7500 })
  })
  it('spent today counts expenses only', async () => {
    const db = await freshDb({ onboarded: true })
    await addExpense(db, { amountPence: 340, categoryId: 'cat-groceries', logDate: '2026-10-12' })
    await addIncome(db, { amountPence: 10000, logDate: '2026-10-12' })
    expect((await todaySummary(db, '2026-10-12')).money.spentTodayPence).toBe(340)
  })
  it('hides kcal but keeps protein', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, hideCalories: true, kcalTarget: 2000, proteinTarget: 120 })
    const id = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: id, grams: 100, slot: 'breakfast', logDate: '2026-10-12' })
    const s = await todaySummary(db, '2026-10-12')
    expect(s.food?.kcalLeft).toBeUndefined()
    expect(s.food?.proteinLeft).toBe(108)
  })
  it('counts logged days across everything in the last 7 days', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food', 'train'], healthConsent: true })
    await addExpense(db, { amountPence: 100, categoryId: 'cat-bills', logDate: '2026-10-06' })
    await addExpense(db, { amountPence: 100, categoryId: 'cat-bills', logDate: '2026-10-05' }) // 8 days ago: outside
    const g = await createGoal(db, { name: 'G', period: 'year', targetPence: 1000 })
    await contribute(db, g, 100, '2026-10-07')
    const id = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: id, grams: 100, slot: 'breakfast', logDate: '2026-10-08' })
    await logFood(db, { foodId: id, grams: 100, slot: 'breakfast', logDate: '2026-10-07' })
    const ex = await customExercise(db, 'Squat')
    const w = await startWorkout(db)
    await db.run("UPDATE workouts SET log_date = '2026-10-12' WHERE id = ?", [w])
    await logSet(db, { workoutId: w, exerciseId: ex, reps: 5, weightKg: 100 })
    await finishWorkout(db, w)
    const s = await todaySummary(db, '2026-10-12')
    expect(s.loggedDaysLast7).toBe(4)
    expect(s.train).toMatchObject({ workoutToday: true, lastWorkoutDate: '2026-10-12' })
  })
  it('backupDue follows lastBackupAt; support shows after low-intake streak', async () => {
    const db = await freshDb({ onboarded: true, onboardedAt: '2026-01-01T00:00:00.000Z', lastBackupAt: '2026-10-10T00:00:00.000Z', optionalPillars: ['food'], healthConsent: true, sex: 'female' })
    const id = await createUserFood(db, { ...food, name: 'Soup', kcal100g: 100, protein100g: 5, carbs100g: 10, fat100g: 2 })
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12']) await logFood(db, { foodId: id, grams: 500, slot: 'lunch', logDate: d })
    const s = await todaySummary(db, '2026-10-12')
    expect(s.backupDue).toBe(false)
    expect(s.showSupport).toBe(true)
    const db2 = await freshDb({ onboarded: true, lastBackupAt: '2026-08-01T00:00:00.000Z' })
    expect((await todaySummary(db2, '2026-10-12')).backupDue).toBe(true)
  })
})

describe('weeklyFoodSpend', () => {
  it('sums Monday to Sunday only, with nutrition when Food is on', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    await addExpense(db, { amountPence: 1000, categoryId: 'cat-groceries', logDate: '2026-10-12' })
    await addExpense(db, { amountPence: 500, categoryId: 'cat-takeaway', logDate: '2026-10-18' })
    await addExpense(db, { amountPence: 700, categoryId: 'cat-groceries', logDate: '2026-10-11' })
    await addExpense(db, { amountPence: 900, categoryId: 'cat-eating_out', logDate: '2026-10-19' })
    const id = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 400, protein100g: 10, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: id, grams: 500, slot: 'breakfast', logDate: '2026-10-13' })
    await logFood(db, { foodId: id, grams: 250, slot: 'breakfast', logDate: '2026-10-14' })
    expect(await weeklyFoodSpend(db, '2026-10-15')).toEqual({ groceriesPence: 1000, eatingOutPence: 0, takeawayPence: 500, avgKcal: 1500, avgProteinG: 37.5 })
  })
  it('omits nutrition when Food is off', async () => {
    const db = await freshDb({ onboarded: true })
    expect(await weeklyFoodSpend(db, '2026-10-15')).toEqual({ groceriesPence: 0, eatingOutPence: 0, takeawayPence: 0 })
  })
})
