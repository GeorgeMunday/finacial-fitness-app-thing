import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { createRoutine, customExercise, finishWorkout, logSet, personalRecords, previousSets, routineExercises, startWorkout } from '../training'

let db: SqlExecutor
let bench: string
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
  bench = await customExercise(db, 'Bench press', 'chest')
})

describe('training', () => {
  it('previous sets and PRs come from finished workouts', async () => {
    const r = await createRoutine(db, 'Push', [{ exerciseId: bench, targetSets: 3, targetReps: 5 }])
    expect(await routineExercises(db, r)).toMatchObject([{ exerciseId: bench, targetSets: 3, targetReps: 5, name: 'Bench press' }])
    const w = await startWorkout(db, r)
    await logSet(db, { workoutId: w, exerciseId: bench, reps: 1, weightKg: 80, isWarmup: true })
    for (let i = 0; i < 3; i++) await logSet(db, { workoutId: w, exerciseId: bench, reps: 5, weightKg: 60 })
    expect(await previousSets(db, bench)).toEqual([])
    await finishWorkout(db, w)
    expect(await previousSets(db, bench)).toEqual([{ reps: 5, weightKg: 60 }, { reps: 5, weightKg: 60 }, { reps: 5, weightKg: 60 }])
    expect(await personalRecords(db, bench)).toEqual({ heaviestKg: 60, bestEst1rmKg: 70 })
  })
  it('previousSets uses the latest finished workout', async () => {
    const w1 = await startWorkout(db)
    await logSet(db, { workoutId: w1, exerciseId: bench, reps: 5, weightKg: 50 })
    await finishWorkout(db, w1)
    const w2 = await startWorkout(db)
    await logSet(db, { workoutId: w2, exerciseId: bench, reps: 8, weightKg: 55 })
    await finishWorkout(db, w2)
    expect(await previousSets(db, bench)).toEqual([{ reps: 8, weightKg: 55 }])
  })
  it('no sets gives zero PRs', async () => {
    expect(await personalRecords(db, bench)).toEqual({ heaviestKg: 0, bestEst1rmKg: 0 })
  })
})
