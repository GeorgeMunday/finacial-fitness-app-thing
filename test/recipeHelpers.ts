import type { SqlExecutor } from '../src/db/executor'
import { createUserFood } from '../src/domain/food'
import { createRecipe } from '../src/domain/recipes/recipes'
import type { RecipeTag } from '../src/domain/recipes/types'

export const food = (db: SqlExecutor, name: string, kcal: number, p: number, c = 0, f = 0) =>
  createUserFood(db, { name, kcal100g: kcal, protein100g: p, carbs100g: c, fat100g: f, barcode: null, brand: null, servingG: null, servingLabel: null, createdAt: '', updatedAt: '', deletedAt: null } as never)

export const price = (db: SqlExecutor, foodId: string, pricePence: number, packG: number, source: 'estimate' | 'user' = 'user', logDate = '2026-10-01') =>
  db.run(
    'INSERT INTO product_prices (id, created_at, updated_at, food_id, price_pence, pack_g, shop, log_date, source) VALUES (?,?,?,?,?,?,?,?,?)',
    [crypto.randomUUID(), 'x', 'x', foodId, pricePence, packG, null, logDate, source],
  )

/** A 4-portion recipe: 400 g chicken (100 kcal, 20 g protein per 100 g) and 200 g rice (350 kcal, 7 g protein per 100 g). */
export async function chickenRice(db: SqlExecutor, o: { servings?: number; tags?: RecipeTag[]; name?: string } = {}) {
  const chicken = await food(db, 'Chicken', 100, 20, 0, 2)
  const rice = await food(db, 'Rice', 350, 7, 78, 1)
  const id = await createRecipe(db, {
    name: o.name ?? 'Chicken and rice', description: null, servings: o.servings ?? 4, prepMinutes: 10, cookMinutes: 30,
    steps: ['Cook the rice.', 'Fry the chicken.'], tags: o.tags ?? ['batch', 'dinner'], fridgeDays: 3,
    items: [{ foodId: chicken, grams: 400 }, { foodId: rice, grams: 200 }],
  })
  return { id, chicken, rice }
}
