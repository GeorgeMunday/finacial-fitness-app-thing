import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { copyDay, createUserFood, dayLogs, dayLogsNamed, dayTotals, deleteLog, editLog, lastGrams, logFood, quickAdd, recentFoods, servingOptions } from '../food'

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

describe('editing a log', () => {
  it('rescales a food log from its own snapshot when the portion changes', async () => {
    const id = await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    await db.run('UPDATE foods SET kcal_100g = 999 WHERE id = ?', [oats])
    await editLog(db, id, { slot: 'snack', grams: 100 })
    const [log] = await dayLogs(db, '2026-10-12')
    expect(log).toMatchObject({ grams: 100, slot: 'snack', kcal: 380, proteinG: 12, carbsG: 60, fatG: 8, logDate: '2026-10-12' })
  })
  it('rescales a recipe log by portions', async () => {
    await db.run("INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, kcal, protein_g, carbs_g, fat_g, recipe_id, portions) VALUES ('r','x','x','2026-10-12','dinner',500,40,50,10,'r1',1)")
    await editLog(db, 'r', { slot: 'dinner', portions: 1.5 })
    const [log] = await dayLogs(db, '2026-10-12')
    expect(log).toMatchObject({ portions: 1.5, kcal: 750, proteinG: 60, carbsG: 75, fatG: 15 })
  })
  it('sets a quick add directly, name included', async () => {
    const id = await quickAdd(db, { kcal: 300, slot: 'lunch', logDate: '2026-10-12' })
    await editLog(db, id, { slot: 'lunch', name: ' Meal deal ', kcal: 550, proteinG: 25, carbsG: 60, fatG: 20 })
    expect((await dayLogsNamed(db, '2026-10-12'))[0]).toMatchObject({ name: 'Meal deal', kcal: 550, proteinG: 25, carbsG: 60, fatG: 20 })
  })
  it('refuses a portion of zero and edits to deleted logs', async () => {
    const id = await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
    await expect(editLog(db, id, { slot: 'breakfast', grams: 0 })).rejects.toThrow()
    await deleteLog(db, id)
    await expect(editLog(db, id, { slot: 'breakfast', grams: 60 })).rejects.toThrow()
  })
})

describe('quick add', () => {
  it('keeps a name, carbs and fat, and copyDay carries the name', async () => {
    await quickAdd(db, { name: 'Canteen curry', kcal: 650, proteinG: 30, carbsG: 80, fatG: 22, slot: 'lunch', logDate: '2026-10-12' })
    await copyDay(db, '2026-10-12', '2026-10-13')
    expect((await dayLogsNamed(db, '2026-10-13'))[0]).toMatchObject({ name: 'Canteen curry', carbsG: 80, fatG: 22 })
  })
  it('a nameless quick add is still called Quick add', async () => {
    await quickAdd(db, { name: '  ', kcal: 100, slot: 'snack', logDate: '2026-10-12' })
    expect((await dayLogsNamed(db, '2026-10-12'))[0].name).toBe('Quick add')
  })
})

describe('servingOptions', () => {
  it('offers one and two servings when a food has a serving size', () => {
    expect(servingOptions({ servingG: 36, servingLabel: 'slice' })).toEqual([
      { label: '1 slice (36 g)', grams: 36 }, { label: '2 slices (72 g)', grams: 72 },
    ])
    expect(servingOptions({ servingG: 40, servingLabel: null })).toEqual([
      { label: '1 serving (40 g)', grams: 40 }, { label: '2 servings (80 g)', grams: 80 },
    ])
  })
  it('uses an Open Food Facts label as-is for one serving', () => {
    expect(servingOptions({ servingG: 30, servingLabel: '30 g' })).toEqual([
      { label: '1 serving (30 g)', grams: 30 }, { label: '2 servings (60 g)', grams: 60 },
    ])
  })
  it('offers nothing without a serving size', () => {
    expect(servingOptions({ servingG: null, servingLabel: null })).toEqual([])
  })
})
