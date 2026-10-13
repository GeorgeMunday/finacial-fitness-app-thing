import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { food } from '../../../test/recipeHelpers'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { dayLogs, logFood } from '../../domain/food'
import { getRecipe, listRecipes, recipeCost } from '../../domain/recipes/recipes'
import { seedAll } from '../../domain/seed'
import Food from '../Food'

const BANNED = /\b(clean|guilt[- ]free|cheat|junk|sinful|naughty)\b/i
const app = () => (
  <Routes>
    <Route path="/food/*" element={<Food />} />
  </Routes>
)

async function setup(extra: Record<string, unknown> = {}) {
  const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, ...extra })
  await seedAll(db, realSeed())
  return db
}
const byKey = async (db: Awaited<ReturnType<typeof setup>>, key: string) => {
  const [m] = await db.all<{ id: string }>('SELECT id FROM meals WHERE key = ?', [key])
  return m.id
}
const names = () => within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('listitem').map((li) => li.querySelector('a > span')!.textContent!)

describe('recipe list', () => {
  it('shows 12 recipes and filters by Quick and Breakfast', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/recipes')
    expect(await within(await screen.findByRole('list', { name: 'Recipes' })).findAllByRole('listitem')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'Quick' }))
    expect(within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Breakfast' }))
    expect(within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Batch' }))
    expect(within(screen.getByRole('list', { name: 'Recipes' })).getAllByRole('listitem')).toHaveLength(8)
  })
  it('sorts by cost, protein and time', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/recipes')
    await screen.findByRole('list', { name: 'Recipes' })
    await user.click(screen.getByRole('button', { name: 'Cost' }))
    expect(names()[0]).toBe('Scrambled eggs and beans on toast')
    await user.click(screen.getByRole('button', { name: 'Protein' }))
    expect(names()[0]).toBe('Turkey meatballs in tomato sauce')
    await user.click(screen.getByRole('button', { name: 'Time' }))
    expect(names()[0]).toBe('Greek yoghurt protein pot')
  })
  it('shows protein, cost and time on each row, with the price note once', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes')
    const row = (await screen.findByRole('link', { name: /Chicken thigh, rice and pepper traybake/ })).closest('li')!
    expect(row).toHaveTextContent('41.4 g protein')
    expect(row).toHaveTextContent('£1.71 a portion')
    expect(row).toHaveTextContent('55 min')
    expect(screen.getAllByText('Prices estimated October 2026')).toHaveLength(1)
  })
  it('hide calorie numbers removes every kcal figure from the list and the detail page', async () => {
    const db = await setup({ hideCalories: true })
    renderApp(app(), db, '/food/recipes')
    await screen.findByRole('list', { name: 'Recipes' })
    expect(document.body.textContent).not.toMatch(/kcal/i)
  })
  it('shows kcal when calories are not hidden', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes')
    await screen.findByRole('list', { name: 'Recipes' })
    expect(document.body.textContent).toMatch(/571 kcal/)
  })
  it('links to Plan my week and New recipe', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes')
    expect(await screen.findByRole('link', { name: 'Plan my week' })).toHaveAttribute('href', '/food/plan')
    expect(screen.getByRole('link', { name: 'New recipe' })).toHaveAttribute('href', '/food/recipes/new')
  })
})

