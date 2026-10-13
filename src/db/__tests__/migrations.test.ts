import { describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import { MIGRATIONS, migrate } from '../migrations'

const TABLES = [
  'categories', 'transactions', 'budgets', 'recurring_rules', 'savings_goals', 'savings_contributions',
  'settings', 'transaction_links', 'product_prices',
  'foods', 'meals', 'meal_items', 'food_logs', 'body_metrics',
  'exercises', 'routines', 'routine_exercises', 'workouts', 'workout_sets',
]

describe('migration 2', () => {
  it('relabels the old starter rows, accepts starter foods and adds anchor_day', async () => {
    const db = memoryExecutor()
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[0])
      await tx.exec('PRAGMA user_version = 1')
    })
    await db.run(
      "INSERT INTO foods (id, created_at, updated_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g) VALUES ('f1','x','x','cofid','Banana',95,1,23,0)",
    )
    await db.run(
      "INSERT INTO recurring_rules (id, created_at, updated_at, kind, name, amount_pence, category_id, cadence, next_date) VALUES ('r1','x','x','income','Pay',100,'cat-income','monthly','2026-11-30')",
    )
    expect(await migrate(db)).toBe(MIGRATIONS.length)
    expect(await db.all('SELECT id, source FROM foods')).toEqual([{ id: 'f1', source: 'starter' }])
    expect(await db.all('SELECT anchor_day FROM recurring_rules')).toEqual([{ anchor_day: 30 }])
    await db.run(
      "INSERT INTO foods (id, created_at, updated_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g) VALUES ('f2','x','x','starter','Apple',52,0,12,0)",
    )
    await expect(
      db.run("INSERT INTO foods (id, created_at, updated_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g) VALUES ('f3','x','x','bogus','X',1,1,1,1)"),
    ).rejects.toThrow()
    const idx = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'foods'")
    expect(idx.map((i) => i.name)).toContain('idx_foods_barcode')
  })
})

describe('migration 3', () => {
  it('keeps existing rows and adds defaults for programmes and recipes', async () => {
    const db = memoryExecutor()
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[0])
      await tx.exec(MIGRATIONS[1])
      await tx.exec('PRAGMA user_version = 2')
    })
    await db.run("INSERT INTO meals (id, created_at, updated_at, name) VALUES ('m1','x','x','Porridge')")
    await db.run("INSERT INTO meal_items (id, created_at, updated_at, meal_id, food_id, grams) VALUES ('i1','x','x','m1','f1',40)")
    await db.run("INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, kcal) VALUES ('l1','x','x','2026-10-12','lunch',100)")
    await db.run("INSERT INTO product_prices (id, created_at, updated_at, food_id, price_pence, log_date) VALUES ('p1','x','x','f1',100,'2026-10-01')")
    await db.run("INSERT INTO workouts (id, created_at, updated_at, started_at, log_date) VALUES ('w1','x','x','x','2026-10-12')")
    expect(await migrate(db)).toBe(MIGRATIONS.length)
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(3)
    const [m] = await db.all<Record<string, unknown>>("SELECT * FROM meals WHERE id = 'm1'")
    expect(m).toMatchObject({ kind: 'meal', servings: 1, steps: '[]', tags: '[]', source: 'user', key: null })
    expect(await db.all("SELECT position FROM meal_items")).toEqual([{ position: 0 }])
    expect(await db.all('SELECT source FROM product_prices')).toEqual([{ source: 'user' }])
    expect(await db.all('SELECT recipe_id, portions FROM food_logs')).toEqual([{ recipe_id: null, portions: null }])
    expect(await db.all('SELECT programme_day_id, progression_applied_at FROM workouts')).toEqual([{ programme_day_id: null, progression_applied_at: null }])
    const names = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name)
    for (const t of ['programmes', 'programme_days', 'programme_day_exercises', 'programme_progress']) expect(names).toContain(t)
    await expect(db.run("INSERT INTO meals (id, created_at, updated_at, name, kind) VALUES ('m2','x','x','Bad','bogus')")).rejects.toThrow()
  })
})

describe('migrate', () => {
  it('is idempotent and returns the version', async () => {
    const db = memoryExecutor()
    expect(await migrate(db)).toBe(MIGRATIONS.length)
    expect(await migrate(db)).toBe(MIGRATIONS.length)
  })
  it('creates every table', async () => {
    const db = memoryExecutor()
    await migrate(db)
    const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
    const names = rows.map((r) => r.name)
    for (const t of TABLES) expect(names).toContain(t)
  })
  it('seeds one category per kind', async () => {
    const db = memoryExecutor()
    await migrate(db)
    const rows = await db.all<{ kind: string }>('SELECT kind FROM categories')
    expect(rows.map((r) => r.kind).sort()).toEqual(
      ['groceries', 'eating_out', 'takeaway', 'fitness', 'supplements', 'bills', 'transport', 'shopping', 'income', 'other'].sort(),
    )
  })
})
