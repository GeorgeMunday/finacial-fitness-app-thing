import { describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import { MIGRATIONS, migrate } from '../migrations'

const TABLES = [
  'categories', 'transactions', 'budgets', 'recurring_rules', 'savings_goals', 'savings_contributions',
  'settings', 'transaction_links', 'product_prices',
  'foods', 'meals', 'meal_items', 'food_logs', 'body_metrics',
  'exercises', 'routines', 'routine_exercises', 'workouts', 'workout_sets',
]

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
