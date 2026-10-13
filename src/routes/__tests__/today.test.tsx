import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import Money from '../Money'
import Today from '../Today'

const app = () => (
  <Routes>
    <Route path="/" element={<Today />} />
    <Route path="/money/*" element={<Money />} />
  </Routes>
)

describe('Today', () => {
  it('adds an expense within 3 presses after the keypad shows', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/')
    await user.click(await screen.findByRole('button', { name: 'Add expense' }))
    await user.click(await screen.findByRole('button', { name: '3', exact: true } as never))
    await user.click(screen.getByRole('button', { name: 'Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(async () => {
      const rows = await db.all<{ amount_pence: number }>('SELECT * FROM transactions')
      expect(rows.map((r) => r.amount_pence)).toEqual([300])
    })
  })
  it('shows the backup nudge and no optional cards for money-only users', async () => {
    const db = await freshDb({ onboarded: true, lastBackupAt: '2020-01-01T00:00:00.000Z' })
    renderApp(app(), db, '/')
    expect(await screen.findByText(/Back up your data/)).toBeInTheDocument()
    expect(screen.queryByText(/protein/)).toBeNull()
    expect(screen.getByText(/of the last 7 days/)).toBeInTheDocument()
  })
})
