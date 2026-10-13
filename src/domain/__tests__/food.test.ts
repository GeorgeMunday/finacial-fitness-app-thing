import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { copyDay, createUserFood, dayLogs, dayTotals, deleteLog, lastGrams, logFood, quickAdd, recentFoods } from '../food'

let db: SqlExecutor
let oats: string
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
  oats = await createUserFood(db, {
    createdAt: '', updatedAt: '', deletedAt: null, barcode: null, name: 'Oats', brand: null,
    kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8, servingG: 40, servingLabel: null,
  })
})

describe('food logging', () => {
  it('stores a nutrition snapshot', async () => {
    await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    const [log] = await dayLogs(db, '2026-10-12')
    expect(log).toMatchObject({ kcal: 190, proteinG: 6, carbsG: 30, fatG: 4, grams: 50, foodId: oats })
  })
  it('totals sum and survive food edits and deletion', async () => {
    await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    await logFood(db, { foodId: oats, grams: 100, slot: 'snack', logDate: '2026-10-12' })
    expect((await dayTotals(db, '2026-10-12')).kcal).toBe(570)
    await db.run('UPDATE foods SET kcal_100g = 500, deleted_at = ? WHERE id = ?', ['x', oats])
    expect(await dayTotals(db, '2026-10-12')).toEqual({ kcal: 570, proteinG: 18, carbsG: 90, fatG: 12 })
  })
  it('deleteLog removes it from totals', async () => {
    const id = await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    await logFood(db, { foodId: oats, grams: 100, slot: 'lunch', logDate: '2026-10-12' })
    await deleteLog(db, id)
    expect((await dayTotals(db, '2026-10-12')).kcal).toBe(380)
  })
  it('copyDay keeps recipe_id and portions', async () => {
    await db.run("INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, kcal, recipe_id, portions) VALUES ('l','x','x','2026-10-12','lunch',300,'r1',2)")
    await copyDay(db, '2026-10-12', '2026-10-13')
    expect(await db.all("SELECT recipe_id, portions FROM food_logs WHERE log_date = '2026-10-13'")).toEqual([{ recipe_id: 'r1', portions: 2 }])
  })
  it('copyDay copies with new ids, optionally by slot', async () => {
    await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    await logFood(db, { foodId: oats, grams: 100, slot: 'lunch', logDate: '2026-10-12' })
    expect(await copyDay(db, '2026-10-12', '2026-10-13')).toBe(2)
    const a = await dayLogs(db, '2026-10-12')
    const b = await dayLogs(db, '2026-10-13')
    expect(b).toHaveLength(2)
    expect(b.map((l) => l.id)).not.toEqual(expect.arrayContaining(a.map((l) => l.id)))
    expect(await copyDay(db, '2026-10-12', '2026-10-14', 'lunch')).toBe(1)
  })
  it('days do not mix; quickAdd counts', async () => {
    await logFood(db, { foodId: oats, grams: 100, slot: 'breakfast', logDate: '2026-10-12' })
    await quickAdd(db, { kcal: 300, slot: 'dinner', logDate: '2026-10-13' })
    expect((await dayTotals(db, '2026-10-12')).kcal).toBe(380)
    expect((await dayTotals(db, '2026-10-13')).kcal).toBe(300)
  })
  it('recentFoods and lastGrams', async () => {
    const banana = await createUserFood(db, { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, name: 'Banana', brand: null, kcal100g: 95, protein100g: 1, carbs100g: 23, fat100g: 0, servingG: null, servingLabel: null })
    await logFood(db, { foodId: oats, grams: 45, slot: 'breakfast', logDate: '2026-10-12' })
    await logFood(db, { foodId: banana, grams: 120, slot: 'snack', logDate: '2026-10-12' })
    expect((await recentFoods(db)).map((f) => f.name)).toEqual(['Banana', 'Oats'])
    expect(await lastGrams(db, oats)).toBe(45)
    expect(await lastGrams(db, 'nope')).toBeNull()
  })
})
