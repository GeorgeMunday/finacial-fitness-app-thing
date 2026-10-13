import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { lookupBarcode, mapOffProduct } from '../openFoodFacts'

const full = {
  status: 1,
  product: {
    product_name: 'Crunchy Oat Granola', brands: 'Acme', serving_quantity: 40, serving_size: '40 g',
    nutriments: { 'energy-kcal_100g': 450, proteins_100g: 9.5, carbohydrates_100g: 62, fat_100g: 17 },
  },
}
const ok = (json: unknown, status = 200) => vi.fn(async () => ({ ok: status < 400, status, json: async () => json }) as Response)

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
})

describe('mapOffProduct', () => {
  it('maps a complete product', () => {
    const r = mapOffProduct(full, '123')
    expect(r.status).toBe('found')
    if (r.status === 'found') expect(r.food).toMatchObject({ name: 'Crunchy Oat Granola', brand: 'Acme', kcal100g: 450, protein100g: 9.5, servingG: 40, barcode: '123', source: 'off' })
  })
  it('converts kJ when kcal is missing', () => {
    const j = { status: 1, product: { product_name: 'X', nutriments: { 'energy-kj_100g': 1000, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } } }
    const r = mapOffProduct(j, '1')
    expect(r.status === 'found' && r.food.kcal100g).toBe(239)
  })
  it('is incomplete when a nutrient is missing, never a zero-kcal food', () => {
    const j = { status: 1, product: { product_name: 'Mystery', nutriments: { 'energy-kcal_100g': 100, carbohydrates_100g: 5, fat_100g: 1 } } }
    const r = mapOffProduct(j, '9')
    expect(r.status).toBe('incomplete')
    if (r.status === 'incomplete') expect(r.draft).toMatchObject({ barcode: '9', name: 'Mystery', kcal100g: 100 })
  })
  it('treats blank-string nutrients as missing, never as 0', () => {
    const j = { status: 1, product: { product_name: 'Blank', nutriments: { 'energy-kcal_100g': '', proteins_100g: '', carbohydrates_100g: '', fat_100g: '' } } }
    const r = mapOffProduct(j, '7')
    expect(r.status).toBe('incomplete')
    if (r.status === 'incomplete') expect(r.draft.kcal100g).toBeUndefined()
  })
  it('treats 0 kcal with real macros as incomplete', () => {
    const j = { status: 1, product: { product_name: 'Odd', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 20 } } }
    const r = mapOffProduct(j, '8')
    expect(r.status).toBe('incomplete')
    if (r.status === 'incomplete') expect(r.draft.kcal100g).toBeUndefined()
  })
  it('keeps genuine zero-calorie products such as water', () => {
    const j = { status: 1, product: { product_name: 'Still water', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 } } }
    expect(mapOffProduct(j, '9').status).toBe('found')
  })
  it('is not_found for status 0 or no product', () => {
    expect(mapOffProduct({ status: 0 }, '5')).toEqual({ status: 'not_found', draft: { barcode: '5' } })
    expect(mapOffProduct(null, '5').status).toBe('not_found')
  })
})

describe('lookupBarcode', () => {
  it('fetches, flags the app, and caches', async () => {
    const f = ok(full)
    const r = await lookupBarcode(db, '123', f)
    expect(r.status).toBe('found')
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url).toContain('world.openfoodfacts.org/api/v2/product/123.json')
    expect(url).toContain('app_name=Tally')
    expect(url).toContain('app_version=0.1')
    const again = await lookupBarcode(db, '123', f)
    expect(again.status).toBe('found')
    expect(f).toHaveBeenCalledTimes(1)
    expect(await db.all("SELECT * FROM foods WHERE source = 'off'")).toHaveLength(1)
  })
  it('returns offline on network or CORS failure', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await lookupBarcode(db, '1', f as unknown as typeof fetch)).toEqual({ status: 'offline', draft: { barcode: '1' } })
  })
  it('returns not_found on 404 and offline on server errors', async () => {
    expect((await lookupBarcode(db, '1', ok({ status: 0 }, 404))).status).toBe('not_found')
    expect((await lookupBarcode(db, '2', ok({}, 503))).status).toBe('offline')
  })
  it('gives up after a timeout and reports offline', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      }))
      const p = lookupBarcode(db, '42', f as unknown as typeof fetch)
      await vi.advanceTimersByTimeAsync(8001)
      expect(await p).toEqual({ status: 'offline', draft: { barcode: '42' } })
    } finally {
      vi.useRealTimers()
    }
  })
  it('does not cache incomplete products', async () => {
    await lookupBarcode(db, '9', ok({ status: 1, product: { product_name: 'M', nutriments: {} } }))
    expect(await db.all('SELECT * FROM foods')).toHaveLength(0)
  })
})
