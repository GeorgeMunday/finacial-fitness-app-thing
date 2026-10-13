import { beforeEach, describe, expect, it } from 'vitest'
import { chickenRice, food, price } from '../../../test/recipeHelpers'
import { freshDb } from '../../../test/renderApp'
import type { SqlExecutor } from '../../db/executor'
import { createRecipe } from '../recipes/recipes'
import { weekShoppingList } from '../recipes/shopping'

let db: SqlExecutor
beforeEach(async () => {
  db = await freshDb()
})

async function two() {
  const a = await chickenRice(db, { name: 'Chicken and rice' })
  await price(db, a.chicken, 650, 1000)
  await price(db, a.rice, 160, 1000)
  const onion = await food(db, 'Onion', 40, 1)
  await price(db, onion, 110, 1000)
  const b = await createRecipe(db, {
    name: 'Chicken soup', description: null, servings: 2, prepMinutes: 5, cookMinutes: 20, steps: [], tags: [], fridgeDays: null,
    items: [{ foodId: a.chicken, grams: 300 }, { foodId: onion, grams: 100 }],
  })
  return { a, b, onion }
}

describe('weekShoppingList', () => {
  it('merges the same ingredient across recipes into one line', async () => {
    const { a, b } = await two()
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 4 }, { recipeId: b, portions: 2 }])
    const chicken = list.lines.filter((l) => l.name === 'Chicken')
    expect(chicken).toEqual([{ foodId: a.chicken, name: 'Chicken', grams: 700, costPence: 455 }])
  })
  it('scales quantities by portions over servings', async () => {
    const { a } = await two()
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 2 }])
    expect(list.lines.map((l) => [l.name, l.grams])).toEqual([['Chicken', 200], ['Rice', 100]])
  })
  it('the total is the sum of the line costs', async () => {
    const { a, b } = await two()
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 4 }, { recipeId: b, portions: 2 }])
    expect(list.totalPence).toBe(list.lines.reduce((s, l) => s + (l.costPence ?? 0), 0))
    expect(list.totalPence).toBe(455 + 32 + 11)
    expect(list.complete).toBe(true)
  })
  it('lines are sorted by name', async () => {
    const { a, b } = await two()
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 4 }, { recipeId: b, portions: 2 }])
    expect(list.lines.map((l) => l.name)).toEqual(['Chicken', 'Onion', 'Rice'])
  })
  it('a food with no price makes the list incomplete and is named', async () => {
    const { a } = await two()
    await db.run('DELETE FROM product_prices WHERE food_id = ?', [a.rice])
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 4 }])
    expect(list).toMatchObject({ complete: false, missing: ['Rice'], totalPence: 260 })
    expect(list.lines.find((l) => l.name === 'Rice')!.costPence).toBeNull()
  })
  it('ignores zero portions and an empty list gives an empty result', async () => {
    const { a } = await two()
    expect(await weekShoppingList(db, [{ recipeId: a.id, portions: 0 }])).toEqual({ lines: [], totalPence: 0, complete: true, missing: [] })
    expect(await weekShoppingList(db, [])).toEqual({ lines: [], totalPence: 0, complete: true, missing: [] })
  })
  it('fractional portions work', async () => {
    const { a } = await two()
    const list = await weekShoppingList(db, [{ recipeId: a.id, portions: 0.5 }])
    expect(list.lines[0].grams).toBe(50)
  })
})
