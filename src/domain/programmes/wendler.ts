import type { ProgressionKind } from './kindTypes'
import { incrementKg, roundKg } from './rounding'
import type { PlannedSet, ProgressionOutcome } from './types'

const WEEKS_PER_CYCLE = 3

/**
 * 5/3/1: weights come from each lift's training max and the week of the cycle; nothing changes session to session.
 * After the last day of a week the cycle moves on, and after week 3 each training max goes up once.
 */
export const wendlerKind: ProgressionKind = {
  missAware: false,
  prescribe: (row, state, ctx) => {
    if (row.tier === 'assist') {
      return Array.from({ length: row.sets }, (): PlannedSet => ({ reps: row.repMin, minReps: row.repMin, maxReps: row.repMax, weightKg: 0, amrap: false }))
    }
    const tm = state?.trainingMaxKg ?? state?.weightKg ?? 0
    const weightKg = roundKg((tm * (row.percent ?? 0)) / 100, ctx.unit)
    return Array.from({ length: row.sets }, (): PlannedSet => ({
      reps: row.repMin, minReps: row.repMin, maxReps: row.repMax, weightKg, amrap: row.isAmrap,
    }))
  },
  evaluate: ({ state }) => ({ state, result: 'held' }),
  endOfWorkout: ({ progress, finishedPosition, days, unit, lowerByLift, names }) => {
    if (finishedPosition !== days - 1) return { progress, outcomes: [] }
    if (progress.cycleWeek < WEEKS_PER_CYCLE) return { progress: { ...progress, cycleWeek: progress.cycleWeek + 1 }, outcomes: [] }
    const lifts = { ...progress.lifts }
    const outcomes: ProgressionOutcome[] = []
    for (const [key, s] of Object.entries(lifts)) {
      if (s.trainingMaxKg === undefined) continue
      const to = roundKg(s.trainingMaxKg + incrementKg({ incrementKg: null }, lowerByLift[key] ?? false, unit), unit)
      lifts[key] = { ...s, trainingMaxKg: to, weightKg: to, stageStartKg: to }
      outcomes.push({ liftKey: key, exerciseId: names[key]?.exerciseId ?? '', name: names[key]?.name ?? key, result: 'cycle_up', fromKg: s.trainingMaxKg, toKg: to })
    }
    return { progress: { ...progress, cycleWeek: 1, lifts }, outcomes }
  },
}
