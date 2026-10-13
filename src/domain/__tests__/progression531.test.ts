import { beforeEach, describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, MON, OHP, SQUAT, begin, dayOf, doWorkout, exId, liftState, reps } from '../../../test/programmeHelpers'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { updateSettings } from '../../state/settings'
import { activeProgramme, getProgramme } from '../programmes/catalog'
import { nextWorkout, suggestWeights } from '../programmes/plan'
import { applyProgression } from '../programmes/progression'
import { estimateTrainingMax, startProgramme } from '../programmes/start'
import { finishWorkout, logSet, startWorkout } from '../training'
import { toKg } from '../units'

let db: SqlExecutor
const KEY = '531-beginners'
beforeEach(async () => {
  db = await seededDb()
})
const day = (n: number) => dayOf(db, KEY, `Day ${n}`)
const weekPlan = async (week: number, tm = 100) => {
  await begin(db, KEY, { [SQUAT]: tm, [BENCH]: tm, [DEADLIFT]: tm, [OHP]: tm })
  await db.run('UPDATE programme_progress SET cycle_week = ?', [week])
  return suggestWeights(db, await day(1))
}
const shape = (sets: { weightKg: number; reps: number; amrap: boolean }[]) => sets.map((s) => [s.weightKg, s.reps, s.amrap])

describe('5/3/1 week percentages', () => {
  it('week 1: 65/75/85 × 5, 5, 5+ and 5×5 at 65', async () => {
    const [main, fsl] = await weekPlan(1)
    expect(main.name).toBe(SQUAT)
    expect(shape(main.sets)).toEqual([[65, 5, false], [75, 5, false], [85, 5, true]])
    expect(fsl.tier).toBe('fsl')
    expect(shape(fsl.sets)).toEqual(Array.from({ length: 5 }, () => [65, 5, false]))
  })
  it('week 2: 70/80/90 × 3, 3, 3+ and 5×5 at 70', async () => {
    const [main, fsl] = await weekPlan(2)
    expect(shape(main.sets)).toEqual([[70, 3, false], [80, 3, false], [90, 3, true]])
    expect(shape(fsl.sets)[0]).toEqual([70, 5, false])
  })
  it('week 3: 75/85/95 × 5, 3, 1+ and 5×5 at 75', async () => {
    const [main, fsl] = await weekPlan(3)
    expect(shape(main.sets)).toEqual([[75, 5, false], [85, 3, false], [95, 1, true]])
    expect(shape(fsl.sets)[0]).toEqual([75, 5, false])
  })
  it('rounds to 2.5 kg: a training max of 87.5 gives 57.5, 65 and 75', async () => {
    const [main] = await weekPlan(1, 87.5)
    expect(main.sets.map((s) => s.weightKg)).toEqual([57.5, 65, 75])
  })
  it('rounds to 5 lb for pound users: 225 lb gives 145, 170 and 190 lb', async () => {
    await updateSettings(db, { weightUnit: 'lb' })
    const [main] = await weekPlan(1, toKg(225, 'lb'))
    main.sets.forEach((s, i) => expect(s.weightKg).toBeCloseTo(toKg([145, 170, 190][i], 'lb'), 6))
  })
})

describe('5/3/1 days', () => {
  it('Day 1 is Squat then Bench, each followed by 5×5 back-off sets, then three assistance slots', async () => {
    await begin(db, KEY)
    const plan = await suggestWeights(db, await day(1))
    expect(plan.map((p) => [p.name, p.tier])).toEqual([
      [SQUAT, 'm531'], [SQUAT, 'fsl'], [BENCH, 'm531'], [BENCH, 'fsl'], ['Pushups', 'assist'], ['Chin-Up', 'assist'], ['Barbell Walking Lunge', 'assist'],
    ])
    expect(plan[4].sets).toHaveLength(5)
    expect(plan[4].sets[0].reps).toBe(10)
    expect(plan[4].note).toMatch(/50–100/)
  })
  it('Day 2 is Deadlift then Overhead press and Day 3 is Bench then Squat', async () => {
    await begin(db, KEY)
    expect((await suggestWeights(db, await day(2))).filter((p) => p.tier === 'm531').map((p) => p.name)).toEqual([DEADLIFT, OHP])
    expect((await suggestWeights(db, await day(3))).filter((p) => p.tier === 'm531').map((p) => p.name)).toEqual([BENCH, SQUAT])
  })
  it('assistance work starts from the last weight logged for it', async () => {
    await begin(db, KEY)
    const w = await startWorkout(db)
    await logSet(db, { workoutId: w, exerciseId: await exId(db, 'Barbell Walking Lunge'), reps: 10, weightKg: 20 })
    await finishWorkout(db, w)
    const lunge = (await suggestWeights(db, await day(1))).find((p) => p.name === 'Barbell Walking Lunge')!
    expect(lunge.sets[0].weightKg).toBe(20)
  })
})

