import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { Food, FoodLog, Slot } from '../db/types'
import { localDate } from './dates'
import { toFood } from './seed'

const r1 = (n: number) => Math.round(n * 10) / 10

type LogRow = {
  id: string; created_at: string; updated_at: string; deleted_at: string | null; log_date: string; slot: Slot
  food_id: string | null; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number
  recipe_id: string | null; portions: number | null
}
const toLog = (r: LogRow): FoodLog => ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, logDate: r.log_date, slot: r.slot,
  foodId: r.food_id, grams: r.grams, kcal: r.kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
  recipeId: r.recipe_id, portions: r.portions,
})

export async function insertLog(db: SqlExecutor, l: { logDate: string; slot: Slot; foodId: string | null; grams: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number; recipeId?: string | null; portions?: number | null }) {
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, food_id, grams, kcal, protein_g, carbs_g, fat_g, recipe_id, portions)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, now, now, l.logDate, l.slot, l.foodId, l.grams, l.kcal, l.proteinG, l.carbsG, l.fatG, l.recipeId ?? null, l.portions ?? null],
  )
  return id
}

/** Logs a portion, snapshotting nutrition so later food edits never change history. */
export async function logFood(db: SqlExecutor, l: { foodId: string; grams: number; slot: Slot; logDate?: string }): Promise<string> {
  if (!(l.grams > 0)) throw new Error('Portion must be more than 0 g')
  const [f] = await db.all<Parameters<typeof toFood>[0]>('SELECT * FROM foods WHERE id = ?', [l.foodId])
  if (!f) throw new Error('Food not found')
  const k = l.grams / 100
  return insertLog(db, {
    logDate: l.logDate ?? localDate(), slot: l.slot, foodId: l.foodId, grams: l.grams,
    kcal: Math.round(f.kcal_100g * k), proteinG: r1(f.protein_100g * k), carbsG: r1(f.carbs_100g * k), fatG: r1(f.fat_100g * k),
  })
}

export function quickAdd(db: SqlExecutor, q: { kcal: number; proteinG?: number; carbsG?: number; fatG?: number; slot: Slot; logDate?: string }): Promise<string> {
  if (!(q.kcal >= 0)) throw new Error('Calories must be 0 or more')
  return insertLog(db, {
    logDate: q.logDate ?? localDate(), slot: q.slot, foodId: null, grams: null,
    kcal: Math.round(q.kcal), proteinG: r1(q.proteinG ?? 0), carbsG: r1(q.carbsG ?? 0), fatG: r1(q.fatG ?? 0),
  })
}

export async function createUserFood(db: SqlExecutor, f: Omit<Food, 'id' | 'source'>): Promise<string> {
  if (!f.name.trim()) throw new Error('A food needs a name')
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO foods (id, created_at, updated_at, source, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label)
     VALUES (?,?,?,'user',?,?,?,?,?,?,?,?,?)`,
    [id, now, now, f.barcode, f.name.trim(), f.brand, f.kcal100g, f.protein100g, f.carbs100g, f.fat100g, f.servingG, f.servingLabel],
  )
  return id
}

export async function getFood(db: SqlExecutor, id: string): Promise<Food | null> {
  const [r] = await db.all<Parameters<typeof toFood>[0]>('SELECT * FROM foods WHERE id = ?', [id])
  return r ? toFood(r) : null
}

export async function dayTotals(db: SqlExecutor, logDate: string) {
  const [r] = await db.all<{ kcal: number | null; p: number | null; c: number | null; f: number | null }>(
    `SELECT SUM(kcal) AS kcal, SUM(protein_g) AS p, SUM(carbs_g) AS c, SUM(fat_g) AS f
     FROM food_logs WHERE deleted_at IS NULL AND log_date = ?`,
    [logDate],
  )
  return { kcal: Math.round(r?.kcal ?? 0), proteinG: r1(r?.p ?? 0), carbsG: r1(r?.c ?? 0), fatG: r1(r?.f ?? 0) }
}

export async function dayLogs(db: SqlExecutor, logDate: string): Promise<FoodLog[]> {
  const rows = await db.all<LogRow>(
    `SELECT * FROM food_logs WHERE deleted_at IS NULL AND log_date = ?
     ORDER BY CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END, rowid`,
    [logDate],
  )
  return rows.map(toLog)
}

export async function copyDay(db: SqlExecutor, from: string, to: string, slot?: Slot): Promise<number> {
  const logs = (await dayLogs(db, from)).filter((l) => !slot || l.slot === slot)
  await db.transaction(async (tx) => {
    for (const l of logs) await insertLog(tx, { ...l, logDate: to })
  })
  return logs.length
}

export async function recentFoods(db: SqlExecutor, limit = 10): Promise<Food[]> {
  const rows = await db.all<Parameters<typeof toFood>[0]>(
    `SELECT f.* FROM foods f JOIN (SELECT food_id, MAX(rowid) AS last FROM food_logs WHERE deleted_at IS NULL AND food_id IS NOT NULL GROUP BY food_id) l
       ON l.food_id = f.id
     WHERE f.deleted_at IS NULL ORDER BY l.last DESC LIMIT ?`,
    [limit],
  )
  return rows.map(toFood)
}

export async function lastGrams(db: SqlExecutor, foodId: string): Promise<number | null> {
  const [r] = await db.all<{ grams: number }>(
    'SELECT grams FROM food_logs WHERE food_id = ? AND deleted_at IS NULL AND grams IS NOT NULL ORDER BY rowid DESC LIMIT 1',
    [foodId],
  )
  return r?.grams ?? null
}

export async function deleteLog(db: SqlExecutor, id: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE food_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function restoreLog(db: SqlExecutor, id: string): Promise<void> {
  await db.run('UPDATE food_logs SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id])
}

export async function dayLogsNamed(db: SqlExecutor, logDate: string): Promise<(FoodLog & { name: string })[]> {
  const logs = await dayLogs(db, logDate)
  const names = new Map<string, string>()
  const recipes = new Map<string, string>()
  for (const id of new Set(logs.map((l) => l.recipeId).filter((x): x is string => !!x))) {
    const [m] = await db.all<{ name: string }>('SELECT name FROM meals WHERE id = ?', [id])
    if (m) recipes.set(id, m.name)
  }
  for (const id of new Set(logs.map((l) => l.foodId).filter((x): x is string => !!x))) {
    const f = await getFood(db, id)
    if (f) names.set(id, f.brand ? `${f.name} (${f.brand})` : f.name)
  }
  const portionsLabel = (n: number | null) => `${n ?? 1} ${n === 1 || n === null ? 'portion' : 'portions'}`
  return logs.map((l) => ({
    ...l,
    name: l.recipeId ? `${recipes.get(l.recipeId) ?? 'Recipe'}, ${portionsLabel(l.portions)}` : l.foodId ? (names.get(l.foodId) ?? 'Food') : 'Quick add',
  }))
}

/** Daily kcal totals for days with any food logged, oldest first. */
export async function dailyKcal(db: SqlExecutor, from: string, to: string): Promise<{ logDate: string; kcal: number }[]> {
  return db.all(
    `SELECT log_date AS logDate, SUM(kcal) AS kcal FROM food_logs WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?
     GROUP BY log_date ORDER BY log_date`,
    [from, to],
  )
}
