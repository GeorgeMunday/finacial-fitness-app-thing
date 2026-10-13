import { beforeEach, describe, expect, it } from 'vitest'
import { realSeed, seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { exportAll, importAll } from '../backup'
import { createRecipe, getRecipe, listRecipes, recipeCost, recipeNutrition } from '../recipes/recipes'
import { setIngredientPrice } from '../recipes/prices'
import { RECIPE_TAGS } from '../recipes/types'
import { seedAll } from '../seed'
import { freshDb } from '../../../test/renderApp'

const NAMES = [
  'Chicken thigh, rice and pepper traybake', 'Turkey mince chilli with kidney beans', 'Beef and lentil bolognese',
  'Chicken tikka-style curry with Greek yoghurt and rice', 'Tuna pasta bake', 'Turkey meatballs in tomato sauce',
  'Egg, ham and spinach muffins', 'Overnight oats with Greek yoghurt and whey', 'Tuna, sweetcorn and cottage cheese jacket potato',
  'Chicken and veg egg-fried rice', 'Scrambled eggs and beans on toast', 'Greek yoghurt protein pot',
]
const BANNED = /\b(clean|guilt[- ]free|cheat|junk|sinful|naughty)\b/i

let db: SqlExecutor
beforeEach(async () => {
  db = await seededDb()
})
const tally = () => listRecipes(db, { source: 'tally' })

describe('seeded recipes', () => {
  it('has exactly the 12 recipes from the brief', async () => {
    expect((await tally()).map((r) => r.name).sort()).toEqual([...NAMES].sort())
  })
  it('every recipe has at least 30 g protein per portion', async () => {
    for (const r of await tally()) expect(r.nutrition.proteinG, r.name).toBeGreaterThanOrEqual(30)
  })
  it('every recipe costs at most £2.00 a portion, with every ingredient priced', async () => {
    for (const r of await tally()) {
      expect(r.cost.complete, r.name).toBe(true)
      expect(r.cost.perPortionPence, r.name).toBeLessThanOrEqual(200)
      expect(r.cost.perPortionPence, r.name).toBeGreaterThan(0)
    }
  })
  it('batch recipes make 3–5 portions; quick recipes are one portion with 15 minutes or less of prep', async () => {
    for (const r of await tally()) {
      if (r.tags.includes('batch')) {
        expect(r.servings, r.name).toBeGreaterThanOrEqual(3)
        expect(r.servings, r.name).toBeLessThanOrEqual(5)
      }
      if (r.tags.includes('quick')) {
        expect(r.servings, r.name).toBe(1)
        expect(r.prepMinutes!, r.name).toBeLessThanOrEqual(15)
      }
      expect(r.tags.includes('batch') !== r.tags.includes('quick'), r.name).toBe(true)
    }
  })
  it('8 are batch and 4 are quick', async () => {
    expect((await tally()).filter((r) => r.tags.includes('batch'))).toHaveLength(8)
    expect((await tally()).filter((r) => r.tags.includes('quick'))).toHaveLength(4)
  })
  it('every recipe has steps, grams, times, allowed tags and a fridge time', async () => {
    for (const r of await tally()) {
      expect(r.steps.length, r.name).toBeGreaterThanOrEqual(3)
      expect(r.steps.every((s) => s.length > 0 && s.length <= 300), r.name).toBe(true)
      expect(r.items.length, r.name).toBeGreaterThanOrEqual(3)
      expect(r.items.every((i) => i.grams > 0), r.name).toBe(true)
      expect(r.prepMinutes, r.name).toBeGreaterThan(0)
      expect(r.cookMinutes, r.name).not.toBeNull()
      expect(r.tags.every((t) => RECIPE_TAGS.includes(t)), r.name).toBe(true)
      expect(r.tags.some((t) => ['breakfast', 'lunch', 'dinner'].includes(t)), r.name).toBe(true)
      if (r.name === 'Scrambled eggs and beans on toast') expect(r.fridgeDays).toBeNull()
      else expect(r.fridgeDays, r.name).toBeGreaterThan(0)
      expect(r.source).toBe('tally')
      expect(r.key).toBeTruthy()
    }
  })
  it('uses ingredients that are all in the foods table, none of them labelled CoFID', async () => {
    const rows = await db.all<{ source: string }>(
      "SELECT DISTINCT f.source FROM meal_items i JOIN meals m ON m.id = i.meal_id JOIN foods f ON f.id = i.food_id WHERE m.source = 'tally'")
    expect(rows).toEqual([{ source: 'starter' }])
    const orphans = await db.all("SELECT i.id FROM meal_items i JOIN meals m ON m.id = i.meal_id LEFT JOIN foods f ON f.id = i.food_id WHERE m.source = 'tally' AND f.id IS NULL")
    expect(orphans).toEqual([])
  })
  it('contains no banned words and no web addresses', async () => {
    const seed = realSeed().recipes as { recipes: unknown }
    const text = JSON.stringify(seed.recipes)
    expect(text).not.toMatch(BANNED)
    expect(text).not.toMatch(/https?:|www\./i)
  })
  it('computes nutrition from the foods rather than storing it', async () => {
    const [r] = await tally()
    const before = (await recipeNutrition(db, r.id)).proteinG
    await db.run('UPDATE foods SET protein_100g = protein_100g + 10 WHERE id IN (SELECT food_id FROM meal_items WHERE meal_id = ?)', [r.id])
    expect((await recipeNutrition(db, r.id)).proteinG).toBeGreaterThan(before)
  })
  it('prices are estimates for "October 2026"', async () => {
    for (const r of await tally()) expect((await recipeCost(db, r.id)).estimatedMonth, r.name).toBe('October 2026')
    const rows = await db.all<{ source: string }>('SELECT DISTINCT source FROM product_prices')
    expect(rows).toEqual([{ source: 'estimate' }])
  })
})

describe('seeding again', () => {
  it('adds no recipes or prices the second time', async () => {
    const before = await db.all<{ n: number }>('SELECT (SELECT COUNT(*) FROM meals) AS a, (SELECT COUNT(*) FROM product_prices) AS b, (SELECT COUNT(*) FROM meal_items) AS c')
    expect((await seedAll(db, realSeed())).recipes).toBe(0)
    expect(await db.all<{ n: number }>('SELECT (SELECT COUNT(*) FROM meals) AS a, (SELECT COUNT(*) FROM product_prices) AS b, (SELECT COUNT(*) FROM meal_items) AS c')).toEqual(before)
  })
  it('keeps an edited price and does not add the estimate back', async () => {
    const [r] = await tally()
    const foodId = r.items[0].foodId
    await setIngredientPrice(db, foodId, 999, 1000)
    await seedAll(db, realSeed())
    const cost = await recipeCost(db, r.id)
    expect(cost.perPortionPence).toBeGreaterThan(0)
    const rows = await db.all("SELECT id FROM product_prices WHERE food_id = ?", [foodId])
    expect(rows).toHaveLength(2)
  })
  it("leaves the user's own recipes alone", async () => {
    const [r] = await tally()
    const mine = await createRecipe(db, { name: 'Mine', description: null, servings: 1, prepMinutes: null, cookMinutes: null, steps: [], tags: [], fridgeDays: null, items: [{ foodId: r.items[0].foodId, grams: 10 }] })
    await seedAll(db, realSeed())
    expect(await getRecipe(db, mine)).toMatchObject({ name: 'Mine', source: 'user' })
  })
  it('a backup made before this release, restored and re-seeded, has the 12 recipes', async () => {
    const old = await freshDb()
    const backup = JSON.parse(JSON.stringify(await exportAll(old)))
    await importAll(db, backup) // wipes the seeded recipes, like restoring an old backup
    expect(await tally()).toEqual([])
    await seedAll(db, realSeed())
    expect(await tally()).toHaveLength(12)
  })
})
