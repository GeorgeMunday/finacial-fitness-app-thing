import { describe, expect, it } from 'vitest'
import { freshDb } from '../../../test/renderApp'
import { getSettings } from '../../state/settings'
import { getMonthlyIncome, saveMonthlyIncome, stopMonthlyIncome } from '../income'
import { listRecurring } from '../money'

describe('monthly income', () => {
  it('creates the rule on the next pay day and records the amount', async () => {
    const db = await freshDb()
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 25, today: '2026-10-13' })
    expect(await listRecurring(db)).toEqual([expect.objectContaining({ kind: 'income', amountPence: 200000, nextDate: '2026-10-25', cadence: 'monthly' })])
    expect(await getMonthlyIncome(db)).toEqual({ amountPence: 200000, payDay: 25 })
    expect((await getSettings(db)).monthlyIncomePence).toBe(200000)
    expect((await getSettings(db)).payDay).toBe(25)
  })
  it('changing only the amount keeps the next pay date and never duplicates the rule', async () => {
    const db = await freshDb()
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 13, today: '2026-10-13' })
    await db.run("UPDATE recurring_rules SET next_date = '2026-11-13'") // as if today's pay was already posted
    await saveMonthlyIncome(db, { amountPence: 210000, payDay: 13, today: '2026-10-13' })
    const rules = await listRecurring(db)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ amountPence: 210000, nextDate: '2026-11-13' })
  })
  it('changing the pay day moves the next date to the next one after today', async () => {
    const db = await freshDb()
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 1, today: '2026-10-13' })
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 13, today: '2026-10-13' })
    expect((await listRecurring(db))[0]).toMatchObject({ nextDate: '2026-11-13' })
    expect(await getMonthlyIncome(db)).toEqual({ amountPence: 200000, payDay: 13 })
  })
  it('stopping removes the rule and the amount', async () => {
    const db = await freshDb()
    await saveMonthlyIncome(db, { amountPence: 200000, payDay: 1, today: '2026-10-13' })
    await stopMonthlyIncome(db)
    expect(await listRecurring(db)).toHaveLength(0)
    expect(await getMonthlyIncome(db)).toBeNull()
    expect((await getSettings(db)).monthlyIncomePence).toBeUndefined()
    expect((await getSettings(db)).payDay).toBeUndefined()
  })
})
