import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { formatPence } from '../../domain/money'
import { weekShoppingList } from '../../domain/recipes/shopping'
import { seedAll } from '../../domain/seed'
import Food from '../Food'
import Money from '../Money'

const app = () => (
  <Routes>
    <Route path="/food/*" element={<Food />} />
    <Route path="/money/*" element={<Money />} />
  </Routes>
)
async function setup(extra: Record<string, unknown> = {}) {
  const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, ...extra })
  await seedAll(db, realSeed())
  return db
}
const idOf = async (db: Awaited<ReturnType<typeof setup>>, key: string) => (await db.all<{ id: string }>('SELECT id FROM meals WHERE key = ?', [key]))[0].id
const more = (name: string) => screen.getByRole('button', { name: `More portions of ${name}` })
const fewer = (name: string) => screen.getByRole('button', { name: `Fewer portions of ${name}` })
const CHILLI = 'Turkey mince chilli with kidney beans'
const MEATBALLS = 'Turkey meatballs in tomato sauce'
const list = () => within(screen.getByRole('list', { name: 'Shopping list' }))

async function pick(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('list', { name: 'Recipes to plan' })
  await user.click(more(CHILLI))
  await user.click(more(CHILLI))
  await user.click(more(MEATBALLS))
  await user.click(more(MEATBALLS))
}

describe('Plan my week', () => {
  it('merges a shared ingredient across recipes into one line with the summed grams', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await pick(user)
    expect(list().getAllByText(/Turkey mince, 5% fat, raw/)).toHaveLength(1)
    expect(list().getByText('550 g Turkey mince, 5% fat, raw')).toBeInTheDocument() // 2 × 125 + 2 × 150
    expect(list().getByText('800 g Chopped tomatoes, canned')).toBeInTheDocument() // 2 × 200 + 2 × 200
  })
  it('the estimated total is the sum of the line costs, and says it is by weight', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await pick(user)
    const expected = (await weekShoppingList(db, [{ recipeId: await idOf(db, 'turkey-chilli-kidney-beans'), portions: 2 }, { recipeId: await idOf(db, 'turkey-meatballs-tomato-sauce'), portions: 2 }])).totalPence
    expect(await screen.findByText(`Estimated total ${formatPence(expected)}`)).toBeInTheDocument()
    expect(screen.getByText(/by weight/)).toBeInTheDocument()
    expect(screen.getByText('Prices estimated October 2026')).toBeInTheDocument()
  })
  it('setting a recipe back to 0 removes its ingredients', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await screen.findByRole('list', { name: 'Recipes to plan' })
    await user.click(more(CHILLI))
    expect(await screen.findByText(/Kidney beans, canned/)).toBeInTheDocument()
    await user.click(fewer(CHILLI))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Shopping list' })).toBeNull())
  })
  it('with nothing picked it invites picking and Add as expense is disabled', async () => {
    const db = await setup()
    renderApp(app(), db, '/food/plan')
    expect(await screen.findByText(/Pick the recipes you'll eat this week/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add as expense' })).toBeDisabled()
  })
  it('Add as expense opens the add screen with the total and Groceries filled in; saving creates that expense', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await pick(user)
    const expected = (await weekShoppingList(db, [{ recipeId: await idOf(db, 'turkey-chilli-kidney-beans'), portions: 2 }, { recipeId: await idOf(db, 'turkey-meatballs-tomato-sauce'), portions: 2 }])).totalPence
    await screen.findByText(`Estimated total ${formatPence(expected)}`)
    await user.click(screen.getByRole('button', { name: 'Add as expense' }))
    expect(await screen.findByLabelText('Amount')).toHaveValue((expected / 100).toFixed(2))
    expect(screen.getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(async () => expect(await db.all('SELECT amount_pence, category_id, kind FROM transactions')).toEqual([{ amount_pence: expected, category_id: 'cat-groceries', kind: 'expense' }]))
  })
  it('the user can edit the prefilled amount before saving', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense&amount=12.30&category=cat-groceries')
    const amount = await screen.findByLabelText('Amount')
    expect(amount).toHaveValue('12.30')
    await user.clear(amount)
    await user.type(amount, '15')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(async () => expect(await db.all('SELECT amount_pence FROM transactions')).toEqual([{ amount_pence: 1500 }]))
  })
  it('ignores an invalid amount or category in the address', async () => {
    const db = await setup()
    renderApp(app(), db, '/money/add?kind=expense&amount=abc&category=cat-nope')
    expect(await screen.findByLabelText('Amount')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Groceries', pressed: true })).toBeNull()
  })
  it('a missing price shows the list as incomplete and names the ingredient', async () => {
    const db = await setup()
    const user = userEvent.setup()
    await db.run("DELETE FROM product_prices WHERE food_id = (SELECT id FROM foods WHERE name = 'Pasta, dry')")
    renderApp(app(), db, '/food/plan')
    await screen.findByRole('list', { name: 'Recipes to plan' })
    await user.click(more('Tuna pasta bake'))
    expect(await screen.findByText(/Some prices are missing: Pasta, dry\./)).toBeInTheDocument()
    expect(within(await screen.findByRole('list', { name: 'Shopping list' })).getByText('No price')).toBeInTheDocument()
  })
  it('hide calorie numbers: no kcal on this screen', async () => {
    const db = await setup({ hideCalories: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await pick(user)
    expect(document.body.textContent).not.toMatch(/kcal/i)
  })
  it('does not store the plan: reopening starts empty', async () => {
    const db = await setup()
    const user = userEvent.setup()
    const first = renderApp(app(), db, '/food/plan')
    await pick(user)
    first.unmount()
    renderApp(app(), db, '/food/plan')
    expect(await screen.findByText(/Pick the recipes you'll eat this week/)).toBeInTheDocument()
  })
  it('uses none of the banned words', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/food/plan')
    await pick(user)
    expect(document.body.textContent).not.toMatch(/\b(clean|guilt[- ]free|cheat|junk|sinful|naughty)\b/i)
  })
})
