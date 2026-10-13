import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import type { RecipeTag } from './types'

export type SeedRecipe = {
  key: string; name: string; description: string; servings: number; prepMinutes: number; cookMinutes: number; fridgeDays: number | null
  tags: RecipeTag[]; ingredients: { food: string; grams: number }[]; steps: string[]
}
export type RecipeSeedFile = { pricesEstimated: string; prices: { food: string; packG: number; pricePence: number }[]; recipes: SeedRecipe[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "October 2026" → "2026-10-01". */
function firstOfMonth(label: string): string {
  const [month, year] = label.trim().split(/\s+/)
  const m = MONTHS.indexOf(month.toLowerCase()) + 1
  if (!m || !/^\d{4}$/.test(year ?? '')) throw new Error(`Can't read the price date "${label}"`)
  return `${year}-${String(m).padStart(2, '0')}-01`
}

/**
 * Adds the bundled recipes whose key isn't there yet, and an estimated price for each priced food that has none.
 * Existing recipes, user recipes and edited prices are never touched. Runs inside the caller's transaction.
 */
export async function seedRecipes(tx: SqlExecutor, file: RecipeSeedFile): Promise<number> {
  const foods = new Map((await tx.all<{ id: string; name: string }>("SELECT id, name FROM foods WHERE source = 'starter' AND deleted_at IS NULL")).map((f) => [f.name, f.id]))
  const foodId = (name: string) => {
    const id = foods.get(name)
    if (!id) throw new Error(`Food not found: ${name}`)
    return id
  }
  const now = nowIso()
  const date = firstOfMonth(file.pricesEstimated)
  const priced = new Set((await tx.all<{ food_id: string }>('SELECT DISTINCT food_id FROM product_prices WHERE deleted_at IS NULL')).map((r) => r.food_id))
  for (const p of file.prices) {
    const id = foodId(p.food)
    if (priced.has(id)) continue
    priced.add(id)
    await tx.run(
      `INSERT INTO product_prices (id, created_at, updated_at, food_id, price_pence, pack_g, shop, log_date, source) VALUES (?,?,?,?,?,?,'Estimated',?,'estimate')`,
      [newId(), now, now, id, p.pricePence, p.packG, date],
    )
  }
  const have = new Set((await tx.all<{ key: string }>('SELECT key FROM meals WHERE key IS NOT NULL')).map((r) => r.key))
  let added = 0
  for (const r of file.recipes) {
    if (have.has(r.key)) continue
    const id = newId()
    await tx.run(
      `INSERT INTO meals (id, created_at, updated_at, name, kind, servings, prep_minutes, cook_minutes, steps, tags, fridge_days, source, key, description)
       VALUES (?,?,?,?,'recipe',?,?,?,?,?,?,'tally',?,?)`,
      [id, now, now, r.name, r.servings, r.prepMinutes, r.cookMinutes, JSON.stringify(r.steps), JSON.stringify(r.tags), r.fridgeDays, r.key, r.description],
    )
    for (const [i, it] of r.ingredients.entries()) {
      await tx.run('INSERT INTO meal_items (id, created_at, updated_at, meal_id, food_id, grams, position) VALUES (?,?,?,?,?,?,?)', [newId(), now, now, id, foodId(it.food), it.grams, i])
    }
    added++
  }
  return added
}
