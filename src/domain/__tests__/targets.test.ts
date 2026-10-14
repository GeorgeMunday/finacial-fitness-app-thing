import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from '../../../test/renderApp'
import type { SqlExecutor } from '../../db/executor'
import { quickAdd } from '../food'
import { latestWeight, logWeight, loggingStreak, proteinWeek, rangeStatus, ringProgress, suggestTargets } from '../targets'

const base = { sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80, activity: 'sitting' as const, goal: 'maintain' as const, training: false }

describe('suggestTargets', () => {
  it('uses Mifflin–St Jeor times activity to maintain', () => {
    // 10×80 + 6.25×180 − 5×30 + 5 = 1780; × 1.2 = 2136
    expect(suggestTargets(base)).toMatchObject({ maintenanceKcal: 2136, kcal: 2136, kcalClamped: false })
    expect(suggestTargets({ ...base, sex: 'female' }).maintenanceKcal).toBe(Math.round((1780 - 166) * 1.2))
    expect(suggestTargets({ ...base, sex: 'unspecified' }).maintenanceKcal).toBe(Math.round((1780 - 83) * 1.2))
    expect(suggestTargets({ ...base, activity: 'very' }).maintenanceKcal).toBe(Math.round(1780 * 1.725))
  })
  it('loses at most 500 kcal a day and at most 1% of body weight a week', () => {
    expect(suggestTargets({ ...base, goal: 'lose' }).kcal).toBe(2136 - 500)
    // 50 kg: 1% a week is 0.5 kg ≈ 550 kcal a day, so 500 still applies; 40 kg → 0.4 kg a week ≈ 440 a day
    const small = { ...base, sex: 'female' as const, weightKg: 40, heightCm: 150, age: 60 }
    const m = suggestTargets({ ...small }).maintenanceKcal
    expect(suggestTargets({ ...small, goal: 'lose' }).kcal).toBe(Math.max(1200, m - 440))
  })
  it('never goes under the calorie floor, and says so', () => {
    const r = suggestTargets({ ...base, sex: 'female', weightKg: 45, heightCm: 150, age: 70, goal: 'lose' })
    expect(r).toMatchObject({ kcal: 1200, kcalClamped: true })
  })
  it('gains with 250 kcal a day extra', () => {
    expect(suggestTargets({ ...base, goal: 'gain' }).kcal).toBe(2386)
  })
  it('asks for more protein with training or an active day', () => {
    expect(suggestTargets(base).proteinG).toBe(96)
    expect(suggestTargets({ ...base, training: true }).proteinG).toBe(128)
    expect(suggestTargets({ ...base, activity: 'active' }).proteinG).toBe(128)
  })
  it('sets fibre at 30 g, fat at 30% of calories and carbs from the rest', () => {
    const r = suggestTargets(base)
    expect(r.fibreG).toBe(30)
    expect(r.fatG).toBe(Math.round((2136 * 0.3) / 9))
    expect(r.carbsG).toBe(Math.round((2136 - 96 * 4 - r.fatG * 9) / 4))
  })
  it('will not plan a loss for someone already underweight', () => {
    const r = suggestTargets({ ...base, weightKg: 55, heightCm: 180, goal: 'lose' })
    expect(r).toMatchObject({ loseRefused: true, kcal: r.maintenanceKcal })
  })
})

describe('ringProgress and rangeStatus', () => {
  it('fills a ring toward 100% and says how much is left', () => {
    expect(ringProgress(30, 120)).toEqual({ percent: 25, done: false, toGo: 90 })
    expect(ringProgress(130, 120)).toEqual({ percent: 100, done: true, toGo: 0 })
    expect(ringProgress(10, 0)).toBeNull()
  })
  it('describes calories, carbs and fat against a ±10% range, never as a score', () => {
    expect(rangeStatus(1000, 2000)).toEqual({ status: 'below', low: 1800, high: 2200, toRange: 800 })
    expect(rangeStatus(2100, 2000)).toEqual({ status: 'in', low: 1800, high: 2200, toRange: 0 })
    expect(rangeStatus(2500, 2000)).toEqual({ status: 'above', low: 1800, high: 2200, toRange: 0 })
  })
})

describe('week and streak', () => {
  let db: SqlExecutor
  beforeEach(async () => {
    db = await freshDb()
  })
  it('marks which of the last 7 days reached the protein target', async () => {
    await quickAdd(db, { kcal: 500, proteinG: 130, slot: 'lunch', logDate: '2026-10-14' })
    await quickAdd(db, { kcal: 500, proteinG: 50, slot: 'lunch', logDate: '2026-10-13' })
    await quickAdd(db, { kcal: 500, proteinG: 120, slot: 'lunch', logDate: '2026-10-08' })
    await quickAdd(db, { kcal: 500, proteinG: 200, slot: 'lunch', logDate: '2026-10-07' }) // 8 days back: outside
    const w = await proteinWeek(db, '2026-10-14', 120)
    expect(w.map((d) => d.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
    expect(w.map((d) => d.reached)).toEqual([true, false, false, false, false, false, true])
  })
  it('counts days logged in a row, not breaking until a day with nothing has ended', async () => {
    for (const d of ['2026-10-11', '2026-10-12', '2026-10-13']) await quickAdd(db, { kcal: 100, slot: 'snack', logDate: d })
    expect(await loggingStreak(db, '2026-10-14')).toBe(3) // nothing yet today: the run is still alive
    await quickAdd(db, { kcal: 100, slot: 'snack', logDate: '2026-10-14' })
    expect(await loggingStreak(db, '2026-10-14')).toBe(4)
    expect(await loggingStreak(db, '2026-10-16')).toBe(0)
  })
  it('deleted logs do not count', async () => {
    const id = await quickAdd(db, { kcal: 100, slot: 'snack', logDate: '2026-10-14' })
    await db.run('UPDATE food_logs SET deleted_at = ? WHERE id = ?', ['x', id])
    expect(await loggingStreak(db, '2026-10-14')).toBe(0)
  })
  it('keeps the newest weight', async () => {
    expect(await latestWeight(db)).toBeNull()
    await logWeight(db, 81.5, '2026-10-01')
    await logWeight(db, 80, '2026-10-14')
    expect(await latestWeight(db)).toBe(80)
  })
})
