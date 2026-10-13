import { beforeEach, describe, expect, it } from 'vitest'
import { chickenRice, food } from '../../../test/recipeHelpers'
import { freshDb } from '../../../test/renderApp'
import type { SqlExecutor } from '../../db/executor'
import { dayLogs, dayLogsNamed } from '../food'
import { copyRecipe, createRecipe, deleteRecipe, getRecipe, listRecipes, logRecipe, recipeNutrition, restoreRecipe, updateRecipe } from '../recipes/recipes'

let db: SqlExecutor
beforeEach(async () => {
  db = await freshDb()
})
const DAY = '2026-10-12'

describe('recipeNutrition', () => {
  it('divides the ingredients by the number of portions', async () => {
    const { id } = await chickenRice(db)
    // (4 × 100 + 2 × 350) kcal / 4, (4 × 20 + 2 × 7) g protein / 4
    expect(await recipeNutrition(db, id)).toEqual({ kcal: 275, proteinG: 23.5, carbsG: 39, fatG: 2.5 })
  })
  it('changes with the number of portions', async () => {
    const { id } = await chickenRice(db, { servings: 2 })
    expect((await recipeNutrition(db, id)).proteinG).toBe(47)
  })
  it('is computed from the foods, so editing a food changes it', async () => {
    const { id, chicken } = await chickenRice(db)
    await db.run('UPDATE foods SET protein_100g = 30 WHERE id = ?', [chicken])
    expect((await recipeNutrition(db, id)).proteinG).toBe(33.5)
  })
  it('skips an ingredient whose food is gone, without crashing', async () => {
    const { id, rice } = await chickenRice(db)
    await db.run('DELETE FROM foods WHERE id = ?', [rice])
    expect(await recipeNutrition(db, id)).toMatchObject({ kcal: 100, proteinG: 20 })
    expect((await getRecipe(db, id))!.items).toHaveLength(2)
  })
  it('throws for a recipe that does not exist', async () => {
    await expect(recipeNutrition(db, 'nope')).rejects.toThrow('Recipe not found')
  })
})

describe('logRecipe', () => {
  it('writes one food log with the per-portion snapshot, linked to the recipe', async () => {
    const { id } = await chickenRice(db)
    await logRecipe(db, id, 1, 'dinner', DAY)
    const logs = await dayLogs(db, DAY)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ slot: 'dinner', kcal: 275, proteinG: 23.5, recipeId: id, portions: 1, foodId: null, grams: null })
  })
  it('logging 2 portions doubles the snapshot', async () => {
    const { id } = await chickenRice(db)
    await logRecipe(db, id, 1, 'lunch', DAY)
    await logRecipe(db, id, 2, 'lunch', '2026-10-13')
    const [one] = await dayLogs(db, DAY)
    const [two] = await dayLogs(db, '2026-10-13')
    expect(two).toMatchObject({ kcal: one.kcal * 2, proteinG: one.proteinG * 2, carbsG: one.carbsG * 2, fatG: one.fatG * 2, portions: 2 })
  })
  it('half a portion works; a quarter is refused', async () => {
    const { id } = await chickenRice(db)
    await logRecipe(db, id, 0.5, 'snack', DAY)
    expect((await dayLogs(db, DAY))[0]).toMatchObject({ kcal: 138, proteinG: 11.8, portions: 0.5 })
    await expect(logRecipe(db, id, 0.25, 'snack', DAY)).rejects.toThrow('Portions must be 0.5 or more')
    await expect(logRecipe(db, id, Number.NaN, 'snack', DAY)).rejects.toThrow()
  })
  it('past logs never change when the recipe, a food or the portions change', async () => {
    const { id, chicken } = await chickenRice(db)
    await logRecipe(db, id, 1, 'dinner', DAY)
    await db.run('UPDATE foods SET kcal_100g = 999, protein_100g = 99 WHERE id = ?', [chicken])
    await updateRecipe(db, id, { name: 'Changed', description: null, servings: 2, prepMinutes: 1, cookMinutes: 1, steps: [], tags: [], fridgeDays: null, items: [{ foodId: chicken, grams: 10 }] })
    expect((await dayLogs(db, DAY))[0]).toMatchObject({ kcal: 275, proteinG: 23.5 })
  })
  it('refuses a recipe that is not there', async () => {
    await expect(logRecipe(db, 'nope', 1, 'lunch', DAY)).rejects.toThrow('Recipe not found')
  })
  it('names the log after the recipe and the number of portions', async () => {
    const { id } = await chickenRice(db)
    await logRecipe(db, id, 2, 'dinner', DAY)
    await logRecipe(db, id, 1, 'dinner', DAY)
    expect((await dayLogsNamed(db, DAY)).map((l) => l.name)).toEqual(['Chicken and rice, 2 portions', 'Chicken and rice, 1 portion'])
  })
})

