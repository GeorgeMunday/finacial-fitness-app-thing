import type { SqlExecutor } from '../db/executor'

/** Only raster image data URLs are ever put in an <img>, whatever a restored backup contains. */
export function safePhoto(dataUrl: string | null | undefined): string | null {
  return dataUrl && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) ? dataUrl : null
}

/** Saved photos for these foods, by food id; foods without one are left out. */
export async function foodPhotos(db: SqlExecutor, foodIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!foodIds.length) return out
  const rows = await db.all<{ food_id: string; data_url: string }>(
    `SELECT food_id, data_url FROM food_images WHERE deleted_at IS NULL AND food_id IN (${foodIds.map(() => '?').join(',')})`,
    foodIds,
  )
  for (const r of rows) {
    const safe = safePhoto(r.data_url)
    if (safe) out.set(r.food_id, safe)
  }
  return out
}