describe('recipe page', () => {
  it('shows ingredients in grams, numbered steps, times, nutrition and cost', async () => {
    const db = await setup()
    renderApp(app(), db, `/food/recipes/${await byKey(db, 'chicken-rice-pepper-traybake')}`)
    expect(await screen.findByRole('heading', { name: 'Chicken thigh, rice and pepper traybake' })).toBeInTheDocument()
    expect(screen.getByText('700 g Chicken thigh fillet, raw')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/Serves 4/)).toBeInTheDocument()
    expect(screen.getByText(/Prep 15 min/)).toBeInTheDocument()
    expect(screen.getByText(/Keeps 3 days in the fridge/)).toBeInTheDocument()
    expect(screen.getByText(/41\.4 g protein/)).toBeInTheDocument()
    expect(screen.getByText(/£1\.71 a portion/)).toBeInTheDocument()
    expect(screen.getByText(/24 g protein per £1/)).toBeInTheDocument()
  })
  it('Log a portion writes a recipe log with the snapshot, in the recipe\'s meal, and Undo removes it', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/food/recipes/${await byKey(db, 'chicken-rice-pepper-traybake')}`)
    await user.click(await screen.findByRole('button', { name: 'Log a portion' }))
    expect(await screen.findByText('Logged Chicken thigh, rice and pepper traybake')).toBeInTheDocument()
    const logs = await dayLogs(db, localDate())
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ slot: 'dinner', portions: 1, proteinG: 41.4, foodId: null })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await dayLogs(db, localDate())).toHaveLength(0))
  })
  it('logging 2 portions doubles it', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/food/recipes/${await byKey(db, 'chicken-rice-pepper-traybake')}`)
    await user.click(await screen.findByRole('button', { name: 'More portions' }))
    await user.click(screen.getByRole('button', { name: 'More portions' }))
    await user.click(screen.getByRole('button', { name: 'Log 2 portions' }))
    await waitFor(async () => expect((await dayLogs(db, localDate()))[0]).toMatchObject({ portions: 2, proteinG: 82.8 }))
  })
  it('Copy and edit makes my copy and opens it for editing; the original stays', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const id = await byKey(db, 'tuna-pasta-bake')
    renderApp(app(), db, `/food/recipes/${id}`)
    await user.click(await screen.findByRole('button', { name: 'Copy and edit' }))
    expect(await screen.findByRole('heading', { name: 'Edit recipe' })).toBeInTheDocument()
    expect(screen.getByLabelText('Recipe name')).toHaveValue('Tuna pasta bake (mine)')
    expect(await listRecipes(db, { source: 'user' })).toHaveLength(1)
    expect((await getRecipe(db, id))!.name).toBe('Tuna pasta bake')
  })
  it('Save as my recipe adds it to Mine', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, `/food/recipes/${await byKey(db, 'tuna-pasta-bake')}`)
    await user.click(await screen.findByRole('button', { name: 'Save as my recipe' }))
    expect(await screen.findByText('Saved to your recipes')).toBeInTheDocument()
    expect((await listRecipes(db, { source: 'user' })).map((r) => r.name)).toEqual(['Tuna pasta bake (mine)'])
  })
  it('Mine lists my recipes', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const { copyRecipe } = await import('../../domain/recipes/recipes')
    await copyRecipe(db, await byKey(db, 'tuna-pasta-bake'))
    renderApp(app(), db, '/food/recipes')
    await screen.findByRole('list', { name: 'Recipes' })
    await user.click(screen.getByRole('button', { name: 'Mine' }))
    expect(names()).toEqual(['Tuna pasta bake (mine)'])
  })
  it('editing a price changes the cost shown but not what was logged', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const id = await byKey(db, 'chicken-rice-pepper-traybake')
    renderApp(app(), db, `/food/recipes/${id}`)
    await user.click(await screen.findByRole('button', { name: 'Log a portion' }))
    await user.click(screen.getByRole('button', { name: 'Edit prices' }))
    const price = await screen.findByLabelText('Chicken thigh fillet, raw price (£)')
    fireEvent.change(price, { target: { value: '9.00' } })
    await user.click(screen.getByRole('button', { name: 'Save prices' }))
    expect(await screen.findByText(/£2\.15 a portion/)).toBeInTheDocument()
    expect((await dayLogs(db, localDate()))[0]).toMatchObject({ proteinG: 41.4 })
    expect((await recipeCost(db, id)).perPortionPence).toBe(215)
    expect(screen.queryByText('Prices estimated October 2026')).not.toBeNull()
  })
  it('a recipe with an unpriced ingredient says the cost is incomplete and names it', async () => {
    const db = await setup()
    const id = await byKey(db, 'tuna-pasta-bake')
    await db.run("DELETE FROM product_prices WHERE food_id = (SELECT id FROM foods WHERE name = 'Pasta, dry')")
    renderApp(app(), db, `/food/recipes/${id}`)
    expect(await screen.findByText(/Cost is incomplete. Add a price for Pasta, dry./)).toBeInTheDocument()
  })
  it('Tally recipes cannot be edited or deleted; my own can, and delete has Undo', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const { copyRecipe } = await import('../../domain/recipes/recipes')
    const tallyId = await byKey(db, 'tuna-pasta-bake')
    const mine = await copyRecipe(db, tallyId)
    const view = renderApp(app(), db, `/food/recipes/${tallyId}`)
    await screen.findByRole('heading', { name: 'Tuna pasta bake' })
    expect(screen.queryByRole('button', { name: 'Delete recipe' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit recipe' })).toBeNull()
    view.unmount()
    renderApp(app(), db, `/food/recipes/${mine}`)
    await user.click(await screen.findByRole('button', { name: 'Delete recipe' }))
    expect(await screen.findByText('Recipe deleted')).toBeInTheDocument()
    expect(await getRecipe(db, mine)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await getRecipe(db, mine)).not.toBeNull())
  })
  it('uses none of the banned words', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes')
    await screen.findByRole('list', { name: 'Recipes' })
    expect(document.body.textContent).not.toMatch(BANNED)
  })
  it('a missing recipe says so', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes/nope')
    expect(await screen.findByText("That recipe couldn't be found.")).toBeInTheDocument()
  })
})

