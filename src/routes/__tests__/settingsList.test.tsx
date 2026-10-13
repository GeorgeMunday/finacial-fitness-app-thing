import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { contribute, createGoal } from '../../domain/savings'
import { createRoutine, customExercise, finishWorkout, logSet, startWorkout } from '../../domain/training'
import { getSettings } from '../../state/settings'
import Money from '../Money'
import More from '../More'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/you/*" element={<More />} />
    <Route path="/money/*" element={<Money />} />
    <Route path="/train/*" element={<Train />} />
  </Routes>
)

describe('settings list', () => {
  it('groups settings, showing Food and Training only when those are on', async () => {
    const db = await freshDb({ onboarded: true })
    renderApp(app(), db, '/you')
    const list = await screen.findByRole('navigation', { name: 'Settings' })
    for (const g of ['Profile', 'Money', 'Dates', 'Appearance', 'Sections', 'Your data']) expect(within(list).getByRole('heading', { name: g })).toBeInTheDocument()
    expect(within(list).queryByRole('heading', { name: 'Food' })).toBeNull()
    expect(within(list).queryByRole('heading', { name: 'Training' })).toBeNull()
  })
  it('shows Food and Training groups when on', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food', 'train'], healthConsent: true })
    renderApp(app(), db, '/you')
    const list = await screen.findByRole('navigation', { name: 'Settings' })
    expect(within(list).getByRole('heading', { name: 'Food' })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: 'Training' })).toBeInTheDocument()
  })
  it('each row opens its own screen, with a way back', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/you')
    await user.click(await screen.findByRole('link', { name: /Backup and storage/ }))
    expect(await screen.findByRole('button', { name: 'Download backup' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to profile' }))
    expect(await screen.findByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
  })
  it('money rows link to budgets, recurring payments and goals', async () => {
    const db = await freshDb({ onboarded: true })
    renderApp(app(), db, '/you')
    const list = await screen.findByRole('navigation', { name: 'Settings' })
    expect(within(list).getByRole('link', { name: /Budgets/ })).toHaveAttribute('href', '/money/budgets')
    expect(within(list).getByRole('link', { name: /Recurring payments/ })).toHaveAttribute('href', '/money/recurring')
    expect(within(list).getByRole('link', { name: /Savings goals/ })).toHaveAttribute('href', '/money/goals')
  })
  it('saves a display name', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/profile')
    await user.type(await screen.findByLabelText('Display name'), 'Sam')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(async () => expect((await getSettings(db)).displayName).toBe('Sam'))
  })
  it('sets the theme', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/appearance')
    await user.click(await screen.findByRole('radio', { name: 'Dark' }))
    await waitFor(async () => expect((await getSettings(db)).theme).toBe('dark'))
  })
})

describe('training settings', () => {
  it('the rest timer uses the chosen length', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/training')
    await user.click(await screen.findByRole('radio', { name: '60 s' }))
    await waitFor(async () => expect((await getSettings(db)).restSeconds).toBe(60))
  })
  it('the workout screen starts the rest timer at the chosen length', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['train'], restSeconds: 120 })
    const ex = await customExercise(db, 'Squat')
    const r = await createRoutine(db, 'Legs', [{ exerciseId: ex, targetSets: 1, targetReps: 5 }])
    const old = await startWorkout(db, r)
    await logSet(db, { workoutId: old, exerciseId: ex, reps: 5, weightKg: 100 })
    await finishWorkout(db, old)
    const w = await startWorkout(db, r)
    const user = userEvent.setup()
    renderApp(app(), db, `/train/workout/${w}`)
    await user.click(await screen.findByRole('button', { name: 'Log set 1 of Squat' }))
    expect(await screen.findByText('2:00')).toBeInTheDocument()
  })
})

describe('date format', () => {
  it('is chosen in Dates and used where dates are shown', async () => {
    const db = await freshDb({ onboarded: true })
    const g = await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 100000 })
    await contribute(db, g, 500, '2026-03-04')
    const user = userEvent.setup()
    renderApp(app(), db, '/you/dates')
    await user.click(await screen.findByRole('radio', { name: '12/10/2026' }))
    await waitFor(async () => expect((await getSettings(db)).dateFormat).toBe('numeric'))
  })
  it('goal contributions show dates in the chosen format', async () => {
    const db = await freshDb({ onboarded: true, dateFormat: 'numeric' })
    const g = await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 100000 })
    await contribute(db, g, 500, '2026-03-04')
    renderApp(app(), db, `/money/goals/${g}`)
    expect(await screen.findByText('04/03/2026')).toBeInTheDocument()
  })
})
