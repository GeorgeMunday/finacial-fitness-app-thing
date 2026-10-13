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