describe('creating and editing recipes', () => {
  const base = { description: null, prepMinutes: null, cookMinutes: null, steps: [], tags: [], fridgeDays: null }
  it('refuses 0 servings, no ingredients, a blank name and non-positive grams', async () => {
    const f = await food(db, 'Egg', 143, 12.5)
    await expect(createRecipe(db, { ...base, name: 'x', servings: 0, items: [{ foodId: f, grams: 10 }] })).rejects.toThrow()
    await expect(createRecipe(db, { ...base, name: 'x', servings: 1, items: [] })).rejects.toThrow()
    await expect(createRecipe(db, { ...base, name: '  ', servings: 1, items: [{ foodId: f, grams: 10 }] })).rejects.toThrow()
    await expect(createRecipe(db, { ...base, name: 'x', servings: 1, items: [{ foodId: f, grams: 0 }] })).rejects.toThrow()
  })
  it('stores steps, tags and times and reads them back in order', async () => {
    const { id } = await chickenRice(db)
    expect(await getRecipe(db, id)).toMatchObject({
      name: 'Chicken and rice', servings: 4, prepMinutes: 10, cookMinutes: 30, steps: ['Cook the rice.', 'Fry the chicken.'],
      tags: ['batch', 'dinner'], fridgeDays: 3, source: 'user', key: null,
      items: [{ name: 'Chicken', grams: 400 }, { name: 'Rice', grams: 200 }],
    })
  })
  it('copyRecipe makes a user copy with the same ingredients and leaves the original alone', async () => {
    const { id } = await chickenRice(db)
    await db.run("UPDATE meals SET source = 'tally', key = 'orig' WHERE id = ?", [id])
    const copy = await copyRecipe(db, id)
    const c = (await getRecipe(db, copy))!
    expect(c).toMatchObject({ name: 'Chicken and rice (mine)', source: 'user', key: null, servings: 4, steps: ['Cook the rice.', 'Fry the chicken.'] })
    expect(c.items.map((i) => i.grams)).toEqual([400, 200])
    expect(await getRecipe(db, id)).toMatchObject({ name: 'Chicken and rice', source: 'tally', key: 'orig' })
  })
  it('updateRecipe and deleteRecipe refuse a Tally recipe', async () => {
    const { id, chicken } = await chickenRice(db)
    await db.run("UPDATE meals SET source = 'tally' WHERE id = ?", [id])
    await expect(updateRecipe(db, id, { ...base, name: 'x', servings: 1, items: [{ foodId: chicken, grams: 1 }] })).rejects.toThrow()
    await expect(deleteRecipe(db, id)).rejects.toThrow()
  })
  it('updateRecipe replaces the ingredients, and deleteRecipe can be undone', async () => {
    const { id, chicken } = await chickenRice(db)
    await updateRecipe(db, id, { ...base, name: 'Just chicken', servings: 2, items: [{ foodId: chicken, grams: 200 }] })
    expect(await getRecipe(db, id)).toMatchObject({ name: 'Just chicken', servings: 2, items: [{ name: 'Chicken', grams: 200 }] })
    await deleteRecipe(db, id)
    expect(await getRecipe(db, id)).toBeNull()
    await restoreRecipe(db, id)
    expect(await getRecipe(db, id)).not.toBeNull()
  })
  it('plain meals are not recipes', async () => {
    await db.run("INSERT INTO meals (id, created_at, updated_at, name) VALUES ('m','x','x','Old meal')")
    expect(await getRecipe(db, 'm')).toBeNull()
    expect(await listRecipes(db)).toEqual([])
  })
})

describe('listRecipes', () => {
  it('filters by tag and source and carries nutrition and cost', async () => {
    const a = await chickenRice(db, { name: 'A', tags: ['batch', 'dinner'] })
    await chickenRice(db, { name: 'B', tags: ['quick', 'lunch'] })
    await db.run("UPDATE meals SET source = 'tally' WHERE id = ?", [a.id])
    expect((await listRecipes(db)).map((r) => r.name).sort()).toEqual(['A', 'B'])
    expect((await listRecipes(db, { tag: 'quick' })).map((r) => r.name)).toEqual(['B'])
    expect((await listRecipes(db, { source: 'tally' })).map((r) => r.name)).toEqual(['A'])
    const [first] = await listRecipes(db, { tag: 'batch' })
    expect(first.nutrition.proteinG).toBe(23.5)
    expect(first.cost.complete).toBe(false)
    expect(first.proteinPerPound).toBeNull()
  })
})
