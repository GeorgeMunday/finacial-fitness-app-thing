import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { Food } from '../db/types'
import { toFood } from './seed'

export type BarcodeResult =
  | { status: 'found'; food: Food; imageUrl?: string | null; photo?: Promise<void> }
  | { status: 'incomplete'; draft: Partial<Food> & { barcode: string } }
  | { status: 'not_found' | 'offline'; draft: { barcode: string } }

const num = (v: unknown): number | undefined => {
  if (typeof v === 'string' && v.trim() === '') return undefined // Number('') is 0: a blank is missing, not zero
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Maps an Open Food Facts product response. Anything missing a nutrient is `incomplete`, never a zero. */
export function mapOffProduct(json: unknown, barcode: string): BarcodeResult {
  const product = (json as { status?: number; product?: Record<string, unknown> } | null)?.product
  if (!product || (json as { status?: number }).status === 0) return { status: 'not_found', draft: { barcode } }
  const n = (product.nutriments ?? {}) as Record<string, unknown>
  const kj = num(n['energy-kj_100g'])
  let kcal = num(n['energy-kcal_100g']) ?? (kj === undefined ? undefined : Math.round(kj / 4.184))
  const protein = num(n.proteins_100g)
  const carbs = num(n.carbohydrates_100g)
  const fat = num(n.fat_100g)
  // 0 kcal alongside real macros is a data-entry gap, not a zero-calorie food: ask the user instead.
  const macroKcal = 4 * (protein ?? 0) + 4 * (carbs ?? 0) + 9 * (fat ?? 0)
  if (kcal === 0 && macroKcal > 20) kcal = undefined
  const name = typeof product.product_name === 'string' ? product.product_name.trim() : ''
  const brand = typeof product.brands === 'string' && product.brands ? product.brands.split(',')[0].trim() : null
  const servingG = num(product.serving_quantity) ?? null
  const servingLabel = typeof product.serving_size === 'string' ? product.serving_size : null
  // Optional: a product without them is still complete, with them unknown.
  const fibre = num(n.fiber_100g) ?? null
  const sugars = num(n.sugars_100g) ?? null
  const salt = num(n.salt_100g) ?? null

  if (name && kcal !== undefined && protein !== undefined && carbs !== undefined && fat !== undefined) {
    const now = nowIso()
    return {
      status: 'found',
      food: {
        id: newId(), createdAt: now, updatedAt: now, deletedAt: null, source: 'off', barcode, name, brand,
        kcal100g: kcal, protein100g: protein, carbs100g: carbs, fat100g: fat, servingG, servingLabel,
        fibre100g: fibre, sugars100g: sugars, salt100g: salt,
      },
      imageUrl: typeof product.image_front_small_url === 'string' ? product.image_front_small_url : null,
    }
  }
  const draft: Partial<Food> & { barcode: string } = { barcode }
  if (name) draft.name = name
  if (brand) draft.brand = brand
  if (kcal !== undefined) draft.kcal100g = kcal
  if (protein !== undefined) draft.protein100g = protein
  if (carbs !== undefined) draft.carbs100g = carbs
  if (fat !== undefined) draft.fat100g = fat
  if (servingG !== null) draft.servingG = servingG
  if (fibre !== null) draft.fibre100g = fibre
  if (sugars !== null) draft.sugars100g = sugars
  if (salt !== null) draft.salt100g = salt
  return { status: 'incomplete', draft }
}

export const LOOKUP_TIMEOUT_MS = 8000

export async function lookupBarcode(db: SqlExecutor, barcode: string, fetchFn: typeof fetch = fetch): Promise<BarcodeResult> {
  const cached = await db.all<Parameters<typeof toFood>[0]>(
    `SELECT * FROM foods WHERE barcode = ? AND deleted_at IS NULL ORDER BY CASE source WHEN 'user' THEN 0 ELSE 1 END LIMIT 1`,
    [barcode],
  )
  if (cached[0]) return { status: 'found', food: toFood(cached[0]) }

  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,nutriments,serving_quantity,serving_size,image_front_small_url&app_name=Tally&app_version=0.1`
  // A weak signal or captive portal can leave a request hanging for minutes; give up and let the user type it in.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchFn(url, { signal: controller.signal })
  } catch {
    return { status: 'offline', draft: { barcode } }
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 404) return { status: 'not_found', draft: { barcode } }
  if (!res.ok) return { status: 'offline', draft: { barcode } }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    return { status: 'offline', draft: { barcode } }
  }
  const result = mapOffProduct(json, barcode)
  if (result.status === 'found') {
    const f = result.food
    await db.run(
      `INSERT INTO foods (id, created_at, updated_at, source, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label,
                          fibre_100g, sugars_100g, salt_100g)
       VALUES (?,?,?,'off',?,?,?,?,?,?,?,?,?,?,?,?)`,
      [f.id, f.createdAt, f.updatedAt, barcode, f.name, f.brand, f.kcal100g, f.protein100g, f.carbs100g, f.fat100g, f.servingG, f.servingLabel,
        f.fibre100g ?? null, f.sugars100g ?? null, f.salt100g ?? null],
    )
    // In the background: the lookup has already answered, and a missing photo changes nothing.
    if (result.imageUrl) result.photo = saveProductPhoto(db, f.id, result.imageUrl, fetchFn).catch(() => {})
  }
  return result
}

const PHOTO_HOST = 'https://images.openfoodfacts.org/'
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 200_000

/** Downloads a product's small front photo from Open Food Facts once and keeps it on the device. Anything unexpected is skipped. */
export async function saveProductPhoto(db: SqlExecutor, foodId: string, url: string, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!url.startsWith(PHOTO_HOST)) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  let bytes: Uint8Array
  let type: string
  try {
    const res = await fetchFn(url, { signal: controller.signal })
    type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!res.ok || !PHOTO_TYPES.includes(type)) return
    bytes = new Uint8Array(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const now = nowIso()
  await db.run(
    'INSERT OR IGNORE INTO food_images (id, created_at, updated_at, food_id, source_url, data_url) VALUES (?,?,?,?,?,?)',
    [newId(), now, now, foodId, url, `data:${type};base64,${btoa(bin)}`],
  )
}
