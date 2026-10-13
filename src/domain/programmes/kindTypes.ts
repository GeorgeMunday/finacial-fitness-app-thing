import type { WeightUnit } from '../units'
import type { DayExercise, LiftState, PlannedSet, ProgressionOutcome, ProgressionResult, ProgrammeProgress } from './types'

export type EvaluateArgs = {
  row: DayExercise
  state: LiftState
  /** The first N working sets logged for the prescribed exercise (possibly fewer than N). */
  sets: { reps: number; weightKg: number }[]
  prescribed: number
  unit: WeightUnit
  lower: boolean
  decision: 'miss' | 'ignore'
}
export type LiftUpdate = { state: LiftState; result: ProgressionResult; note?: string }

export interface ProgressionKind {
  /** True when a missed session changes the lift's state, so a short lift (fewer sets than prescribed) needs asking about. */
  missAware: boolean
  prescribe(row: DayExercise, state: LiftState | undefined, ctx: { unit: WeightUnit; lower: boolean; cycleWeek: number }): PlannedSet[]
  evaluate(args: EvaluateArgs): LiftUpdate
  endOfWorkout?(args: {
    progress: ProgrammeProgress
    finishedPosition: number
    days: number
    unit: WeightUnit
    lowerByLift: Record<string, boolean>
    names: Record<string, { exerciseId: string; name: string }>
  }): { progress: ProgrammeProgress; outcomes: ProgressionOutcome[] }
}

/** The plain case: `sets` sets at the lift's weight, each prefilled with the bottom of the rep range. */
export function plainSets(row: DayExercise, weightKg: number): PlannedSet[] {
  return Array.from({ length: row.sets }, (_, i) => ({
    reps: row.repMin, minReps: row.repMin, maxReps: row.repMax, weightKg,
    amrap: row.tier === 'bw' ? true : row.isAmrap && i === row.sets - 1,
  }))
}

