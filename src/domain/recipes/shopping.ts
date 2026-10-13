import type { SqlExecutor } from '../../db/executor'
import { latestPrice } from './prices'
import { getRecipe } from './recipes'

export type ShoppingLine = { foodId: string; name: string; grams: number; costPence: number | null }
export type ShoppingList = { lines: ShoppingLine[]; totalPence: number; complete: boolean; missing: string[] }

/**
 * One combined list for the recipes and portions picked. Each ingredient is scaled by portions ÷ servings and the same
 * food across recipes becomes one line. Costs are by weight; the total is the sum of the line costs.
 */
export async function weekShoppingList(db: SqlExecutor, selections: { recipeId: string; portions: number }[]): Promise<ShoppingList> {
  const merged = new Map<string, { name: string; grams: number }>()
  for (const s of selections) {
    if (!(s.portions > 0)) continue
    const r = await getRecipe(db, s.recipeId)
    if (!r) throw new Error('Recipe not found')
    for (const it of r.items) {
      const cur = merged.get(it.foodId) ?? { name: it.name, grams: 0 }
      cur.grams += (it.grams * s.portions) / r.servings
      merged.set(it.foodId, cur)
    }
  }
  const lines: ShoppingLine[] = []
  const missing: string[] = []
  for (const [foodId, m] of merged) {
    const p = await latestPrice(db, foodId)
    if (!p) missing.push(m.name)
    lines.push({ foodId, name: m.name, grams: Math.round(m.grams), costPence: p ? Math.round((m.grams / p.packG) * p.pricePence) : null })
  }
  lines.sort((a, b) => a.name.localeCompare(b.name))
  missing.sort((a, b) => a.localeCompare(b))
  return { lines, totalPence: lines.reduce((s, l) => s + (l.costPence ?? 0), 0), complete: missing.length === 0, missing }
}
