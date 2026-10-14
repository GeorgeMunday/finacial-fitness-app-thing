import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { createUserFood, logFood, quickAdd } from '../../domain/food'
import { getSettings } from '../../state/settings'
import Food from '../Food'
import { lookupBarcode } from '../../domain/openFoodFacts'
import More from '../More'

vi.mock('../../domain/openFoodFacts', () => ({
  lookupBarcode: vi.fn(async (_db: unknown, barcode: string) => ({ status: 'not_found', draft: { barcode } })),
}))

const app = () => (
  <Routes>
    <Route path="/food/*" element={<Food />} />
    <Route path="/you/*" element={<More />} />
  </Routes>
)
const food = { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null }

describe('food quick wins', () => {
  const on = { onboarded: true, optionalPillars: ['food'] as ('food' | 'train')[], healthConsent: true }
  const rows = (db: Awaited<ReturnType<typeof freshDb>>) => db.all<Record<string, unknown>>('SELECT * FROM food_logs WHERE deleted_at IS NULL')

  it('adding from a past day logs to that day and goes back to it', async () => {
    const db = await freshDb(on)
    await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    const user = userEvent.setup()
    renderApp(app(), db, '/food?date=2026-10-01')
    expect(await screen.findByRole('heading', { name: /1 October/ })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Add to Lunch' }))
    expect(await screen.findByText(/Adding to Thursday 1 October/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search foods'), 'Oats')
    await user.click(await screen.findByRole('link', { name: /Oats/ }))
    await user.click(await screen.findByRole('button', { name: 'Log food' }))
    expect(await screen.findByRole('heading', { name: /1 October/ })).toBeInTheDocument()
    expect(await rows(db)).toEqual([expect.objectContaining({ log_date: '2026-10-01', slot: 'lunch' })])
  })

  it('a quick add on a past day keeps its name, carbs and fat', async () => {
    const db = await freshDb(on)
    const user = userEvent.setup()
    renderApp(app(), db, '/food/search?slot=dinner&date=2026-10-01')
    await user.click(await screen.findByRole('button', { name: 'Quick add' }))
    await user.type(screen.getByLabelText('Name (optional)'), 'Meal deal')
    await user.type(screen.getByLabelText('Calories'), '600')
    await user.type(screen.getByLabelText('Carbs (g, optional)'), '70')
    await user.type(screen.getByLabelText('Fat (g, optional)'), '20')
    await user.click(screen.getByRole('button', { name: 'Log food' }))
    await waitFor(async () => expect(await rows(db)).toEqual([expect.objectContaining({ log_date: '2026-10-01', name: 'Meal deal', kcal: 600, carbs_g: 70, fat_g: 20 })]))
  })

  it('tapping a logged food lets you change its portion and meal', async () => {
    const db = await freshDb(on)
    const oats = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: localDate() })
    const user = userEvent.setup()
    renderApp(app(), db, '/food')
    await user.click(await screen.findByRole('button', { name: 'Edit Oats' }))
    const grams = await screen.findByLabelText('Portion (g)')
    await user.clear(grams)
    await user.type(grams, '100')
    await user.click(screen.getByRole('button', { name: 'Snacks' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await rows(db)).toEqual([expect.objectContaining({ grams: 100, kcal: 380, slot: 'snack' })]))
    expect(await screen.findByText(/100 g, 380 kcal/)).toBeInTheDocument()
  })

  it('tapping a quick add lets you change its numbers', async () => {
    const db = await freshDb(on)
    await quickAdd(db, { kcal: 300, slot: 'lunch', logDate: localDate() })
    const user = userEvent.setup()
    renderApp(app(), db, '/food')
    await user.click(await screen.findByRole('button', { name: 'Edit Quick add' }))
    const kcal = await screen.findByLabelText('Calories')
    await user.clear(kcal)
    await user.type(kcal, '450')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await rows(db)).toEqual([expect.objectContaining({ kcal: 450 })]))
  })

  it('shows a saved product photo on the food page and in search, and a letter tile otherwise', async () => {
    const db = await freshDb(on)
    const id = await createUserFood(db, { ...food, name: 'Granola', kcal100g: 450, protein100g: 9, carbs100g: 60, fat100g: 17 })
    await createUserFood(db, { ...food, name: 'Grapes', kcal100g: 69, protein100g: 0.7, carbs100g: 18, fat100g: 0.1 })
    await db.run("INSERT INTO food_images (id, created_at, updated_at, food_id, source_url, data_url) VALUES ('i','x','x',?,'u','data:image/jpeg;base64,QUFB')", [id])
    const user = userEvent.setup()
    const first = renderApp(app(), db, '/food/search')
    await user.type(await screen.findByLabelText('Search foods'), 'Gra')
    await screen.findByRole('link', { name: /Grapes/ })
    expect(document.querySelectorAll('img[src^="data:image/jpeg"]')).toHaveLength(1)
    first.unmount()
    renderApp(app(), db, `/food/${id}`)
    await screen.findByRole('button', { name: 'Log food' })
    expect(document.querySelector('img[src^="data:image/jpeg"]')).not.toBeNull()
  })
  it('serving chips fill the portion', async () => {
    const db = await freshDb(on)
    const id = await createUserFood(db, { ...food, name: 'Toast', kcal100g: 250, protein100g: 9, carbs100g: 45, fat100g: 3, servingG: 36, servingLabel: 'slice' })
    const user = userEvent.setup()
    renderApp(app(), db, `/food/${id}`)
    await user.click(await screen.findByRole('button', { name: '2 slices (72 g)' }))
    expect(screen.getByLabelText('Portion (g)')).toHaveValue('72')
    expect(screen.getByRole('button', { name: '2 slices (72 g)' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('food screens', () => {
  it('hides calorie numbers when asked', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, hideCalories: true })
    const oats = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: oats, grams: 50, slot: 'breakfast', logDate: localDate() })
    renderApp(app(), db, '/food')
    expect(await screen.findByText('Oats')).toBeInTheDocument()
    expect(screen.getAllByText(/protein/i).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/kcal/i)
  })
  it('logs a recent food in few presses', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const oats = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    await logFood(db, { foodId: oats, grams: 40, slot: 'breakfast', logDate: '2026-01-01' })
    const user = userEvent.setup()
    renderApp(app(), db, '/food/search?slot=snack')
    await user.click(await screen.findByRole('link', { name: /Oats/ }))
    await user.click(await screen.findByRole('button', { name: 'Log food' }))
    await waitFor(async () => expect(await db.all('SELECT * FROM food_logs WHERE log_date = ?', [localDate()])).toHaveLength(1))
    const [l] = await db.all<{ grams: number; slot: string }>('SELECT * FROM food_logs WHERE log_date = ?', [localDate()])
    expect(l).toMatchObject({ grams: 40, slot: 'snack' })
  })
  it('a barcode not in Open Food Facts lands on a pre-filled create form', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/food/scan?slot=lunch')
    await user.type(await screen.findByLabelText('Barcode'), '5012345678900')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByLabelText('Food name')).toBeInTheDocument()
    expect(screen.getByLabelText('Barcode')).toHaveValue('5012345678900')
  })
  it('shows that a lookup is in progress, and recovers if it fails', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    let fail!: (e: Error) => void
    vi.mocked(lookupBarcode).mockImplementationOnce(() => new Promise((_res, rej) => (fail = rej)))
    const user = userEvent.setup()
    renderApp(app(), db, '/food/scan')
    await user.type(await screen.findByLabelText('Barcode'), '5012345678900')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByText(/Looking up 5012345678900/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled()
    fail(new Error('database busy'))
    expect(await screen.findByText(/Couldn't look that barcode up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Look up' })).toBeEnabled()
  })
  it('shows Open Food Facts attribution on search and detail', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const id = await createUserFood(db, { ...food, name: 'Oats', kcal100g: 380, protein100g: 12, carbs100g: 60, fat100g: 8 })
    const first = renderApp(app(), db, '/food/search')
    expect(await screen.findByText(/Food data © Open Food Facts contributors, ODbL/)).toBeInTheDocument()
    first.unmount()
    renderApp(app(), db, `/food/${id}`)
    expect(await screen.findByRole('button', { name: 'Log food' })).toBeInTheDocument()
    expect(screen.getByText(/Food data © Open Food Facts contributors, ODbL/)).toBeInTheDocument()
  })
  it('clamps calorie targets to the floor', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true, sex: 'female' })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/food')
    await user.type(await screen.findByLabelText('Daily calorie target'), '1000')
    await user.click(screen.getByRole('button', { name: 'Save targets' }))
    await waitFor(async () => expect((await getSettings(db)).kcalTarget).toBe(1200))
    expect(screen.getByText(/1,200 kcal/)).toBeInTheDocument()
  })
  it('creates a food from the form and logs it', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/food/new?barcode=123&name=Granola')
    expect(await screen.findByLabelText('Food name')).toHaveValue('Granola')
    await user.type(screen.getByLabelText('Calories per 100 g'), '450')
    await user.type(screen.getByLabelText('Protein per 100 g'), '9')
    await user.type(screen.getByLabelText('Carbs per 100 g'), '60')
    await user.type(screen.getByLabelText('Fat per 100 g'), '17')
    await user.click(screen.getByRole('button', { name: 'Save food' }))
    await waitFor(async () => expect(await db.all("SELECT * FROM foods WHERE source = 'user' AND barcode = '123'")).toHaveLength(1))
  })
})
