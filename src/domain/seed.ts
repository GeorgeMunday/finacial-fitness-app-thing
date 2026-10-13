import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { Food } from '../db/types'

export type SeedFood = { name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }
export type SeedExercise = { name: string; primary_muscle: string; equipment: string }
/** `starter` is Tally's own short list of typical values, not CoFID; `cofid` is the real dataset once it is bundled. */
export type SeedData = { starter: SeedFood[]; cofid: SeedFood[]; exercises: SeedExercise[] }

/** Inserts bundled foods and exercises the first time they're needed. Idempotent per source. */
export async function seedIfEmpty(db: SqlExecutor, data: SeedData): Promise<{ foods: number; exercises: number }> {
  const out = { foods: 0, exercises: 0 }
  await db.transaction(async (tx) => {
    const has = async (sql: string) => (await tx.all<{ n: number }>(sql))[0].n > 0
    const now = nowIso()
    for (const source of ['starter', 'cofid'] as const) {
      if (await has(`SELECT COUNT(*) AS n FROM foods WHERE source = '${source}'`)) continue
      for (const x of data[source]) {
        await tx.run(
          `INSERT INTO foods (id, created_at, updated_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [newId(), now, now, source, x.name, x.kcal_100g, x.protein_100g, x.carbs_100g, x.fat_100g],
        )
        out.foods++
      }
    }
    if (!(await has("SELECT COUNT(*) AS n FROM exercises WHERE source = 'seed'"))) {
      for (const x of data.exercises) {
        await tx.run(
          `INSERT INTO exercises (id, created_at, updated_at, source, name, primary_muscle, equipment) VALUES (?,?,?,'seed',?,?,?)`,
          [newId(), now, now, x.name, x.primary_muscle, x.equipment],
        )
        out.exercises++
      }
    }
  })
  return out
}

export async function loadSeed(fetchFn: typeof fetch = fetch): Promise<SeedData> {
  const get = async <T,>(path: string, optional = false): Promise<T | null> => {
    const res = await fetchFn(path)
    if (!res.ok) {
      if (optional && res.status === 404) return null
      throw new Error(`Couldn't load ${path}`)
    }
    try {
      return (await res.json()) as T
    } catch (e) {
      if (optional) return null // a host that answers missing files with index.html
      throw e
    }
  }
  const [starter, cofid, exercises] = await Promise.all([
    get<SeedFood[]>('/seed/starter.json'),
    get<SeedFood[]>('/seed/cofid.json', true), // only present once the real CoFID file has been converted with scripts/build-seed.ts
    get<SeedExercise[]>('/seed/exercises.json'),
  ])
  return { starter: starter ?? [], cofid: cofid ?? [], exercises: exercises ?? [] }
}

type FoodRow = {
  id: string; created_at: string; updated_at: string; deleted_at: string | null; source: Food['source']; barcode: string | null
  name: string; brand: string | null; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number
  serving_g: number | null; serving_label: string | null
}
export const toFood = (r: FoodRow): Food => ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, source: r.source, barcode: r.barcode,
  name: r.name, brand: r.brand, kcal100g: r.kcal_100g, protein100g: r.protein_100g, carbs100g: r.carbs_100g, fat100g: r.fat_100g,
  servingG: r.serving_g, servingLabel: r.serving_label,
})

/** Recently logged foods first, then user > off > cofid > starter, then by name. */
export async function searchFoods(db: SqlExecutor, query: string, limit = 20): Promise<Food[]> {
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = await db.all<FoodRow>(
    `SELECT f.* FROM foods f
     LEFT JOIN (SELECT food_id, MAX(rowid) AS last FROM food_logs WHERE deleted_at IS NULL GROUP BY food_id) l ON l.food_id = f.id
     WHERE f.deleted_at IS NULL AND (f.name LIKE ? ESCAPE '\\' OR f.brand LIKE ? ESCAPE '\\')
     ORDER BY (l.last IS NULL), l.last DESC,
              CASE f.source WHEN 'user' THEN 0 WHEN 'off' THEN 1 WHEN 'cofid' THEN 2 ELSE 3 END, f.name
     LIMIT ?`,
    [like, like, limit],
  )
  return rows.map(toFood)
}
