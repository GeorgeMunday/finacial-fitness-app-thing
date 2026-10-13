// These limits MUST be reviewed by a registered dietitian before public launch.
import type { Sex } from '../db/types'
import { daysBetween } from './dates'

export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, unspecified: 1500 }
export const MAX_WEEKLY_LOSS_FRACTION = 0.01

export function clampTarget(requestedKcal: number, sex: Sex): { kcal: number; clamped: boolean } {
  const floor = KCAL_FLOOR[sex]
  return requestedKcal < floor ? { kcal: floor, clamped: true } : { kcal: Math.round(requestedKcal), clamped: false }
}

export function maxWeeklyLossKg(weightKg: number): number {
  return Math.round(weightKg * MAX_WEEKLY_LOSS_FRACTION * 100) / 100
}

export function goalWeightWarning(goalKg: number, heightCm: number): boolean {
  const m = heightCm / 100
  return goalKg / (m * m) < 18.5
}

/** True when 3+ consecutive logged days are under the floor. Days with no logs break the run. */
export function lowIntakeStreak(totalsByDate: { logDate: string; kcal: number }[], sex: Sex): boolean {
  const floor = KCAL_FLOOR[sex]
  const days = [...totalsByDate].sort((a, b) => a.logDate.localeCompare(b.logDate))
  let run = 0
  for (let i = 0; i < days.length; i++) {
    const consecutive = i > 0 && daysBetween(days[i - 1].logDate, days[i].logDate) === 1
    if (days[i].kcal > 0 && days[i].kcal < floor) run = consecutive ? run + 1 : 1
    else run = 0
    if (run >= 3) return true
  }
  return false
}

export const SUPPORT_MESSAGE =
  "Looks like you've been eating quite little lately. If food or your body feels hard to think about, you don't have to handle it alone. " +
  'Beat, the UK eating disorder charity, offers free, confidential support at beateatingdisorders.org.uk.'
