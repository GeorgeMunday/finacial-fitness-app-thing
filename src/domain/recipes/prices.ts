import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import { localDate } from '../dates'

export type Price = { pricePence: number; packG: number; source: 'estimate' | 'user'; logDate: string }

/** The newest price row for a food (the one added last wins, so an edit always beats an estimate). */
export async function latestPrice(db: SqlExecutor, foodId: string): Promise<Price | null> {
  const [r] = await db.all<{ price_pence: number; pack_g: number | null; source: 'estimate' | 'user'; log_date: string }>(
    'SELECT price_pence, pack_g, source, log_date FROM product_prices WHERE food_id = ? AND deleted_at IS NULL AND pack_g IS NOT NULL ORDER BY rowid DESC LIMIT 1',
    [foodId],
  )
  return r ? { pricePence: r.price_pence, packG: r.pack_g!, source: r.source, logDate: r.log_date } : null
}

/** Records the user's own price for a pack of this food. Older rows are kept; recipes use the newest. */
export async function setIngredientPrice(db: SqlExecutor, foodId: string, pricePence: number, packG: number): Promise<void> {
  if (!Number.isInteger(pricePence) || pricePence <= 0) throw new Error('A price must be a whole number of pence above 0')
  if (!(packG > 0)) throw new Error('A pack size must be more than 0 g')
  const now = nowIso()
  await db.run(
    `INSERT INTO product_prices (id, created_at, updated_at, food_id, price_pence, pack_g, shop, log_date, source) VALUES (?,?,?,?,?,?,NULL,?,'user')`,
    [newId(), now, now, foodId, pricePence, packG, localDate()],
  )
}

/** "October 2026" from a YYYY-MM-DD date. */
export function monthYear(logDate: string): string {
  return new Date(`${logDate}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
