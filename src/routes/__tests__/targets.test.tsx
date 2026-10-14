import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { addDays, localDate } from '../../domain/dates'
import { quickAdd } from '../../domain/food'
import { getSettings } from '../../state/settings'
import Food from '../Food'
import More from '../More'

const app = () => (
  <Routes>
    <Route path="/food/*" element={<Food />} />
    <Route path="/you/*" element={<More />} />
  </Routes>
)
const on = { onboarded: true, optionalPillars: ['food'] as ('food' | 'train')[], healthConsent: true }
const thisYear = new Date().getFullYear()

describe('work out my targets', () => {
  it('suggests targets from age, height, weight, activity and goal, and saves them with the weight', async () => {
    const db = await freshDb({ ...on, sex: 'male' })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/food')
    await user.click(await screen.findByRole('link', { name: /Work out my targets/ }))
    await user.type(await screen.findByLabelText('Year you were born'), String(thisYear - 30))
    await user.type(screen.getByLabelText('Height (cm)'), '180')
    await user.type(screen.getByLabelText('Weight (kg)'), '80')
    await user.click(screen.getByRole('radio', { name: /Mostly sitting/ }))
    await user.click(screen.getByRole('radio', { name: /Stay the same/ }))
    const result = await screen.findByRole('region', { name: 'Your suggested targets' })
    expect(within(result).getByText(/2,136 kcal/)).toBeInTheDocument()
    expect(within(result).getByText(/96 g protein/)).toBeInTheDocument()
    expect(within(result).getByText(/30 g fibre/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use these targets' }))
    await waitFor(async () => expect(await getSettings(db)).toMatchObject({ kcalTarget: 2136, proteinTarget: 96, fibreTarget: 30, heightCm: 180, birthYear: thisYear - 30, activity: 'sitting', weightGoal: 'maintain' }))
    expect(await db.all('SELECT weight_kg FROM body_metrics')).toEqual([{ weight_kg: 80 }])
  })
  it('keeps calories out of sight when they are hidden, but still saves them', async () => {
    const db = await freshDb({ ...on, sex: 'male', hideCalories: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/food/targets')
    await user.type(await screen.findByLabelText('Year you were born'), String(thisYear - 30))
    await user.type(screen.getByLabelText('Height (cm)'), '180')
    await user.type(screen.getByLabelText('Weight (kg)'), '80')
    await user.click(screen.getByRole('radio', { name: /Mostly sitting/ }))
    await user.click(screen.getByRole('radio', { name: /Stay the same/ }))
    await screen.findByRole('region', { name: 'Your suggested targets' })
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i)
    await user.click(screen.getByRole('button', { name: 'Use these targets' }))
    await waitFor(async () => expect((await getSettings(db)).kcalTarget).toBe(2136))
  })
  it('will not plan a loss for someone already underweight, and offers support', async () => {
    const db = await freshDb({ ...on, sex: 'male' })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/food/targets')
    await user.type(await screen.findByLabelText('Year you were born'), String(thisYear - 30))
    await user.type(screen.getByLabelText('Height (cm)'), '180')
    await user.type(screen.getByLabelText('Weight (kg)'), '55')
    await user.click(screen.getByRole('radio', { name: /Mostly sitting/ }))
    await user.click(screen.getByRole('radio', { name: /Lose weight/ }))
    expect(await screen.findByText(/Beat/)).toBeInTheDocument()
  })
})

describe('targets on the Food screen', () => {
  it('fills rings for protein and fibre and describes calories as a range', async () => {
    const db = await freshDb({ ...on, kcalTarget: 2000, proteinTarget: 120, fibreTarget: 30, carbsTarget: 200, fatTarget: 70 })
    await quickAdd(db, { kcal: 1900, proteinG: 30, carbsG: 100, fatG: 70, slot: 'lunch', logDate: localDate() })
    renderApp(app(), db, '/food')
    expect(await screen.findByRole('img', { name: 'Protein 25% of your target, 90 g to go' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Fibre 0% of your target/ })).toBeInTheDocument()
    expect(screen.getAllByText('In your range')).toHaveLength(2) // calories 1,900 of 1,800–2,200; fat 70 of 63–77
    expect(screen.getByText('80 g to your range')).toBeInTheDocument() // carbs: 100 of 180–220
    expect(document.body.innerHTML).not.toMatch(/danger|red-/)
  })
  it('a reached ring says so', async () => {
    const db = await freshDb({ ...on, proteinTarget: 100 })
    await quickAdd(db, { kcal: 600, proteinG: 120, slot: 'lunch', logDate: localDate() })
    renderApp(app(), db, '/food')
    expect(await screen.findByRole('img', { name: 'Protein reached' })).toBeInTheDocument()
  })
  it('hides the calorie range when calories are hidden', async () => {
    const db = await freshDb({ ...on, hideCalories: true, kcalTarget: 2000, proteinTarget: 120 })
    await quickAdd(db, { kcal: 1900, proteinG: 30, slot: 'lunch', logDate: localDate() })
    renderApp(app(), db, '/food')
    await screen.findByRole('img', { name: /^Protein/ })
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i)
  })
  it('without targets, offers to work them out', async () => {
    const db = await freshDb(on)
    renderApp(app(), db, '/food')
    expect(await screen.findByRole('link', { name: 'Set your targets' })).toHaveAttribute('href', '/you/food/targets')
  })
  it('shows the protein week and the days logged in a row', async () => {
    const db = await freshDb({ ...on, proteinTarget: 100 })
    for (const d of [-2, -1, 0]) await quickAdd(db, { kcal: 500, proteinG: d === -1 ? 120 : 20, slot: 'lunch', logDate: addDays(localDate(), d) })
    renderApp(app(), db, '/food')
    expect(await screen.findByRole('img', { name: '3 days logged in a row' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Protein target, last 7 days: reached on 1' })).toBeInTheDocument()
  })
})
