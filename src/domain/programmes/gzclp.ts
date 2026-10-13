import { liftedKg } from './double'
import type { ProgressionKind } from './kindTypes'
import { incrementKg, roundKg, stepKg } from './rounding'
import type { DayExercise, PlannedSet } from './types'

type Stage = { sets: number; reps: number }
/** What a lift is asked to do at each stage (1-based in LiftState.stage). A miss moves it down this list. */
const T1: Stage[] = [{ sets: 5, reps: 3 }, { sets: 6, reps: 2 }, { sets: 10, reps: 1 }]
const T2: Stage[] = [{ sets: 3, reps: 10 }, { sets: 3, reps: 8 }, { sets: 3, reps: 6 }]
const T3: Stage = { sets: 3, reps: 15 }
const T3_TARGET_LAST_SET = 25
const RETEST_FRACTION = 0.85

const stageOf = (tier: DayExercise['tier'], stage: number): Stage =>
  tier === 't1' ? T1[Math.min(Math.max(stage, 1), 3) - 1] : tier === 't2' ? T2[Math.min(Math.max(stage, 1), 3) - 1] : T3

export const gzclpKind: ProgressionKind = {
  missAware: true,
  prescribe: (row, state) => {
    const { sets, reps } = stageOf(row.tier, state?.stage ?? 1)
    const amrapLast = row.tier !== 't2'
    return Array.from({ length: sets }, (_, i): PlannedSet => ({
      reps, minReps: reps, maxReps: reps, weightKg: state?.weightKg ?? 0, amrap: amrapLast && i === sets - 1,
    }))
  },
  evaluate: ({ row, state, sets, prescribed, unit, lower, decision }) => {
    const inc = incrementKg(row, lower, unit)
    if (row.tier === 't3') {
      if (sets.length < prescribed) return { state, result: 'incomplete' }
      if (sets[sets.length - 1].reps >= T3_TARGET_LAST_SET) {
        const weightKg = roundKg(liftedKg(sets, state.weightKg) + inc, unit)
        return { state: { ...state, weightKg, stageStartKg: weightKg }, result: 'progressed' }
      }
      return { state, result: 'held' }
    }
    const { reps } = stageOf(row.tier, state.stage)
    const repMiss = sets.some((s) => s.reps < reps)
    const short = sets.length < prescribed
    if (!repMiss && !short) {
      const lifted = liftedKg(sets, state.weightKg)
      const weightKg = roundKg(lifted + inc, unit)
      // At stage 1 remember the weight just lifted, so a later reset starts from where 3×10 / 5×3 last worked.
      return { state: { ...state, weightKg, stageStartKg: state.stage === 1 ? lifted : state.stageStartKg }, result: 'progressed' }
    }
    if (!repMiss && decision !== 'miss') return { state, result: 'incomplete' }
    const last = state.stage >= 3
    if (!last) {
      return { state: { ...state, stage: state.stage + 1, stageStartKg: state.stage === 1 ? state.weightKg : state.stageStartKg }, result: 'stage_change' }
    }
    if (row.tier === 't1') {
      const weightKg = roundKg(state.weightKg * RETEST_FRACTION, unit)
      return { state: { ...state, weightKg, stage: 1, stageStartKg: weightKg }, result: 'retest' }
    }
    const weightKg = roundKg(state.stageStartKg + 2 * stepKg(unit), unit)
    return { state: { ...state, weightKg, stage: 1, stageStartKg: weightKg }, result: 'reset' }
  },
}
