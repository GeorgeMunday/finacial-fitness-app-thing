import { describe, expect, it } from 'vitest'
import { freshDb } from '../../../test/renderApp'
import { getSettings } from '../../state/settings'
import { deleteEverything, deleteHealthData, exportAll, importAll, toCsv } from '../backup'
import { createUserFood, logFood } from '../food'
import { addExpense, deleteTransaction } from '../money'
import { contribute, createGoal } from '../savings'
import { customExercise, logSet, startWorkout } from '../training'

const food = { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null }

async function populated() {
  const db = await freshDb({ onboarded: true, optionalPillars: ['food', 'train'], healthConsent: true })
  const t = await addExpense(db, { amountPence: 340, categoryId: 'cat-groceries', merchant: 'Tesco, "Metro"', logDate: '2026-10-12' })
  const gone = await addExpense(db, { amountPence: 100, categoryId: 'cat-bills', logDate: '2026-10-12' })
  await deleteTransaction(db, gone)
  const g = await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 120000 })
  await contribute(db, g, 2500, '2026-10-12')
  const f = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
  await logFood(db, { foodId: f, grams: 50, slot: 'breakfast', logDate: '2026-10-12' })
  await db.run("INSERT INTO body_metrics (id, created_at, updated_at, log_date, weight_kg) VALUES ('b1','x','x','2026-10-12',70)")
  const ex = await customExercise(db, 'Squat')
  const w = await startWorkout(db)
  await logSet(db, { workoutId: w, exerciseId: ex, reps: 5, weightKg: 100 })
  return { db, t }
}

