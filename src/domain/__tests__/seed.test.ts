import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { loadSeed, searchFoods, seedAll, type SeedData, type SeedFood } from '../seed'

const data: SeedData = {
  cofid: [],
  programmes: [],
  recipes: null,
  starter: [
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
  it('seeds once, storing the starter list as starter (never cofid)', async () => {
    expect(await seedAll(db, data)).toEqual({ foods: 3, exercises: 2, programmes: 0, recipes: 0 })
    expect(await seedAll(db, data)).toEqual({ foods: 0, exercises: 0, programmes: 0, recipes: 0 })
    const sources = await db.all<{ source: string }>('SELECT DISTINCT source FROM foods')
    expect(sources).toEqual([{ source: 'starter' }])
  })
  it('adds real CoFID foods once they are bundled, even after the starter list', async () => {
    await seedAll(db, data)
    const cofid = [{ name: 'Porridge oats, raw', kcal_100g: 375, protein_100g: 11, carbs_100g: 66, fat_100g: 8 }]
    expect(await seedAll(db, { ...data, cofid })).toEqual({ foods: 1, exercises: 0, programmes: 0, recipes: 0 })
    expect(await db.all("SELECT * FROM foods WHERE source = 'cofid'")).toHaveLength(1)
  })
  it('concurrent seeding inserts once', async () => {
    await Promise.all([seedAll(db, data), seedAll(db, data)])
    expect(await db.all('SELECT * FROM foods')).toHaveLength(3)
  })
  it('adds new starter foods for someone who already seeded', async () => {
    await seedAll(db, data)
    const more = { ...data, starter: [...data.starter, { name: 'Chicken thigh fillet, raw', kcal_100g: 125, protein_100g: 19.5, carbs_100g: 0, fat_100g: 4.8 }] }
    expect((await seedAll(db, more)).foods).toBe(1)
    expect(await db.all('SELECT * FROM foods')).toHaveLength(4)
    expect((await seedAll(db, more)).foods).toBe(0)
  })
  it('adds new exercises by name and never changes or removes existing rows', async () => {
    await seedAll(db, data)
    await db.run("UPDATE foods SET kcal_100g = 1 WHERE name = 'Banana'")
    const more = { ...data, exercises: [...data.exercises, { name: 'Chin-Up', primary_muscle: 'lats', equipment: 'body only' }] }
    expect((await seedAll(db, more)).exercises).toBe(1)
    expect(await db.all("SELECT kcal_100g FROM foods WHERE name = 'Banana'")).toEqual([{ kcal_100g: 1 }])
    expect(await db.all('SELECT * FROM exercises')).toHaveLength(3)
  })
  it('searches by name and ranks recently logged foods first', async () => {
    await seedAll(db, data)
    expect((await searchFoods(db, 'oat')).map((f) => f.name)).toEqual(['Oatcakes', 'Oats, rolled'])
    const [oats] = await db.all<{ id: string }>("SELECT id FROM foods WHERE name = 'Oats, rolled'")
    await db.run(
      "INSERT INTO food_logs (id, created_at, updated_at, log_date, slot, food_id, grams, kcal) VALUES ('l1','x','x','2026-10-12','snack',?,30,132)",
      [oats.id],
    )
    expect((await searchFoods(db, 'oat'))[0].name).toBe('Oats, rolled')
  })
  it('ranks user, off, cofid, then starter foods and ignores deleted', async () => {
    await seedAll(db, data)
    const ins = (id: string, src: string, name: string, del: string | null = null) =>
      db.run(
        `INSERT INTO foods (id, created_at, updated_at, deleted_at, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
         VALUES (?, 'x', 'x', ?, ?, ?, 1, 1, 1, 1)`,
        [id, del, src, name],
      )
    await ins('u1', 'user', 'Banana bread')
    await ins('o1', 'off', 'Banana chips')
    await ins('c1', 'cofid', 'Bananas, raw')
    await ins('d1', 'user', 'Banana gone', 'x')
    expect((await searchFoods(db, 'banana')).map((f) => f.name)).toEqual(['Banana bread', 'Banana chips', 'Bananas, raw', 'Banana'])
  })
  it('loadSeed fetches the starter list and exercises, and CoFID when it exists', async () => {
    const files: Record<string, unknown> = { '/seed/starter.json': data.starter, '/seed/exercises.json': data.exercises }
    const fetchFn = (async (url: string) =>
      url in files ? { ok: true, status: 200, json: async () => files[url] } : { ok: false, status: 404, json: async () => null }) as unknown as typeof fetch
    expect(await loadSeed(fetchFn)).toEqual(data)
    files['/seed/programmes.json'] = [{ key: 'x' }]
    expect((await loadSeed(fetchFn)).programmes).toEqual([{ key: 'x' }])
    delete files['/seed/programmes.json']
    // SPA hosts often answer a missing file with index.html and a 200.
    const spaFetch = (async (url: string) =>
      url in files ? { ok: true, status: 200, json: async () => files[url] } : { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }) as unknown as typeof fetch
    expect((await loadSeed(spaFetch)).cofid).toEqual([])
    expect((await loadSeed(spaFetch)).programmes).toEqual([])
    expect((await loadSeed(spaFetch)).recipes).toBeNull()
    files['/seed/cofid.json'] = [data.starter[0]]
    expect((await loadSeed(fetchFn)).cofid).toHaveLength(1)
  })
})

describe('bundled starter list', () => {
  const starter = JSON.parse(readFileSync(resolve(process.cwd(), 'public/seed/starter.json'), 'utf8')) as SeedFood[]
  const NEW = [
    'Chicken thigh fillet, raw', 'Turkey mince, 5% fat, raw', 'Red lentils, dry', 'Chopped tomatoes, canned', 'Rice, dry',
    'Rice, microwave pouch', 'Pasta, dry', 'Cottage cheese', 'Egg, raw', 'Ham, cooked', 'Spinach, frozen', 'Potato, baking, raw',
    'Sweetcorn, canned', 'Frozen mixed berries', 'Peppers', 'Garlic', 'Mixed spices', 'Tikka curry paste', 'Soy sauce', 'Frozen mixed vegetables',
    'Tortilla wrap, plain', 'Frozen peas', 'Egg noodles, dried',
  ]
  it('has the recipe ingredients with plausible values', () => {
    for (const n of NEW) {
      const f = starter.find((x) => x.name === n)
      expect(f, n).toBeTruthy()
      const kcal = 4 * f!.protein_100g + 4 * f!.carbs_100g + 9 * f!.fat_100g
      expect(f!.kcal_100g, n).toBeGreaterThan(0)
      expect(Math.abs(kcal - f!.kcal_100g) / f!.kcal_100g, n).toBeLessThan(0.25)
    }
  })
  it('has unique names', () => {
    const names = starter.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
