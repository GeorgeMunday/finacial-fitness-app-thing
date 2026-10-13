import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { addExpense, addIncome } from '../money'
import { archiveGoal, contribute, deleteContribution, listContributions, createGoal, goalProgress, listGoals, monthlySummary, yearlySummary } from '../savings'

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
})

describe('goalProgress', () => {
  it('yearly goal on and off track', async () => {
    const id = await createGoal(db, { name: 'Holiday 2026', period: 'year', targetPence: 120000 })
    await contribute(db, id, 10000, '2026-01-15')
    await contribute(db, id, 10000, '2026-02-10')
    const feb = await goalProgress(db, id, '2026-02-28')
    expect(feb.savedPence).toBe(20000)
    expect(feb.expectedByNowPence).toBe(19397)
    expect(feb.onTrack).toBe(true)
    const mar = await goalProgress(db, id, '2026-03-31')
    expect(mar.expectedByNowPence).toBe(29589)
    expect(mar.onTrack).toBe(false)
    expect(mar.perMonthNeededPence).toBe(10000)
  })
  it('counts year boundaries correctly', async () => {
    const id = await createGoal(db, { name: 'Y', period: 'year', targetPence: 100000 })
    await contribute(db, id, 1000, '2026-12-31')
    await contribute(db, id, 2000, '2027-01-01')
    expect((await goalProgress(db, id, '2026-12-31')).savedPence).toBe(1000)
    expect((await goalProgress(db, id, '2027-01-01')).savedPence).toBe(2000)
  })
  it('monthly goal uses the calendar month', async () => {
    const id = await createGoal(db, { name: 'M', period: 'month', targetPence: 20000 })
    await contribute(db, id, 10000, '2026-09-30')
    await contribute(db, id, 5000, '2026-10-03')
    const p = await goalProgress(db, id, '2026-10-12')
    expect(p).toMatchObject({ savedPence: 5000, remainingPence: 15000, percent: 25, periodFrom: '2026-10-01', periodTo: '2026-10-31' })
  })
  it('one-off goal spreads remaining over months left', async () => {
    const id = await createGoal(db, { name: 'O', period: 'once', targetPence: 300000, startDate: '2026-01-01', targetDate: '2027-06-30' })
    await contribute(db, id, 60000, '2026-03-01')
    expect((await goalProgress(db, id, '2026-10-12')).perMonthNeededPence).toBe(26667)
  })
  it('withdrawals never make progress negative; deleted rows ignored', async () => {
    const id = await createGoal(db, { name: 'W', period: 'year', targetPence: 100000 })
    await contribute(db, id, 60000, '2026-02-01')
    await contribute(db, id, -70000, '2026-02-02')
    expect((await goalProgress(db, id, '2026-03-01')).savedPence).toBe(0)
    const c = await contribute(db, id, 5000, '2026-03-01')
    await db.run('UPDATE savings_contributions SET deleted_at = ? WHERE id = ?', ['x', c])
    expect((await goalProgress(db, id, '2026-03-01')).savedPence).toBe(0)
  })
  it('percent caps at 100', async () => {
    const id = await createGoal(db, { name: 'C', period: 'month', targetPence: 1000 })
    await contribute(db, id, 5000, '2026-10-02')
    expect((await goalProgress(db, id, '2026-10-12')).percent).toBe(100)
  })
})

describe('validation and listing', () => {
  it('rejects once goal without targetDate and zero contributions', async () => {
    await expect(createGoal(db, { name: 'x', period: 'once', targetPence: 1000 })).rejects.toThrow()
    const id = await createGoal(db, { name: 'x', period: 'month', targetPence: 1000 })
    await expect(contribute(db, id, 0)).rejects.toThrow()
  })
  it('lists month, year, once in order and hides archived', async () => {
    await createGoal(db, { name: 'once', period: 'once', targetPence: 1000, targetDate: '2027-01-01' })
    await createGoal(db, { name: 'year', period: 'year', targetPence: 1000 })
    const m = await createGoal(db, { name: 'month', period: 'month', targetPence: 1000 })
    const a = await createGoal(db, { name: 'gone', period: 'month', targetPence: 1000 })
    await archiveGoal(db, a)
    const list = await listGoals(db, '2026-10-12')
    expect(list.map((g) => g.goal.name)).toEqual(['month', 'year', 'once'])
    expect(list[0].goal.id).toBe(m)
  })
})

describe('summaries', () => {
  it('monthlySummary', async () => {
    const g = await createGoal(db, { name: 'g', period: 'year', targetPence: 100000 })
    await addIncome(db, { amountPence: 200000, logDate: '2026-10-01' })
    await addExpense(db, { amountPence: 140000, categoryId: 'cat-bills', logDate: '2026-10-02' })
    await contribute(db, g, 15000, '2026-10-05')
    await contribute(db, g, 9999, '2026-11-05')
    expect(await monthlySummary(db, '2026-10')).toEqual({ incomePence: 200000, spentPence: 140000, netPence: 60000, savedPence: 15000 })
  })
  it('yearlySummary has 12 months', async () => {
    const g = await createGoal(db, { name: 'g', period: 'year', targetPence: 100000 })
    await contribute(db, g, 5000, '2026-03-05')
    await addIncome(db, { amountPence: 1000, logDate: '2026-03-06' })
    const y = await yearlySummary(db, 2026)
    expect(y.byMonth).toHaveLength(12)
    expect(y.savedPence).toBe(5000)
    expect(y.byMonth[2]).toEqual({ month: '2026-03', netPence: 1000, savedPence: 5000 })
  })
})

describe('listContributions', () => {
  it('lists newest first, excluding deleted', async () => {
    const id = await createGoal(db, { name: 'g', period: 'year', targetPence: 100000 })
    await contribute(db, id, 100, '2026-01-01')
    const b = await contribute(db, id, 200, '2026-02-01')
    await contribute(db, id, -50, '2026-03-01')
    await deleteContribution(db, b)
    const list = await listContributions(db, id)
    expect(list.map((c) => c.amountPence)).toEqual([-50, 100])
  })
})
