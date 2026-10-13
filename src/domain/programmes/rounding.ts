import { toKg, type WeightUnit } from '../units'

const KG_STEP = 2.5
const LB_PER_KG = 1 / toKg(1, 'lb')
const LOWER = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'lower back', 'adductors', 'abductors'])

/** One plate jump: 2.5 kg, or 5 lb for pound users (returned in kg). */
export const stepKg = (unit: WeightUnit): number => (unit === 'kg' ? KG_STEP : toKg(5, 'lb'))

/** Nearest 2.5 kg, or nearest 5 lb. */
export function roundKg(kg: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(kg / KG_STEP) * KG_STEP
  return toKg(Math.round((kg * LB_PER_KG) / 5) * 5, 'lb')
}

export const isLowerBody = (primaryMuscle: string | null): boolean => !!primaryMuscle && LOWER.has(primaryMuscle)

/**
 * The jump after a successful session, in kg. A row's own `incrementKg` is written in 2.5 kg steps (2.5 or 5) and is
 * converted to the same number of steps for pound users. Otherwise one step for upper body, two for lower body.
 */
export function incrementKg(row: { incrementKg: number | null }, lower: boolean, unit: WeightUnit): number {
  const steps = row.incrementKg != null ? Math.max(1, Math.round(row.incrementKg / KG_STEP)) : lower ? 2 : 1
  return steps * stepKg(unit)
}
