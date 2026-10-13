import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { createUserFood, logFood } from '../../domain/food'
import { getSettings } from '../../state/settings'
import { Route, Routes } from 'react-router-dom'
import More from '../More'
import { getMonthlyIncome, saveMonthlyIncome } from '../../domain/income'
import { localDate } from '../../domain/dates'

describe('More consent', () => {
  it('turning Food on asks for consent naming only food logs and body weight', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/more/*" element={<More />} /></Routes>, db, '/more/sections')
    await user.click(await screen.findByRole('switch', { name: 'Food' }))
    const dialog = screen.getByRole('dialog', { name: 'Your health data' })
    expect(dialog).toHaveTextContent(/food logs and body weight/)
    expect(dialog).not.toHaveTextContent(/workout/i)
  })
})

describe('More monthly income', () => {
  it('edits the recurring income rule, and can stop it', async () => {
    const db = await freshDb({ onboarded: true })
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 1, today: localDate() })
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/more/*" element={<More />} /></Routes>, db, '/more/income')
    const amount = await screen.findByLabelText('Monthly income')
    await waitFor(() => expect(amount).toHaveValue('2000.00'))
    await user.clear(amount)
    await user.type(amount, '2100')
    await user.selectOptions(screen.getByLabelText("Day of the month you're paid"), '25')
    await user.click(screen.getByRole('button', { name: 'Save income' }))
    await waitFor(async () => expect(await getMonthlyIncome(db)).toEqual({ amountPence: 210000, payDay: 25 }))
    await user.click(screen.getByRole('button', { name: 'Stop monthly income' }))
    await waitFor(async () => expect(await getMonthlyIncome(db)).toBeNull())
  })
  it('sets up income for someone who skipped it in onboarding', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/more/*" element={<More />} /></Routes>, db, '/more/income')
    await user.type(await screen.findByLabelText('Monthly income'), '1500')
    await user.click(screen.getByRole('button', { name: 'Save income' }))
    await waitFor(async () => expect(await getMonthlyIncome(db)).toEqual({ amountPence: 150000, payDay: 1 }))
  })
})

describe('More data section', () => {
  it('needs a typed confirmation before deleting health data', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const f = await createUserFood(db, { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null, name: 'Oats', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 })
    await logFood(db, { foodId: f, grams: 10, slot: 'snack' })
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/more/*" element={<More />} /></Routes>, db, '/more/data')
    await user.click(await screen.findByRole('button', { name: 'Delete health data…' }))
    const confirm = screen.getByRole('button', { name: 'Delete health data' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Type delete to confirm'), 'delete')
    await user.click(confirm)
    await waitFor(async () => expect(await db.all('SELECT * FROM food_logs')).toHaveLength(0))
    expect((await getSettings(db)).healthConsent).toBe(false)
  })
  it('download backup records lastBackupAt', async () => {
    const db = await freshDb({ onboarded: true })
    URL.createObjectURL = () => 'blob:x'
    URL.revokeObjectURL = () => {}
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/more/*" element={<More />} /></Routes>, db, '/more/data')
    await user.click(await screen.findByRole('button', { name: 'Download backup' }))
    await waitFor(async () => expect((await getSettings(db)).lastBackupAt).toBeDefined())
  })
})
