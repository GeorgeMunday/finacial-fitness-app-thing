import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { createUserFood, logFood } from '../../domain/food'
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
