import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { leftToSpend, listBudgets, setBudget } from '../../domain/money'
import Money from '../Money'

describe('budgets screen', () => {
  it('clearing a budget field removes that budget', async () => {
    const db = await freshDb()
    await setBudget(db, 'cat-groceries', 'week', 5000)
    await setBudget(db, 'cat-bills', 'month', 90000)
    const user = userEvent.setup()
    renderApp(<Routes><Route path="/money/*" element={<Money />} /></Routes>, db, '/money/budgets')
    const row = (await screen.findByText('Groceries')).parentElement!
    const week = within(row).getByLabelText('Per week')
    await waitFor(() => expect(week).toHaveValue('50.00'))
    await user.clear(week)
    expect(screen.queryByText(/isn't valid/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save budgets' }))
    await waitFor(async () => expect(await listBudgets(db)).toEqual([{ categoryId: 'cat-bills', period: 'month', limitPence: 90000 }]))
    expect((await leftToSpend(db, 'week', '2026-10-12')).limitPence).toBe(0)
  })
})
