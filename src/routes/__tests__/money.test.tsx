import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { localDate } from '../../domain/dates'
import { addExpense, formatPence, setBudget } from '../../domain/money'
import Money from '../Money'

const app = () => (
  <Routes>
    <Route path="/money/*" element={<Money />} />
  </Routes>
)

describe('add transaction', () => {
  it('saves a typed expense with a category in few presses', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense')
    await user.type(await screen.findByLabelText('Amount'), '4.50')
    await user.click(screen.getByRole('button', { name: 'Eating out' }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(async () => expect(await db.all('SELECT * FROM transactions')).toHaveLength(1))
    const [t] = await db.all<{ amount_pence: number; category_id: string; kind: string }>('SELECT * FROM transactions')
    expect(t).toMatchObject({ amount_pence: 450, category_id: 'cat-eating_out', kind: 'expense' })
    expect(await screen.findByText('Expense saved')).toBeInTheDocument()
  })
  it('keeps Save disabled for invalid amounts and explains why', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense')
    const input = await screen.findByLabelText('Amount')
    await user.type(input, 'abc')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled()
    expect(screen.getByText(/That amount isn't valid/)).toBeInTheDocument()
  })
  it('keypad buttons build the amount', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense')
    await user.click(await screen.findByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: '.' }))
    await user.click(screen.getByRole('button', { name: '4' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('3.4')
    await user.click(screen.getByRole('button', { name: 'Delete digit' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('3.')
  })
  it('saves income', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=income')
    await user.type(await screen.findByLabelText('Amount'), '100')
    await user.click(screen.getByRole('button', { name: 'Save income' }))
    await waitFor(async () => expect(await db.all("SELECT * FROM transactions WHERE kind = 'income'")).toHaveLength(1))
  })
})

describe('Money screen', () => {
  it('shows left to spend this week', async () => {
    const db = await freshDb()
    await setBudget(db, 'cat-groceries', 'week', 5000)
    await addExpense(db, { amountPence: 1000, categoryId: 'cat-groceries', logDate: localDate() })
    renderApp(app(), db, '/money')
    expect(await screen.findByLabelText(formatPence(4000))).toBeInTheDocument()
    expect(screen.getByText(/left to spend this week/)).toBeInTheDocument()
  })
  it('empty state invites action', async () => {
    const db = await freshDb()
    renderApp(app(), db, '/money')
    expect(await screen.findByText('No spending yet this month')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument()
  })
  it('deleting a row offers Undo', async () => {
    const db = await freshDb()
    await addExpense(db, { amountPence: 340, categoryId: 'cat-groceries', merchant: 'Tesco', logDate: localDate() })
    const user = userEvent.setup()
    renderApp(app(), db, '/money')
    await user.click(await screen.findByRole('button', { name: 'Delete Tesco' }))
    await waitFor(async () => expect((await db.all<{ deleted_at: string | null }>('SELECT deleted_at FROM transactions'))[0].deleted_at).not.toBeNull())
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.all<{ deleted_at: string | null }>('SELECT deleted_at FROM transactions'))[0].deleted_at).toBeNull())
  })
})

describe('add screen navigation and undo', () => {
  it('goes to Money (not out of the app) when opened directly', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money/add?kind=expense')
    await user.type(await screen.findByLabelText('Amount'), '2')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(await screen.findByRole('heading', { name: 'Money' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount')).toBeNull()
  })
  it('the Money list refreshes after undoing a save made on the Add screen', async () => {
    const db = await freshDb()
    const user = userEvent.setup()
    renderApp(app(), db, '/money')
    await user.click(await screen.findByRole('button', { name: 'Add expense' }))
    await user.type(await screen.findByLabelText('Amount'), '4.50')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(await screen.findByRole('button', { name: 'Delete Expense' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('No spending yet this month')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Expense' })).toBeNull()
  })
})

