import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { createUserFood, logFood } from '../../domain/food'
import { getSettings } from '../../state/settings'
import More from '../More'

describe('More data section', () => {
  it('needs a typed confirmation before deleting health data', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food'], healthConsent: true })
    const f = await createUserFood(db, { createdAt: '', updatedAt: '', deletedAt: null, barcode: null, brand: null, servingG: null, servingLabel: null, name: 'Oats', kcal100g: 1, protein100g: 1, carbs100g: 1, fat100g: 1 })
    await logFood(db, { foodId: f, grams: 10, slot: 'snack' })
    const user = userEvent.setup()
    renderApp(<More />, db, '/more')
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
    renderApp(<More />, db, '/more')
    await user.click(await screen.findByRole('button', { name: 'Download backup' }))
    await waitFor(async () => expect((await getSettings(db)).lastBackupAt).toBeDefined())
  })
})
