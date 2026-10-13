import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import type { Slot } from '../../db/types'
import { localDate } from '../dates'
import { insertLog } from '../food'
import { latestPrice, monthYear } from './prices'
import type { NewRecipe, Nutrition, Recipe, RecipeCost, RecipeSummary, RecipeTag } from './types'

const r1 = (n: number) => Math.round(n * 10) / 10
const MIN_PORTIONS = 0.5

type MealRow = {
  id: string; key: string | null; name: string; description: string | null; servings: number; prep_minutes: number | null
  cook_minutes: number | null; steps: string; tags: string; fridge_days: number | null; source: 'tally' | 'user'
}
type ItemRow = { food_id: string; grams: number; name: string | null }

async function items(db: SqlExecutor, id: string) {
  const rows = await db.all<ItemRow>(
    `SELECT i.food_id, i.grams, f.name FROM meal_items i LEFT JOIN foods f ON f.id = i.food_id
     WHERE i.meal_id = ? AND i.deleted_at IS NULL ORDER BY i.position, i.rowid`,
    [id],
  )
  return rows.map((r) => ({ foodId: r.food_id, name: r.name ?? 'Unknown ingredient', grams: r.grams }))
}

/** A recipe by id, or null if it isn't one (plain meals are not recipes) or has been deleted. */
export async function getRecipe(db: SqlExecutor, id: string): Promise<Recipe | null> {
  const [m] = await db.all<MealRow>("SELECT * FROM meals WHERE id = ? AND kind = 'recipe' AND deleted_at IS NULL", [id])
  if (!m) return null
  return {
    id: m.id, key: m.key, name: m.name, description: m.description, servings: m.servings, prepMinutes: m.prep_minutes, cookMinutes: m.cook_minutes,
    steps: JSON.parse(m.steps) as string[], tags: JSON.parse(m.tags) as RecipeTag[], fridgeDays: m.fridge_days, source: m.source, items: await items(db, id),
  }
}

function validate(r: NewRecipe) {
  if (!r.name.trim()) throw new Error('A recipe needs a name')
  if (!Number.isInteger(r.servings) || r.servings < 1) throw new Error('A recipe needs at least 1 portion')
  if (r.items.length === 0) throw new Error('A recipe needs at least one ingredient')
  if (r.items.some((i) => !(i.grams > 0))) throw new Error('Every ingredient needs an amount above 0 g')
}

async function writeItems(tx: SqlExecutor, mealId: string, list: NewRecipe['items'], now: string) {
  for (const [i, it] of list.entries()) {
    await tx.run(
      'INSERT INTO meal_items (id, created_at, updated_at, meal_id, food_id, grams, position) VALUES (?,?,?,?,?,?,?)',
      [newId(), now, now, mealId, it.foodId, it.grams, i],
    )
  }
}

/** Creates the user's own recipe. Nutrition and cost are never stored; they are worked out from the ingredients. */
export async function createRecipe(db: SqlExecutor, r: NewRecipe): Promise<string> {
  validate(r)
  const id = newId()
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO meals (id, created_at, updated_at, name, kind, servings, prep_minutes, cook_minutes, steps, tags, fridge_days, source, description)
       VALUES (?,?,?,?,'recipe',?,?,?,?,?,?,'user',?)`,
      [id, now, now, r.name.trim(), r.servings, r.prepMinutes, r.cookMinutes, JSON.stringify(r.steps), JSON.stringify(r.tags), r.fridgeDays, r.description],
    )
    await writeItems(tx, id, r.items, now)
  })
  return id
}

async function ownRecipe(db: SqlExecutor, id: string): Promise<Recipe> {
  const r = await getRecipe(db, id)
  if (!r) throw new Error('Recipe not found')
  if (r.source !== 'user') throw new Error("Tally's own recipes can't be changed. Copy it first.")
  return r
}

export async function updateRecipe(db: SqlExecutor, id: string, r: NewRecipe): Promise<void> {
  await ownRecipe(db, id)
  validate(r)
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE meals SET name = ?, servings = ?, prep_minutes = ?, cook_minutes = ?, steps = ?, tags = ?, fridge_days = ?, description = ?, updated_at = ? WHERE id = ?`,
      [r.name.trim(), r.servings, r.prepMinutes, r.cookMinutes, JSON.stringify(r.steps), JSON.stringify(r.tags), r.fridgeDays, r.description, now, id],
    )
    await tx.run('UPDATE meal_items SET deleted_at = ?, updated_at = ? WHERE meal_id = ? AND deleted_at IS NULL', [now, now, id])
    await writeItems(tx, id, r.items, now)
  })
}