describe('5/3/1 cycles', () => {
  const finishNext = async () => {
    const n = (await nextWorkout(db, MON))!
    await applyProgression(db, await doWorkout(db, n.dayId, {}))
    return n
  }
  const tm = async () => Object.fromEntries(Object.entries((await activeProgramme(db))!.progress.lifts).map(([k, v]) => [k, v.trainingMaxKg]))
  it('finishing all three days of a week moves to the next week', async () => {
    await begin(db, KEY, { [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    for (let i = 0; i < 3; i++) await finishNext()
    expect((await nextWorkout(db, MON))).toMatchObject({ cycleWeek: 2, dayName: 'Day 1' })
    expect((await activeProgramme(db))!.progress.cycleWeek).toBe(2)
  })
  it('after week 3 the training maxes rise once: +5 kg lower body, +2.5 kg upper body', async () => {
    await begin(db, KEY, { [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    for (let i = 0; i < 9; i++) await finishNext()
    expect(await tm()).toEqual({ [SQUAT]: 105, [BENCH]: 62.5, [DEADLIFT]: 125, [OHP]: 42.5 })
    expect((await activeProgramme(db))!.progress.cycleWeek).toBe(1)
  })
  it('the cycle is reported as cycle_up outcomes, one per lift', async () => {
    await begin(db, KEY, { [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    for (let i = 0; i < 8; i++) await finishNext()
    const n = (await nextWorkout(db, MON))!
    const out = await applyProgression(db, await doWorkout(db, n.dayId, {}))
    expect(out.filter((o) => o.result === 'cycle_up').map((o) => [o.name, o.fromKg, o.toKg]).sort()).toEqual(
      [[BENCH, 60, 62.5], [DEADLIFT, 120, 125], [OHP, 40, 42.5], [SQUAT, 100, 105]].sort())
  })
  it('applying the last workout twice does not raise the maxes twice', async () => {
    await begin(db, KEY, { [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    for (let i = 0; i < 8; i++) await finishNext()
    const n = (await nextWorkout(db, MON))!
    const w = await doWorkout(db, n.dayId, {})
    await applyProgression(db, w)
    await applyProgression(db, w)
    expect((await tm())[SQUAT]).toBe(105)
  })
  it('AMRAP sets with few reps change nothing', async () => {
    await begin(db, KEY, { [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    await applyProgression(db, await doWorkout(db, await day(1), { [SQUAT]: [[5, 65], [5, 75], [1, 85]], [BENCH]: reps(5, 3, 40) }))
    expect(await tm()).toEqual({ [SQUAT]: 100, [BENCH]: 60, [DEADLIFT]: 120, [OHP]: 40 })
    expect(await liftState(db, SQUAT)).toMatchObject({ trainingMaxKg: 100, weightKg: 100 })
  })
})

describe('training max estimate', () => {
  it('is null with nothing logged', async () => {
    expect(await estimateTrainingMax(db, await exId(db, SQUAT))).toBeNull()
  })
  it('is 90% of the best estimated one-rep max, rounded to 2.5 kg', async () => {
    const w = await startWorkout(db)
    await logSet(db, { workoutId: w, exerciseId: await exId(db, SQUAT), reps: 5, weightKg: 100 })
    await logSet(db, { workoutId: w, exerciseId: await exId(db, SQUAT), reps: 20, weightKg: 20, isWarmup: true })
    expect(await estimateTrainingMax(db, await exId(db, SQUAT))).toBe(105)
  })
  it('starting uses the estimate where there is one and 40/40/40/30 otherwise', async () => {
    const w = await startWorkout(db)
    await logSet(db, { workoutId: w, exerciseId: await exId(db, SQUAT), reps: 5, weightKg: 100 })
    await startProgramme(db, (await getProgramme(db, KEY))!.id, { onDate: MON, startKg: { [BENCH]: 55 } })
    expect(await tm()).toEqual({ [SQUAT]: 105, [BENCH]: 55, [DEADLIFT]: 40, [OHP]: 30 })
  })
  async function tm() {
    return Object.fromEntries(Object.entries((await activeProgramme(db))!.progress.lifts).map(([k, v]) => [k, v.trainingMaxKg]))
  }
})
