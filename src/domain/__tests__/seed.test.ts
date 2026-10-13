import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { loadSeed, searchFoods, seedIfEmpty, type SeedData } from '../seed'

const data: SeedData = {
  foods: [
    { name: 'Oats, rolled', kcal_100g: 372, protein_100g: 11, carbs_100g: 60, fat_100g: 8 },
    { name: 'Banana', kcal_100g: 95, protein_100g: 1.2, carbs_100g: 23, fat_100g: 0.3 },
    { name: 'Oatcakes', kcal_100g: 440, protein_100g: 10, carbs_100g: 58, fat_100g: 18 },
  ],
  exercises: [
    { name: 'Barbell Bench Press', primary_muscle: 'chest', equipment: 'barbell' },
    { name: 'Pull-up', primary_muscle: 'lats', equipment: 'body only' },
  ],
}

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
})

describe('seed', () => {
  it('seeds once', async () => {
    expect(await seedIfEmpty(db, data)).toEqual({ foods: 3, exercises: 2 })
    expect(await seedIfEmpty(db, data)).toEqual({ foods: 0, exercises: 0 })
  })
  it('searches by name and ranks recently logged foods first', async () => {
    await seedIfEmpty(db, data)
    expect((await searchFoods(db, 'oat')).map((f) => f.name)).toEqual(['Oatcakes', 'Oats, rolled'])
    const [oats] = await db.all<{ id: string }>("SELECT id FROM foods WHERE name = 'Oats, rolled'")
    await db.run(
      "INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, food_id, grams, kcal) VALUES ('l1','x','x','2026-10-12','snack',?,30,132)",
      [oats.id],
    )
    expect((await searchFoods(db, 'oat'))[0].name).toBe('Oats, rolled')
  })
  it('ranks user foods before off before cofid and ignores deleted', async () => {
    await seedIfEmpty(db, data)
    const ins = (id: string, src: string, name: string, del: string | null = null) =>
      db.run(
        `INSERT INTO foods (id, created_at, updated_at, deleted_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
         VALUES (?, 'x', 'x', ?, ?, ?, 1, 1, 1, 1)`,
        [id, del, src, name],
      )
    await ins('u1', 'user', 'Banana bread')
    await ins('o1', 'off', 'Banana chips')
    await ins('d1', 'user', 'Banana gone', 'x')
    expect((await searchFoods(db, 'banana')).map((f) => f.name)).toEqual(['Banana bread', 'Banana chips', 'Banana'])
  })
  it('loadSeed fetches both files', async () => {
    const fetchFn = (async (url: string) => ({ ok: true, json: async () => (url.includes('cofid') ? data.foods : data.exercises) })) as unknown as typeof fetch
    expect(await loadSeed(fetchFn)).toEqual(data)
  })
})