describe('my own recipes', () => {
  it('creates one from recently logged foods and shows its nutrition per portion', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const a = await food(db, 'Test chicken', 100, 20, 0, 2)
    const b = await food(db, 'Test rice', 350, 7, 78, 1)
    await logFood(db, { foodId: a, grams: 100, slot: 'lunch' })
    await logFood(db, { foodId: b, grams: 100, slot: 'lunch' })
    renderApp(app(), db, '/food/recipes/new')
    await user.type(await screen.findByLabelText('Recipe name'), 'My bowl')
    fireEvent.change(screen.getByLabelText('Portions'), { target: { value: '2' } })
    await user.click(await screen.findByRole('button', { name: 'Add Test chicken' }))
    await user.click(screen.getByRole('button', { name: 'Add Test rice' }))
    fireEvent.change(screen.getByLabelText('Test chicken (g)'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('Test rice (g)'), { target: { value: '200' } })
    await user.type(screen.getByLabelText('Steps (one per line)'), 'Cook it.{Enter}Eat it.')
    await user.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(await screen.findByRole('heading', { name: 'My bowl' })).toBeInTheDocument()
    expect(screen.getByText(/47 g protein/)).toBeInTheDocument() // (4 × 20 + 2 × 7) / 2
    expect(screen.getByText('400 g Test chicken')).toBeInTheDocument()
    expect((await listRecipes(db, { source: 'user' }))[0].steps).toEqual(['Cook it.', 'Eat it.'])
  })
  it('says what to fix before saving', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/recipes/new')
    expect(await screen.findByRole('button', { name: 'Save recipe' })).toBeDisabled()
    expect(screen.getByText('Add a name, at least one ingredient and 1 or more portions.')).toBeInTheDocument()
  })
  it('searches foods to add', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/recipes/new')
    await user.type(await screen.findByLabelText('Search foods'), 'Egg, raw')
    await user.click(await screen.findByRole('button', { name: 'Add Egg, raw' }))
    expect(screen.getByLabelText('Egg, raw (g)')).toBeInTheDocument()
  })
  it('editing my recipe saves the changes', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const { copyRecipe } = await import('../../domain/recipes/recipes')
    const mine = await copyRecipe(db, await byKey(db, 'tuna-pasta-bake'))
    renderApp(app(), db, `/food/recipes/${mine}/edit`)
    const name = await screen.findByLabelText('Recipe name')
    await user.clear(name)
    await user.type(name, 'Renamed bake')
    await user.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(await screen.findByRole('heading', { name: 'Renamed bake' })).toBeInTheDocument()
  })
  it('Tally recipes are not editable', async () => {
    const db = await setup()
    renderApp(app(), db, `/food/recipes/${await byKey(db, 'tuna-pasta-bake')}/edit`)
    expect(await screen.findByText(/can't be changed/)).toBeInTheDocument()
  })
})
