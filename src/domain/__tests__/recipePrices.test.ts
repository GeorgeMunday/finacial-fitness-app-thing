import { beforeEach, describe, expect, it } from 'vitest'
import { chickenRice, price } from '../../../test/recipeHelpers'
import { freshDb } from '../../../test/renderApp'
import type { SqlExecutor } from '../../db/executor'
import { dayLogs } from '../food'
import { latestPrice, setIngredientPrice } from '../recipes/prices'
import { logRecipe, listRecipes, recipeCost, recipeNutrition } from '../recipes/recipes'

let db: SqlExecutor
beforeEach(async () => {
  db = await freshDb()
})

async function priced() {
  const r = await chickenRice(db)
  await price(db, r.chicken, 650, 1000) // £6.50 a kg → 400 g = 260p
  await price(db, r.rice, 160, 1000) //  £1.60 a kg → 200 g = 32p
  return r
}

describe('recipeCost', () => {
  it('is grams ÷ pack size × pack price, per portion and in total', async () => {
    const { id } = await priced()
    expect(await recipeCost(db, id)).toMatchObject({ totalPence: 292, perPortionPence: 73, complete: true, missing: [] })
  })
  it('protein per pound is protein per portion over cost per portion', async () => {
    const { id } = await priced()
    const [r] = await listRecipes(db)
    expect(r.id).toBe(id)
    expect(r.proteinPerPound).toBeCloseTo(23.5 / 0.73, 5)
  })
  it('an edited price changes cost but not nutrition or past logs', async () => {
    const { id, chicken } = await priced()
    await logRecipe(db, id, 1, 'dinner', '2026-10-12')
    await setIngredientPrice(db, chicken, 800, 1000)
    expect(await recipeCost(db, id)).toMatchObject({ totalPence: 352, perPortionPence: 88 })
    expect(await recipeNutrition(db, id)).toMatchObject({ kcal: 275, proteinG: 23.5 })
    expect((await dayLogs(db, '2026-10-12'))[0]).toMatchObject({ kcal: 275, proteinG: 23.5 })
  })
  it('a food with no price makes the cost incomplete and names it', async () => {
    const { id, chicken } = await chickenRice(db)
    await price(db, chicken, 650, 1000)
    expect(await recipeCost(db, id)).toMatchObject({ complete: false, missing: ['Rice'], totalPence: 260 })
  })
  it('an ingredient whose food is gone is reported rather than crashing', async () => {
    const { id, rice } = await priced()
    await db.run('DELETE FROM foods WHERE id = ?', [rice])
    const c = await recipeCost(db, id)
    expect(c.complete).toBe(false)
    expect(c.missing).toHaveLength(1)
  })
  it('reads "October 2026" for estimated prices and nothing once every price is the user\'s own', async () => {
    const { id, chicken, rice } = await chickenRice(db)
    await price(db, chicken, 650, 1000, 'estimate', '2026-10-01')
    await price(db, rice, 160, 1000, 'estimate', '2026-10-01')
    expect((await recipeCost(db, id)).estimatedMonth).toBe('October 2026')
    await setIngredientPrice(db, chicken, 700, 1000)
    expect((await recipeCost(db, id)).estimatedMonth).toBe('October 2026')
    await setIngredientPrice(db, rice, 170, 1000)
    expect((await recipeCost(db, id)).estimatedMonth).toBeNull()
  })
})

describe('prices', () => {
  it('the latest price wins and the older row is kept', async () => {
    const { chicken } = await chickenRice(db)
    await price(db, chicken, 650, 1000, 'estimate')
    await setIngredientPrice(db, chicken, 700, 900)
    expect(await latestPrice(db, chicken)).toMatchObject({ pricePence: 700, packG: 900, source: 'user' })
    expect(await db.all('SELECT id FROM product_prices WHERE food_id = ?', [chicken])).toHaveLength(2)
  })
  it('has no price until one is set', async () => {
    const { chicken } = await chickenRice(db)
    expect(await latestPrice(db, chicken)).toBeNull()
  })
  it('refuses a price or pack size that is not positive', async () => {
    const { chicken } = await chickenRice(db)
    await expect(setIngredientPrice(db, chicken, 0, 1000)).rejects.toThrow()
    await expect(setIngredientPrice(db, chicken, 100, 0)).rejects.toThrow()
    await expect(setIngredientPrice(db, chicken, 1.5, 1000)).rejects.toThrow()
  })
})
