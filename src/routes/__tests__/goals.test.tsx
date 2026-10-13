import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { createGoal } from '../../domain/savings'
import Money from '../Money'

const app = () => (
  <Routes>
    <Route path="/money/*" element={<Money />} />
  </Routes>
)

describe('goals', () => {
  it('"+ Save" then keypad then Add to goal records a contribution', async () => {
    const db = await freshDb()
    await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 120000 })
    const user = userEvent.setup()
    renderApp(app(), db, '/money/goals')
    await user.click(await screen.findByRole('button', { name: 'Save to Holiday' }))
    await user.type(screen.getByLabelText('Amount'), '25')
    await user.click(screen.getByRole('button', { name: 'Add to goal' }))
    await waitFor(async () => {
      const rows = await db.all<{ amount_pence: number }>('SELECT * FROM savings_contributions')
      expect(rows).toHaveLength(1)
      expect(rows[0].amount_pence).toBe(2500)
    })
  })
  it('behind-target goals say how much a month catches up, without error colours', async () => {
    const db = await freshDb()
    await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 120000 })
    renderApp(app(), db, '/money/goals')
    expect(await screen.findByText(/a month to catch up/)).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar.innerHTML).not.toMatch(/danger|destructive|red/)
    expect(bar.className).not.toMatch(/danger|destructive|red/)
  })
  it('creates a goal', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/goals/new')
    await user.type(await screen.findByLabelText('Goal name'), 'Rainy day')
    await user.type(screen.getByLabelText('Target'), '500')
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(async () => expect(await db.all('SELECT * FROM savings_goals')).toHaveLength(1))
  })
  it('goal detail lists contributions and can archive', async () => {
    const db = await freshDb()
    const id = await createGoal(db, { name: 'Holiday', period: 'year', targetPence: 120000 })
    const user = userEvent.setup()
    renderApp(app(), db, `/money/goals/${id}`)
    expect(await screen.findByText('Holiday')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archive goal' }))
    await waitFor(async () => expect((await db.all<{ archived_at: string | null }>('SELECT archived_at FROM savings_goals'))[0].archived_at).not.toBeNull())
  })
})