const count = async (db: Awaited<ReturnType<typeof freshDb>>, table: string) => (await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n

describe('backup', () => {
  it('round-trips everything, including soft-deleted rows', async () => {
    const { db, t } = await populated()
    const backup = await exportAll(db)
    expect(backup.app).toBe('tally')
    const json = JSON.parse(JSON.stringify(backup))
    const fresh = await freshDb()
    await importAll(fresh, json)
    for (const table of Object.keys(backup.tables)) expect(await count(fresh, table)).toBe(backup.tables[table].length)
    expect(await count(fresh, 'transactions')).toBe(2)
    expect(await fresh.all('SELECT * FROM transactions WHERE id = ?', [t])).toEqual(await db.all('SELECT * FROM transactions WHERE id = ?', [t]))
    expect((await getSettings(fresh)).healthConsent).toBe(true)
  })
  it.each([
    ['another app', { app: 'other', schemaVersion: 1, exportedAt: 'x', tables: {} }],
    ['a truncated object', { app: 'tally', schemaVersion: 1 }],
    ['a newer schema', { app: 'tally', schemaVersion: 99, exportedAt: 'x', tables: {} }],
    ['an unknown column', 'unknown-column'],
    ['not an object', 'nonsense'],
  ])('rejects %s and leaves data untouched', async (_label, bad) => {
    const { db } = await populated()
    let input: unknown = bad
    if (bad === 'unknown-column') {
      const b = await exportAll(db)
      b.tables.transactions = [{ ...b.tables.transactions[0], 'evil"; DROP TABLE x; --': 1 }]
      input = b
    }
    const before = await exportAll(db)
    await expect(importAll(db, input)).rejects.toThrow()
    const after = await exportAll(db)
    expect(after.tables).toEqual(before.tables)
  })
  it('upgrades a version 1 backup: starter foods relabelled, anchor days filled', async () => {
    const db = await freshDb()
    const b = await exportAll(db)
    const v1 = JSON.parse(JSON.stringify(b))
    v1.schemaVersion = 1
    v1.tables.foods = [{ id: 'f1', created_at: 'x', updated_at: 'x', deleted_at: null, source: 'cofid', barcode: null, name: 'Banana', brand: null,
      kcal_100g: 95, protein_100g: 1, carbs_100g: 23, fat_100g: 0, serving_g: null, serving_label: null }]
    v1.tables.recurring_rules = [{ id: 'r1', created_at: 'x', updated_at: 'x', deleted_at: null, kind: 'income', name: 'Pay', amount_pence: 100,
      category_id: 'cat-income', cadence: 'monthly', next_date: '2026-11-30' }]
    await importAll(db, v1)
    expect(await db.all('SELECT source FROM foods')).toEqual([{ source: 'starter' }])
    expect(await db.all('SELECT anchor_day FROM recurring_rules')).toEqual([{ anchor_day: 30 }])
  })
  it('restores a version 2 backup that has no programme tables', async () => {
    const db = await freshDb()
    const v2 = JSON.parse(JSON.stringify(await exportAll(db)))
    v2.schemaVersion = 2
    for (const t of ['programmes', 'programme_days', 'programme_day_exercises', 'programme_progress']) delete v2.tables[t]
    await expect(importAll(db, v2)).resolves.toBeTruthy()
  })
  it('restores a version 4 backup that has no saved photos, and round-trips photos', async () => {
    const db = await freshDb()
    const v4 = JSON.parse(JSON.stringify(await exportAll(db)))
    v4.schemaVersion = 4
    delete v4.tables.food_images
    await expect(importAll(db, v4)).resolves.toBeTruthy()
    await db.run("INSERT INTO food_images (id, created_at, updated_at, food_id, source_url, data_url) VALUES ('i','x','x','f','https://images.openfoodfacts.org/a.jpg','data:image/jpeg;base64,AAAA')")
    const fresh = await freshDb()
    await importAll(fresh, JSON.parse(JSON.stringify(await exportAll(db))))
    expect(await fresh.all('SELECT data_url FROM food_images')).toEqual([{ data_url: 'data:image/jpeg;base64,AAAA' }])
  })
  it('round-trips programme rows', async () => {
    const db = await freshDb()
    await db.run("INSERT INTO programmes (id, created_at, updated_at, key, name, level, description, progression, days_per_week_options) VALUES ('p1','x','x','k','P','beginner','d','double','[3]')")
    const json = JSON.parse(JSON.stringify(await exportAll(db)))
    const fresh = await freshDb()
    await importAll(fresh, json)
    expect(await fresh.all('SELECT key FROM programmes')).toEqual([{ key: 'k' }])
  })
  it('deleteHealthData removes user recipes but keeps Tally recipes, workouts and programmes', async () => {
    const db = await freshDb()
    await db.run("INSERT INTO meals (id, created_at, updated_at, name, kind, source) VALUES ('t','x','x','Tally one','recipe','tally'),('u','x','x','Mine','recipe','user')")
    await db.run("INSERT INTO meal_items (id, created_at, updated_at, meal_id, food_id, grams) VALUES ('i1','x','x','t','f',1),('i2','x','x','u','f',1)")
    await db.run("INSERT INTO programmes (id, created_at, updated_at, key, name, level, description, progression, days_per_week_options) VALUES ('p1','x','x','k','P','beginner','d','double','[3]')")
    await deleteHealthData(db)
    expect(await db.all('SELECT id FROM meals')).toEqual([{ id: 't' }])
    expect(await db.all('SELECT id FROM meal_items')).toEqual([{ id: 'i1' }])
    expect(await db.all('SELECT id FROM programmes')).toHaveLength(1)
  })
  it('toCsv quotes awkward cells', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'two\nlines', d: null, e: 5 }])).toBe('a,b,c,d,e\r\n"x,y","say ""hi""","two\nlines",,5\r\n')
    expect(toCsv([])).toBe('')
  })
  it('deleteHealthData removes food and body data only', async () => {
    const { db } = await populated()
    await deleteHealthData(db)
    expect(await count(db, 'food_logs')).toBe(0)
    expect(await count(db, 'body_metrics')).toBe(0)
    expect(await count(db, "foods WHERE source = 'user'")).toBe(0)
    expect(await count(db, 'transactions')).toBe(2)
    expect(await count(db, 'savings_contributions')).toBe(1)
    expect(await count(db, 'workout_sets')).toBe(1)
    const s = await getSettings(db)
    expect(s.healthConsent).toBe(false)
    expect(s.optionalPillars).toEqual(['train'])
  })
  it('deleteEverything leaves only seeded rows', async () => {
    const { db } = await populated()
    await deleteEverything(db)
    const b = await exportAll(db)
    for (const [table, rows] of Object.entries(b.tables)) expect(rows.length, table).toBe(table === 'categories' ? 10 : 0)
    expect((await getSettings(db)).onboarded).toBe(false)
  })
})
