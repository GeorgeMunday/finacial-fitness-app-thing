import { plainSets, type ProgressionKind } from './kindTypes'
import { incrementKg, roundKg } from './rounding'

/** The weight a lift was really done at: the lightest of its sets, snapping to the stored weight to ignore float drift. */
export function liftedKg(sets: { weightKg: number }[], stored: number): number {
  const lightest = Math.min(...sets.map((s) => s.weightKg))
  return Math.abs(lightest - stored) < 0.05 ? stored : lightest
}

/** Double progression: add weight once every set reaches the top of its rep range. */
export const doubleKind: ProgressionKind = {
  missAware: false,
  prescribe: (row, state) => plainSets(row, state?.weightKg ?? 0),
  evaluate: ({ row, state, sets, prescribed, unit, lower }) => {
    if (sets.length < prescribed) return { state, result: 'incomplete' }
    if (sets.every((s) => s.reps >= row.repMax)) {
      const weightKg = roundKg(liftedKg(sets, state.weightKg) + incrementKg(row, lower, unit), unit)
      return { state: { ...state, weightKg, stageStartKg: weightKg }, result: 'progressed' }
    }
    return { state, result: 'held' }
  },
}
