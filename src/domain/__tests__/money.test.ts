import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import {
  addExpense, addIncome, addRecurringRule, deleteRecurring, deleteTransaction, listBudgets, listRecurring, formatPence, leftToSpend, listTransactions,
  parsePence, postDueRecurring, recentCategories, setBudget, spendByCategory, spendByKind,
} from '../money'

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
})

describe('parsePence', () => {
  it.each([['4.5', 450], ['£4.50', 450], ['4,50', 450], [' 12 ', 1200], ['1,250.00', 125000], ['1000000', 100000000]])(
    'parses %s', (input, pence) => expect(parsePence(input)).toBe(pence),
  )
  it.each(['abc', '', '-3', '1000001', '0', '4.555', '1.2.3'])('rejects %j', (input) =>
    expect(parsePence(input)).toBeNull(),
  )
})

describe('formatPence', () => {
  it('formats', () => {
    expect(formatPence(450)).toBe('£4.50')
    expect(formatPence(125000)).toBe('£1,250.00')
    expect(formatPence(-500)).toBe('−£5.00')
  })
})

describe('transactions and budgets', () => {
  it('leftToSpend counts only expenses in the week for budgeted categories', async () => {
    await setBudget(db, 'cat-groceries', 'week', 5000)
    await addExpense(db, { amountPence: 1000, categoryId: 'cat-groceries', logDate: '2026-10-12' })
    await addExpense(db, { amountPence: 500, categoryId: 'cat-groceries', logDate: '2026-10-18' })
    await addExpense(db, { amountPence: 700, categoryId: 'cat-groceries', logDate: '2026-10-19' })
    await addIncome(db, { amountPence: 200000, logDate: '2026-10-14' })
    expect(await leftToSpend(db, 'week', '2026-10-18')).toEqual({ limitPence: 5000, spentPence: 1500, leftPence: 3500 })
  })
  it('setBudget upserts', async () => {
    await setBudget(db, 'cat-groceries', 'week', 5000)
    await setBudget(db, 'cat-groceries', 'week', 6000)
    expect((await leftToSpend(db, 'week', '2026-10-18')).limitPence).toBe(6000)
  })
  it('soft-deleted expense is excluded', async () => {
    await setBudget(db, 'cat-groceries', 'week', 5000)
    const id = await addExpense(db, { amountPence: 1000, categoryId: 'cat-groceries', logDate: '2026-10-12' })
    await deleteTransaction(db, id)
    expect((await leftToSpend(db, 'week', '2026-10-12')).spentPence).toBe(0)
    expect(await listTransactions(db, '2026-10-01', '2026-10-31')).toHaveLength(0)
  })
  it('rejects invalid amounts', async () => {
    await expect(addExpense(db, { amountPence: 0, categoryId: 'cat-groceries' })).rejects.toThrow()
    await expect(addExpense(db, { amountPence: 1.5, categoryId: 'cat-groceries' })).rejects.toThrow()
  })
  it('listTransactions newest first, camelCase', async () => {
    await addExpense(db, { amountPence: 100, categoryId: 'cat-bills', logDate: '2026-10-01' })
    await addExpense(db, { amountPence: 200, categoryId: 'cat-bills', logDate: '2026-10-05' })
    const list = await listTransactions(db, '2026-10-01', '2026-10-31')
    expect(list.map((t) => t.amountPence)).toEqual([200, 100])
  })
  it('spend breakdowns ignore income', async () => {
    await addExpense(db, { amountPence: 300, categoryId: 'cat-groceries', logDate: '2026-10-02' })
    await addExpense(db, { amountPence: 900, categoryId: 'cat-takeaway', logDate: '2026-10-03' })
    await addIncome(db, { amountPence: 100000, logDate: '2026-10-03' })
    const byCat = await spendByCategory(db, '2026-10-01', '2026-10-31')
    expect(byCat.map((c) => c.spentPence).sort()).toEqual([300, 900])
    const byKind = await spendByKind(db, '2026-10-01', '2026-10-31')
    expect(byKind.groceries).toBe(300)
    expect(byKind.takeaway).toBe(900)
    expect(byKind.income).toBe(0)
  })
  it('recentCategories puts last used first', async () => {
    await addExpense(db, { amountPence: 100, categoryId: 'cat-bills' })
    await addExpense(db, { amountPence: 100, categoryId: 'cat-transport' })
    const recent = await recentCategories(db)
    expect(recent[0].id).toBe('cat-transport')
    expect(recent[1].id).toBe('cat-bills')
    expect(recent.find((c) => c.id === 'cat-income')).toBeUndefined()
  })
})

describe('recurring', () => {
  it('posts due expense rules and advances', async () => {
    await addRecurringRule(db, { kind: 'expense', name: 'Rent', amountPence: 50000, categoryId: 'cat-bills', cadence: 'monthly', nextDate: '2026-08-12' })
    expect(await postDueRecurring(db, '2026-10-12')).toBe(3)
    expect(await postDueRecurring(db, '2026-10-12')).toBe(0)
    const [r] = await db.all<{ next_date: string }>('SELECT next_date FROM recurring_rules')
    expect(r.next_date).toBe('2026-11-12')
  })
  it('posts income rules as income', async () => {
    await addRecurringRule(db, { kind: 'income', name: 'Salary', amountPence: 200000, categoryId: 'cat-income', cadence: 'monthly', nextDate: '2026-10-01' })
    await postDueRecurring(db, '2026-10-12')
    const [t] = await listTransactions(db, '2026-10-01', '2026-10-31')
    expect(t.kind).toBe('income')
  })
})

describe('lists', () => {
  it('listBudgets and recurring rules', async () => {
    await setBudget(db, 'cat-groceries', 'week', 5000)
    await setBudget(db, 'cat-groceries', 'month', 20000)
    expect(await listBudgets(db)).toEqual(expect.arrayContaining([
      { categoryId: 'cat-groceries', period: 'week', limitPence: 5000 },
      { categoryId: 'cat-groceries', period: 'month', limitPence: 20000 },
    ]))
    const id = await addRecurringRule(db, { kind: 'expense', name: 'Rent', amountPence: 50000, categoryId: 'cat-bills', cadence: 'monthly', nextDate: '2026-11-01' })
    expect(await listRecurring(db)).toHaveLength(1)
    await deleteRecurring(db, id)
    expect(await listRecurring(db)).toHaveLength(0)
  })
})
