// Estimates, not medical advice. Like the floors in safety.ts, these should be reviewed by a registered dietitian before public launch.
import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { Sex } from '../db/types'
import { addDays } from './dates'
import { clampTarget, goalWeightWarning, MAX_WEEKLY_LOSS_FRACTION } from './safety'

export type Activity = 'sitting' | 'light' | 'active' | 'very'
export type WeightGoal = 'lose' | 'maintain' | 'gain'

export const ACTIVITY: Record<Activity, { factor: number; label: string; hint: string }> = {
  sitting: { factor: 1.2, label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  light: { factor: 1.375, label: 'Lightly active', hint: 'On your feet some of the day, or exercise 1–3 times a week' },
  active: { factor: 1.55, label: 'Active', hint: 'On your feet most of the day, or exercise 3–5 times a week' },
  very: { factor: 1.725, label: 'Very active', hint: 'Physical job, or hard exercise most days' },
}

/** Mifflin–St Jeor's sex term; "prefer not to say" sits halfway between. */
const SEX_TERM: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 }
const MAX_DAILY_DEFICIT = 500
const GAIN_SURPLUS = 250
const KCAL_PER_KG = 7700
export const FIBRE_TARGET_G = 30
const FAT_SHARE = 0.3

export type TargetInputs = { sex: Sex; age: number; heightCm: number; weightKg: number; activity: Activity; goal: WeightGoal; training: boolean }
export type Targets = {
  maintenanceKcal: number; kcal: number; kcalClamped: boolean; loseRefused: boolean
  proteinG: number; fibreG: number; carbsG: number; fatG: number
}

export function suggestTargets(i: TargetInputs): Targets {
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_TERM[i.sex]
  const maintenanceKcal = Math.round(bmr * ACTIVITY[i.activity].factor)
  // Already under a healthy weight: never plan a loss.
  const loseRefused = i.goal === 'lose' && goalWeightWarning(i.weightKg, i.heightCm)
  let wanted = maintenanceKcal
  if (i.goal === 'lose' && !loseRefused) {
    const weeklyCap = Math.round((i.weightKg * MAX_WEEKLY_LOSS_FRACTION * KCAL_PER_KG) / 7)
    wanted -= Math.min(MAX_DAILY_DEFICIT, weeklyCap)
  }
  if (i.goal === 'gain') wanted += GAIN_SURPLUS
  const { kcal, clamped } = clampTarget(wanted, i.sex)
  const proteinG = Math.round(i.weightKg * (i.training || i.activity === 'active' || i.activity === 'very' ? 1.6 : 1.2))
  const fatG = Math.round((kcal * FAT_SHARE) / 9)
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))
  return { maintenanceKcal, kcal, kcalClamped: clamped, loseRefused, proteinG, fibreG: FIBRE_TARGET_G, carbsG, fatG }
}

/** A "reach" goal (protein, fibre): more is fine, so the ring simply fills and stays full. */
export function ringProgress(value: number, target: number): { percent: number; done: boolean; toGo: number } | null {
  if (!(target > 0)) return null
  const done = value >= target
  return { percent: done ? 100 : Math.floor((value / target) * 100), done, toGo: done ? 0 : Math.round((target - value) * 10) / 10 }
}

export const RANGE = 0.1

/** Calories, carbs and fat: a ±10% range around the target, described by where today sits, never scored. */
export function rangeStatus(value: number, target: number): { status: 'below' | 'in' | 'above'; low: number; high: number; toRange: number } {
  const low = Math.round(target * (1 - RANGE))
  const high = Math.round(target * (1 + RANGE))
  if (value < low) return { status: 'below', low, high, toRange: Math.round(low - value) }
  return { status: value > high ? 'above' : 'in', low, high, toRange: 0 }
}

/** The 7 days ending `endDate`, oldest first, and whether each reached the protein target. */
export async function proteinWeek(db: SqlExecutor, endDate: string, target: number): Promise<{ date: string; reached: boolean }[]> {
  const from = addDays(endDate, -6)
  const rows = await db.all<{ d: string; p: number }>(
    'SELECT log_date AS d, SUM(protein_g) AS p FROM food_logs WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ? GROUP BY log_date',
    [from, endDate],
  )
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i)
    return { date, reached: target > 0 && (rows.find((r) => r.d === date)?.p ?? 0) >= target }
  })
}

/** Days with anything logged in a row up to `today`. An empty today doesn't break the run until the day is over. */
export async function loggingStreak(db: SqlExecutor, today: string): Promise<number> {
  const rows = await db.all<{ d: string }>(
    'SELECT DISTINCT log_date AS d FROM food_logs WHERE deleted_at IS NULL AND log_date <= ? ORDER BY log_date DESC LIMIT 400',
    [today],
  )
  const days = new Set(rows.map((r) => r.d))
  let day = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export async function logWeight(db: SqlExecutor, weightKg: number, logDate: string): Promise<void> {
  if (!(weightKg > 0)) throw new Error('Weight must be more than 0')
  const now = nowIso()
  await db.run('INSERT INTO body_metrics (id, created_at, updated_at, log_date, weight_kg) VALUES (?,?,?,?,?)', [newId(), now, now, logDate, weightKg])
}

export async function latestWeight(db: SqlExecutor): Promise<number | null> {
  const [r] = await db.all<{ weight_kg: number }>(
    'SELECT weight_kg FROM body_metrics WHERE deleted_at IS NULL AND weight_kg IS NOT NULL ORDER BY log_date DESC, rowid DESC LIMIT 1',
  )
  return r?.weight_kg ?? null
}