export async function deleteRecipe(db: SqlExecutor, id: string): Promise<void> {
  await ownRecipe(db, id)
  const now = nowIso()
  await db.run('UPDATE meals SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function restoreRecipe(db: SqlExecutor, id: string): Promise<void> {
  await db.run("UPDATE meals SET deleted_at = NULL, updated_at = ? WHERE id = ? AND kind = 'recipe'", [nowIso(), id])
}

/** The user's own editable copy of any recipe. The original is left alone. */
export async function copyRecipe(db: SqlExecutor, id: string): Promise<string> {
  const r = await getRecipe(db, id)
  if (!r) throw new Error('Recipe not found')
  return createRecipe(db, {
    name: `${r.name} (mine)`, description: r.description, servings: r.servings, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes,
    steps: r.steps, tags: r.tags, fridgeDays: r.fridgeDays, items: r.items.map((i) => ({ foodId: i.foodId, grams: i.grams })),
  })
}

/** Nutrition for one portion, from the foods table as it is now. An ingredient whose food is gone adds nothing. */
export async function recipeNutrition(db: SqlExecutor, recipeId: string): Promise<Nutrition> {
  const r = await getRecipe(db, recipeId)
  if (!r) throw new Error('Recipe not found')
  const rows = await db.all<{ kcal: number | null; p: number | null; c: number | null; f: number | null }>(
    `SELECT SUM(f.kcal_100g * i.grams / 100.0) AS kcal, SUM(f.protein_100g * i.grams / 100.0) AS p,
            SUM(f.carbs_100g * i.grams / 100.0) AS c, SUM(f.fat_100g * i.grams / 100.0) AS f
     FROM meal_items i JOIN foods f ON f.id = i.food_id WHERE i.meal_id = ? AND i.deleted_at IS NULL`,
    [recipeId],
  )
  const t = rows[0]
  return {
    kcal: Math.round((t?.kcal ?? 0) / r.servings), proteinG: r1((t?.p ?? 0) / r.servings),
    carbsG: r1((t?.c ?? 0) / r.servings), fatG: r1((t?.f ?? 0) / r.servings),
  }
}

/** Cost per portion and in total, from the newest price of each ingredient (by weight: grams ÷ pack size × pack price). */
export async function recipeCost(db: SqlExecutor, recipeId: string): Promise<RecipeCost> {
  const r = await getRecipe(db, recipeId)
  if (!r) throw new Error('Recipe not found')
  let total = 0
  const missing: string[] = []
  let estimated: string | null = null
  for (const it of r.items) {
    const p = await latestPrice(db, it.foodId)
    if (!p || it.name === 'Unknown ingredient') {
      missing.push(it.name)
      continue
    }
    total += (it.grams / p.packG) * p.pricePence
    if (p.source === 'estimate' && (!estimated || p.logDate > estimated)) estimated = p.logDate
  }
  return {
    perPortionPence: Math.round(total / r.servings), totalPence: Math.round(total), complete: missing.length === 0, missing,
    estimatedMonth: estimated ? monthYear(estimated) : null,
  }
}

/**
 * Logs portions of a recipe as one food log. The snapshot is the per-portion nutrition shown on the recipe times the
 * portions, so two portions are exactly double one, and later edits to the recipe, foods or prices never change it.
 */
export async function logRecipe(db: SqlExecutor, recipeId: string, portions: number, slot: Slot, logDate: string = localDate()): Promise<string> {
  if (!(portions >= MIN_PORTIONS)) throw new Error('Portions must be 0.5 or more')
  const n = await recipeNutrition(db, recipeId) // throws if the recipe isn't there
  return insertLog(db, {
    logDate, slot, foodId: null, grams: null, recipeId, portions,
    kcal: Math.round(n.kcal * portions), proteinG: r1(n.proteinG * portions), carbsG: r1(n.carbsG * portions), fatG: r1(n.fatG * portions),
  })
}

export async function listRecipes(db: SqlExecutor, f: { tag?: RecipeTag; source?: 'tally' | 'user' } = {}): Promise<RecipeSummary[]> {
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM meals WHERE kind = 'recipe' AND deleted_at IS NULL ${f.source ? 'AND source = ?' : ''} ORDER BY CASE source WHEN 'tally' THEN 0 ELSE 1 END, rowid`,
    f.source ? [f.source] : [],
  )
  const out: RecipeSummary[] = []
  for (const { id } of rows) {
    const r = (await getRecipe(db, id))!
    if (f.tag && !r.tags.includes(f.tag)) continue
    const nutrition = await recipeNutrition(db, id)
    const cost = await recipeCost(db, id)
    const proteinPerPound = cost.complete && cost.perPortionPence > 0 ? nutrition.proteinG / (cost.perPortionPence / 100) : null
    out.push({ ...r, nutrition, cost, proteinPerPound })
  }
  return out
}
