import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { Food, FoodLog, Slot } from '../db/types'
import { localDate } from './dates'
import { toFood } from './seed'

const r1 = (n: number) => Math.round(n * 10) / 10

type LogRow = {
  id: string; created_at: string; updated_at: string; deleted_at: string | null; log_date: string; slot: Slot
  food_id: string | null; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number
  recipe_id: string | null; portions: number | null; name: string | null
  fibre_g: number | null; sugars_g: number | null; salt_g: number | null
}
const toLog = (r: LogRow): FoodLog => ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, logDate: r.log_date, slot: r.slot,
  foodId: r.food_id, grams: r.grams, kcal: r.kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
  recipeId: r.recipe_id, portions: r.portions, name: r.name,
  fibreG: r.fibre_g, sugarsG: r.sugars_g, saltG: r.salt_g,
})

/** Scales a value that may be unknown; unknown stays unknown. */
const scaleKnown = (v: number | null | undefined, k: number) => (v == null ? null : r1(v * k))

export async function insertLog(db: SqlExecutor, l: { logDate: string; slot: Slot; foodId: string | null; grams: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number; recipeId?: string | null; portions?: number | null; name?: string | null
  fibreG?: number | null; sugarsG?: number | null; saltG?: number | null
}) {
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, food_id, grams, kcal, protein_g, carbs_g, fat_g, recipe_id, portions, name, fibre_g, sugars_g, salt_g)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, now, now, l.logDate, l.slot, l.foodId, l.grams, l.kcal, l.proteinG, l.carbsG, l.fatG, l.recipeId ?? null, l.portions ?? null, l.name?.trim() || null,
      l.fibreG ?? null, l.sugarsG ?? null, l.saltG ?? null],
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
    fibreG: scaleKnown(f.fibre_100g, k), sugarsG: scaleKnown(f.sugars_100g, k), saltG: scaleKnown(f.salt_100g, k),
  })
}

export function quickAdd(db: SqlExecutor, q: { name?: string; kcal: number; proteinG?: number; carbsG?: number; fatG?: number; slot: Slot; logDate?: string }): Promise<string> {
  if (!(q.kcal >= 0)) throw new Error('Calories must be 0 or more')
  return insertLog(db, {
    name: q.name, logDate: q.logDate ?? localDate(), slot: q.slot, foodId: null, grams: null,
    kcal: Math.round(q.kcal), proteinG: r1(q.proteinG ?? 0), carbsG: r1(q.carbsG ?? 0), fatG: r1(q.fatG ?? 0),
  })
}

export type LogEdit =
  | { slot: Slot; grams: number }
  | { slot: Slot; portions: number }
  | { slot: Slot; name?: string; kcal: number; proteinG: number; carbsG: number; fatG: number }

/**
 * Changes a log's meal and amount. A food or recipe log is rescaled from its own snapshot (never from the food's
 * current values, so editing a food still never changes history); a quick add takes its numbers as given.
 */
export async function editLog(db: SqlExecutor, id: string, e: LogEdit): Promise<void> {
  const [r] = await db.all<LogRow>('SELECT * FROM food_logs WHERE id = ? AND deleted_at IS NULL', [id])
  if (!r) throw new Error('That entry has been deleted')
  type Next = { kcal: number; proteinG: number; carbsG: number; fatG: number; fibreG: number | null; sugarsG: number | null; saltG: number | null }
  let next: Next & { grams: number | null; portions: number | null; name: string | null }
  const scaled = (k: number): Next => ({
    kcal: Math.round(r.kcal * k), proteinG: r1(r.protein_g * k), carbsG: r1(r.carbs_g * k), fatG: r1(r.fat_g * k),
    fibreG: scaleKnown(r.fibre_g, k), sugarsG: scaleKnown(r.sugars_g, k), saltG: scaleKnown(r.salt_g, k),
  })
  if ('grams' in e) {
    if (!(e.grams > 0) || !r.grams) throw new Error('Portion must be more than 0 g')
    next = { ...scaled(e.grams / r.grams), grams: e.grams, portions: r.portions, name: r.name }
  } else if ('portions' in e) {
    if (!(e.portions > 0)) throw new Error('Portions must be more than 0')
    next = { ...scaled(e.portions / (r.portions ?? 1)), grams: r.grams, portions: e.portions, name: r.name }
  } else {
    if (r.food_id || r.recipe_id) throw new Error('Change the portion of a food or recipe, not its numbers')
    if (!(e.kcal >= 0) || ![e.proteinG, e.carbsG, e.fatG].every((v) => v >= 0)) throw new Error('Numbers must be 0 or more')
    next = {
      kcal: Math.round(e.kcal), proteinG: r1(e.proteinG), carbsG: r1(e.carbsG), fatG: r1(e.fatG),
      fibreG: r.fibre_g, sugarsG: r.sugars_g, saltG: r.salt_g, grams: null, portions: null, name: e.name?.trim() || null,
    }
  }
  await db.run(
    `UPDATE food_logs SET slot = ?, grams = ?, portions = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fibre_g = ?, sugars_g = ?, salt_g = ?, name = ?, updated_at = ?
     WHERE id = ?`,
    [e.slot, next.grams, next.portions, next.kcal, next.proteinG, next.carbsG, next.fatG, next.fibreG, next.sugarsG, next.saltG, next.name, nowIso(), id],
  )
}

