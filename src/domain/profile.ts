import type { SqlExecutor } from '../db/executor'
import { getSettings } from '../state/settings'
import { addDays, addMonths, monthRange, weekStart } from './dates'
import { toKg, type WeightUnit } from './units'

export type MonthProgress = { month: string; incomePence: number; spentPence: number; savedPence: number }
export type FoodWeek = { weekStart: string; avgProteinG: number; avgKcal?: number; daysLogged: number }
export type TrainingWeek = { weekStart: string; workouts: number; volume: number }
export type TopLift = { exerciseId: string; name: string; est1rmKg: number; heaviestKg: number }

const r1 = (n: number) => Math.round(n * 10) / 10

/** The last `months` calendar months ending with onDate's month, oldest first. Empty months are zeros. */
export async function moneyProgress(db: SqlExecutor, months: number, onDate: string): Promise<MonthProgress[]> {
  const first = addMonths(`${onDate.slice(0, 7)}-01`, -(months - 1))
  const from = first
  const to = monthRange(onDate).to
  const tx = await db.all<{ m: string; kind: 'income' | 'expense'; t: number }>(
    `SELECT substr(log_date, 1, 7) AS m, kind, SUM(amount_pence) AS t FROM transactions
     WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ? GROUP BY m, kind`,
    [from, to],
  )
  const saved = await db.all<{ m: string; t: number }>(
    `SELECT substr(log_date, 1, 7) AS m, SUM(amount_pence) AS t FROM savings_contributions
     WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ? GROUP BY m`,
    [from, to],
  )
  return Array.from({ length: months }, (_, i) => {
    const month = addMonths(first, i).slice(0, 7)
    const sum = (kind: 'income' | 'expense') => tx.find((r) => r.m === month && r.kind === kind)?.t ?? 0
    return { month, incomePence: sum('income'), spentPence: sum('expense'), savedPence: saved.find((r) => r.m === month)?.t ?? 0 }
  })
}

const weekStarts = (weeks: number, onDate: string) => {
  const last = weekStart(onDate)
  return Array.from({ length: weeks }, (_, i) => addDays(last, -7 * (weeks - 1 - i)))
}

/** Weekly averages over the days that have any food logged. kcal is left out entirely when calorie numbers are hidden. */
export async function foodProgress(db: SqlExecutor, weeks: number, onDate: string): Promise<FoodWeek[]> {
  const { hideCalories } = await getSettings(db)
  const starts = weekStarts(weeks, onDate)
  const days = await db.all<{ d: string; p: number; k: number }>(
    `SELECT log_date AS d, SUM(protein_g) AS p, SUM(kcal) AS k FROM food_logs
     WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ? GROUP BY log_date`,
    [starts[0], addDays(starts[starts.length - 1], 6)],
  )
  return starts.map((ws) => {
    const inWeek = days.filter((d) => d.d >= ws && d.d <= addDays(ws, 6))
    const n = inWeek.length
    const row: FoodWeek = { weekStart: ws, avgProteinG: n ? r1(inWeek.reduce((a, d) => a + d.p, 0) / n) : 0, daysLogged: n }
    if (!hideCalories) row.avgKcal = n ? Math.round(inWeek.reduce((a, d) => a + d.k, 0) / n) : 0
    return row
  })
}

/** Workouts with at least one working set, and working volume (sets × reps × weight) in the chosen unit. */
export async function trainingProgress(db: SqlExecutor, weeks: number, onDate: string, unit: WeightUnit): Promise<TrainingWeek[]> {
  const starts = weekStarts(weeks, onDate)
  const rows = await db.all<{ d: string; workout_id: string; vol: number }>(
    `SELECT w.log_date AS d, w.id AS workout_id, SUM(s.reps * s.weight_kg) AS vol
     FROM workouts w JOIN workout_sets s ON s.workout_id = w.id
     WHERE w.deleted_at IS NULL AND s.deleted_at IS NULL AND s.is_warmup = 0 AND w.log_date BETWEEN ? AND ?
     GROUP BY w.id`,
    [starts[0], addDays(starts[starts.length - 1], 6)],
  )
  return starts.map((ws) => {
    const inWeek = rows.filter((r) => r.d >= ws && r.d <= addDays(ws, 6))
    const kg = inWeek.reduce((a, r) => a + r.vol, 0)
    // fromKg rounds to 0.5 for display of a single weight; volume wants whole units.
    const volume = Math.round(unit === 'kg' ? kg : kg / toKg(1, 'lb'))
    return { weekStart: ws, workouts: inWeek.length, volume }
  })
}

/** Best lifts by estimated one-rep max (Epley), warm-ups and deleted sets excluded. */
export async function topLifts(db: SqlExecutor, limit = 3): Promise<TopLift[]> {
  const rows = await db.all<{ id: string; name: string; best: number; heaviest: number }>(
    `SELECT e.id, e.name, MAX(s.weight_kg * (1 + s.reps / 30.0)) AS best, MAX(s.weight_kg) AS heaviest
     FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND s.is_warmup = 0 AND w.deleted_at IS NULL
     GROUP BY e.id ORDER BY best DESC LIMIT ?`,
    [limit],
  )
  return rows.map((r) => ({ exerciseId: r.id, name: r.name, est1rmKg: r1(r.best), heaviestKg: r.heaviest }))
}

