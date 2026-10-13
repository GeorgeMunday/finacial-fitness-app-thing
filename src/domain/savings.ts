import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { GoalPeriod, SavingsGoal } from '../db/types'
import { daysBetween, localDate, monthRange, yearRange } from './dates'

export type GoalProgress = {
  goal: SavingsGoal
  periodFrom: string
  periodTo: string
  savedPence: number
  targetPence: number
  remainingPence: number
  percent: number
  expectedByNowPence: number
  onTrack: boolean
  perMonthNeededPence: number
}

type GoalRow = {
  id: string; created_at: string; updated_at: string; deleted_at: string | null; name: string; period: GoalPeriod
  target_pence: number; start_date: string | null; target_date: string | null; archived_at: string | null
}
const toGoal = (r: GoalRow): SavingsGoal => ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, name: r.name, period: r.period,
  targetPence: r.target_pence, startDate: r.start_date, targetDate: r.target_date, archivedAt: r.archived_at,
})

export async function createGoal(
  db: SqlExecutor,
  g: { name: string; period: GoalPeriod; targetPence: number; startDate?: string; targetDate?: string },
): Promise<string> {
  if (!g.name.trim()) throw new Error('A goal needs a name')
  if (!Number.isInteger(g.targetPence) || g.targetPence <= 0) throw new Error('Target must be a positive amount')
  if (g.period === 'once' && !g.targetDate) throw new Error('A goal with a date needs a target date')
  const id = newId()
  const now = nowIso()
  const start = g.period === 'once' ? (g.startDate ?? localDate()) : null
  await db.run(
    `INSERT INTO savings_goals (id, created_at, updated_at, name, period, target_pence, start_date, target_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, now, now, g.name.trim(), g.period, g.targetPence, start, g.period === 'once' ? g.targetDate : null],
  )
  return id
}

export async function contribute(db: SqlExecutor, goalId: string, amountPence: number, logDate?: string, note?: string): Promise<string> {
  if (!Number.isInteger(amountPence) || amountPence === 0) throw new Error('Contribution must be a non-zero amount')
  const id = newId()
  const now = nowIso()
  await db.run(
    'INSERT INTO savings_contributions (id, created_at, updated_at, goal_id, log_date, amount_pence, note) VALUES (?,?,?,?,?,?,?)',
    [id, now, now, goalId, logDate ?? localDate(), amountPence, note ?? null],
  )
  return id
}

export async function deleteContribution(db: SqlExecutor, id: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE savings_contributions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function restoreContribution(db: SqlExecutor, id: string): Promise<void> {
  await db.run('UPDATE savings_contributions SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id])
}

export async function archiveGoal(db: SqlExecutor, goalId: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE savings_goals SET archived_at = ?, updated_at = ? WHERE id = ?', [now, now, goalId])
}

function windowFor(goal: SavingsGoal, onDate: string): { from: string; to: string } {
  if (goal.period === 'month') return monthRange(onDate)
  if (goal.period === 'year') return yearRange(onDate)
  return { from: goal.startDate ?? goal.createdAt.slice(0, 10), to: goal.targetDate! }
}

const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1

async function progressFor(db: SqlExecutor, goal: SavingsGoal, onDate: string): Promise<GoalProgress> {
  const { from, to } = windowFor(goal, onDate)
  const [row] = await db.all<{ total: number | null }>(
    `SELECT SUM(amount_pence) AS total FROM savings_contributions
     WHERE goal_id = ? AND deleted_at IS NULL AND log_date BETWEEN ? AND ?`,
    [goal.id, from, to],
  )
  const target = goal.targetPence
  const savedPence = Math.max(0, row?.total ?? 0)
  const remainingPence = Math.max(0, target - savedPence)
  const percent = Math.min(100, Math.floor((savedPence * 100) / target))
  const totalDays = Math.max(1, daysBetween(from, to) + 1)
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(from, onDate) + 1))
  const expectedByNowPence = Math.round((target * elapsed) / totalDays)
  const monthsLeft = Math.max(1, monthIndex(to) - monthIndex(onDate) + 1)
  return {
    goal, periodFrom: from, periodTo: to, savedPence, targetPence: target, remainingPence, percent,
    expectedByNowPence, onTrack: savedPence >= expectedByNowPence, perMonthNeededPence: Math.ceil(remainingPence / monthsLeft),
  }
}

export async function goalProgress(db: SqlExecutor, goalId: string, onDate: string): Promise<GoalProgress> {
  const [r] = await db.all<GoalRow>('SELECT * FROM savings_goals WHERE id = ? AND deleted_at IS NULL', [goalId])
  if (!r) throw new Error('Goal not found')
  return progressFor(db, toGoal(r), onDate)
}

export async function listGoals(db: SqlExecutor, onDate: string): Promise<GoalProgress[]> {
  const rows = await db.all<GoalRow>(
    `SELECT * FROM savings_goals WHERE deleted_at IS NULL AND archived_at IS NULL
     ORDER BY CASE period WHEN 'month' THEN 0 WHEN 'year' THEN 1 ELSE 2 END, target_date, created_at, rowid`,
  )
  return Promise.all(rows.map((r) => progressFor(db, toGoal(r), onDate)))
}

async function sums(db: SqlExecutor, from: string, to: string) {
  const [inc] = await db.all<{ t: number | null }>(
    `SELECT SUM(amount_pence) AS t FROM transactions WHERE deleted_at IS NULL AND kind = 'income' AND log_date BETWEEN ? AND ?`, [from, to])
  const [exp] = await db.all<{ t: number | null }>(
    `SELECT SUM(amount_pence) AS t FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND log_date BETWEEN ? AND ?`, [from, to])
  const [sav] = await db.all<{ t: number | null }>(
    `SELECT SUM(amount_pence) AS t FROM savings_contributions WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?`, [from, to])
  const incomePence = inc?.t ?? 0
  const spentPence = exp?.t ?? 0
  return { incomePence, spentPence, netPence: incomePence - spentPence, savedPence: sav?.t ?? 0 }
}

export async function monthlySummary(db: SqlExecutor, month: string) {
  const { from, to } = monthRange(`${month}-01`)
  return sums(db, from, to)
}

export async function yearlySummary(db: SqlExecutor, year: number) {
  const byMonth: { month: string; netPence: number; savedPence: number }[] = []
  let incomePence = 0, spentPence = 0, savedPence = 0
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`
    const s = await monthlySummary(db, month)
    incomePence += s.incomePence
    spentPence += s.spentPence
    savedPence += s.savedPence
    byMonth.push({ month, netPence: s.netPence, savedPence: s.savedPence })
  }
  return { incomePence, spentPence, savedPence, byMonth }
}

export type Contribution = { id: string; goalId: string; logDate: string; amountPence: number; note: string | null }

export async function listContributions(db: SqlExecutor, goalId: string): Promise<Contribution[]> {
  const rows = await db.all<{ id: string; goal_id: string; log_date: string; amount_pence: number; note: string | null }>(
    'SELECT * FROM savings_contributions WHERE goal_id = ? AND deleted_at IS NULL ORDER BY log_date DESC, rowid DESC',
    [goalId],
  )
  return rows.map((r) => ({ id: r.id, goalId: r.goal_id, logDate: r.log_date, amountPence: r.amount_pence, note: r.note }))
}