const plural = (unit: string) => (unit === 'tbsp' || unit === 'tsp' ? unit : /(s|x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`)

/** "1 slice (36 g)" and "2 slices (72 g)" for a food with a serving size. Labels with numbers in them (Open Food Facts' "30 g") read as "serving". */
export function servingOptions(f: Pick<Food, 'servingG' | 'servingLabel'>): { label: string; grams: number }[] {
  if (!f.servingG || !(f.servingG > 0)) return []
  const unit = f.servingLabel && !/\d/.test(f.servingLabel) ? f.servingLabel.trim() : 'serving'
  const g = (n: number) => r1(f.servingG! * n)
  return [
    { label: `1 ${unit} (${g(1)} g)`, grams: g(1) },
    { label: `2 ${plural(unit)} (${g(2)} g)`, grams: g(2) },
  ]
}

export async function createUserFood(db: SqlExecutor, f: Omit<Food, 'id' | 'source'>): Promise<string> {
  if (!f.name.trim()) throw new Error('A food needs a name')
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO foods (id, created_at, updated_at, source, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label,
                        fibre_100g, sugars_100g, salt_100g)
     VALUES (?,?,?,'user',?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, now, now, f.barcode, f.name.trim(), f.brand, f.kcal100g, f.protein100g, f.carbs100g, f.fat100g, f.servingG, f.servingLabel,
      f.fibre100g ?? null, f.sugars100g ?? null, f.salt100g ?? null],
  )
  return id
}

export async function getFood(db: SqlExecutor, id: string): Promise<Food | null> {
  const [r] = await db.all<Parameters<typeof toFood>[0]>('SELECT * FROM foods WHERE id = ?', [id])
  return r ? toFood(r) : null
}

export async function dayTotals(db: SqlExecutor, logDate: string) {
  const [r] = await db.all<{ kcal: number | null; p: number | null; c: number | null; f: number | null; fi: number | null; su: number | null; sa: number | null; nofi: number | null }>(
    `SELECT SUM(kcal) AS kcal, SUM(protein_g) AS p, SUM(carbs_g) AS c, SUM(fat_g) AS f,
            SUM(fibre_g) AS fi, SUM(sugars_g) AS su, SUM(salt_g) AS sa, SUM(fibre_g IS NULL) AS nofi
     FROM food_logs WHERE deleted_at IS NULL AND log_date = ?`,
    [logDate],
  )
  return {
    kcal: Math.round(r?.kcal ?? 0), proteinG: r1(r?.p ?? 0), carbsG: r1(r?.c ?? 0), fatG: r1(r?.f ?? 0),
    /** Sums of the entries that know them; `fibreUnknown` counts the entries that don't. */
    fibreG: r1(r?.fi ?? 0), sugarsG: r1(r?.su ?? 0), saltG: r1(r?.sa ?? 0), fibreUnknown: r?.nofi ?? 0,
  }
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
    name: l.recipeId ? `${recipes.get(l.recipeId) ?? 'Recipe'}, ${portionsLabel(l.portions)}` : l.foodId ? (names.get(l.foodId) ?? 'Food') : (l.name ?? 'Quick add'),
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
