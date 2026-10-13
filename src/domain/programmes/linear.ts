import { liftedKg } from './double'
import { plainSets, type ProgressionKind } from './kindTypes'
import { incrementKg, roundKg } from './rounding'

const FAILS_BEFORE_DELOAD = 3

/** Linear progression: add weight after every successful session; three misses in a row mean a 10% deload. */
export const linearKind: ProgressionKind = {
  missAware: true,
  prescribe: (row, state) => plainSets(row, row.tier === 'bw' ? 0 : (state?.weightKg ?? 0)),
  evaluate: ({ row, state, sets, prescribed, unit, lower, decision }) => {
    const repMiss = sets.some((s) => s.reps < row.repMax)
    const short = sets.length < prescribed
    if (!repMiss && !short) {
      const weightKg = roundKg(liftedKg(sets, state.weightKg) + incrementKg(row, lower, unit), unit)
      return { state: { ...state, weightKg, stageStartKg: weightKg, fails: 0 }, result: 'progressed' }
    }
    if (!repMiss && decision !== 'miss') return { state, result: 'incomplete' }
    const fails = state.fails + 1
    if (fails >= FAILS_BEFORE_DELOAD) {
      const weightKg = roundKg(state.weightKg * 0.9, unit)
      return { state: { ...state, weightKg, stageStartKg: weightKg, fails: 0 }, result: 'deload' }
    }
    return { state: { ...state, fails }, result: 'held' }
  },
}
