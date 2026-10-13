import type { SqlExecutor } from '../db/executor'
import { backupDue as isBackupDue, getSettings } from '../state/settings'
import { addDays, weekStart } from './dates'
import { dailyKcal, dayTotals } from './food'
import { leftToSpend, spendByKind } from './money'
import { lowIntakeStreak } from './safety'
import { listGoals } from './savings'
import { lastWorkoutDate } from './training'

export type TodaySummary = {
  money: {
    leftThisWeekPence: number
    weekLimitPence: number
    spentThisWeekPence: number
    spentTodayPence: number
    topGoal?: { id: string; name: string; percent: number; remainingPence: number; onTrack: boolean }
  }
  food?: { kcalLeft?: number; proteinLeft?: number; kcal: number; proteinG: number }
  train?: { workoutToday: boolean; lastWorkoutDate?: string }
  loggedDaysLast7: number
  showSupport: boolean
  backupDue: boolean
}

const sum = async (db: SqlExecutor, sql: string, params: unknown[]) => (await db.all<{ t: number | null }>(sql, params))[0]?.t ?? 0

export async function todaySummary(db: SqlExecutor, logDate: string): Promise<TodaySummary> {
  const settings = await getSettings(db)
  const week = await leftToSpend(db, 'week', logDate)
  const from = weekStart(logDate)
  const spentThisWeekPence = await sum(db,
    "SELECT SUM(amount_pence) AS t FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND log_date BETWEEN ? AND ?",
    [from, addDays(from, 6)])
  const spentTodayPence = await sum(db,
    "SELECT SUM(amount_pence) AS t FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND log_date = ?", [logDate])
  const goals = await listGoals(db, logDate)
  const top = [...goals].sort((a, b) => a.percent - b.percent)[0]

  const out: TodaySummary = {
    money: {
      leftThisWeekPence: week.leftPence, weekLimitPence: week.limitPence, spentThisWeekPence, spentTodayPence,
      topGoal: top && { id: top.goal.id, name: top.goal.name, percent: top.percent, remainingPence: top.remainingPence, onTrack: top.onTrack },
    },
    loggedDaysLast7: 0,
    showSupport: false,
    backupDue: isBackupDue(settings, logDate),
  }

  const foodOn = settings.optionalPillars.includes('food')
  if (foodOn) {
    const t = await dayTotals(db, logDate)
    out.food = { kcal: t.kcal, proteinG: t.proteinG }
    if (!settings.hideCalories && settings.kcalTarget) out.food.kcalLeft = settings.kcalTarget - t.kcal
    if (settings.proteinTarget) out.food.proteinLeft = Math.round((settings.proteinTarget - t.proteinG) * 10) / 10
    out.showSupport = lowIntakeStreak(await dailyKcal(db, addDays(logDate, -6), logDate), settings.sex)
  }
  if (settings.optionalPillars.includes('train')) {
    const [w] = await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM workouts WHERE deleted_at IS NULL AND log_date = ?', [logDate])
    out.train = { workoutToday: w.n > 0 }
    const last = await lastWorkoutDate(db)
    if (last) out.train.lastWorkoutDate = last
  }

  const [days] = await db.all<{ n: number }>(
    `SELECT COUNT(DISTINCT d) AS n FROM (
       SELECT log_date AS d FROM transactions WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?
       UNION SELECT log_date FROM savings_contributions WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?
       UNION SELECT log_date FROM food_logs WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?
       UNION SELECT w.log_date FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
             WHERE s.deleted_at IS NULL AND w.log_date BETWEEN ? AND ?)`,
    Array(4).fill([addDays(logDate, -6), logDate]).flat(),
  )
  out.loggedDaysLast7 = days.n
  return out
}

export async function weeklyFoodSpend(db: SqlExecutor, onDate: string) {
  const from = weekStart(onDate)
  const to = addDays(from, 6)
  const k = await spendByKind(db, from, to)
  const out: { groceriesPence: number; eatingOutPence: number; takeawayPence: number; avgKcal?: number; avgProteinG?: number } = {
    groceriesPence: k.groceries, eatingOutPence: k.eating_out, takeawayPence: k.takeaway,
  }
  const settings = await getSettings(db)
  if (settings.optionalPillars.includes('food')) {
    const [r] = await db.all<{ days: number; kcal: number | null; protein: number | null }>(
      `SELECT COUNT(DISTINCT log_date) AS days, SUM(kcal) AS kcal, SUM(protein_g) AS protein
       FROM food_logs WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?`,
      [from, to],
    )
    if (r.days > 0) {
      out.avgKcal = Math.round((r.kcal ?? 0) / r.days)
      out.avgProteinG = Math.round(((r.protein ?? 0) / r.days) * 10) / 10
    }
  }
  return out
}
