import { beforeEach, describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, OHP, SQUAT, begin, dayOf, doWorkout, liftState, reps } from '../../../test/programmeHelpers'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { updateSettings } from '../../state/settings'
import { nextWorkout, suggestWeights } from '../programmes/plan'
import { applyProgression, progressionShortfalls } from '../programmes/progression'
import { toKg } from '../units'

const PULLDOWN = 'Wide-Grip Lat Pulldown'
const DBROW = 'One-Arm Dumbbell Row'
let db: SqlExecutor
beforeEach(async () => {
  db = await seededDb()
  await begin(db, 'gzclp', {
    [`${SQUAT}|t1`]: 100, [`${BENCH}|t2`]: 60, [`${PULLDOWN}|t3`]: 40,
    [`${OHP}|t1`]: 40, [`${DEADLIFT}|t2`]: 100, [`${DBROW}|t3`]: 20,
  })
})
const day = (n: number) => dayOf(db, 'gzclp', `Day ${n}`)
const squatT1 = () => liftState(db, `${SQUAT}|t1`)
const benchT2 = () => liftState(db, `${BENCH}|t2`)
const rest = (n: number, kg: number) => ({ [BENCH]: reps(10, 3, 60), [PULLDOWN]: reps(15, 3, kg) })
const day1 = (squat: [number, number][]) => ({ [SQUAT]: squat, ...rest(0, 40) })

describe('GZCLP prescriptions', () => {
  it('Day 1 is a 5×3 squat (last set AMRAP), a 3×10 bench and a 3×15 pulldown (last set AMRAP)', async () => {
    const [squat, bench, pull] = await suggestWeights(db, await day(1))
    expect(squat.sets).toHaveLength(5)
    expect(squat.sets.map((s) => [s.reps, s.weightKg, s.amrap])).toEqual([[3, 100, false], [3, 100, false], [3, 100, false], [3, 100, false], [3, 100, true]])
    expect(bench.sets).toHaveLength(3)
    expect(bench.sets[0]).toMatchObject({ reps: 10, weightKg: 60 })
    expect(bench.sets.some((s) => s.amrap)).toBe(false)
    expect(pull.sets).toHaveLength(3)
    expect(pull.sets.map((s) => [s.reps, s.weightKg, s.amrap])).toEqual([[15, 40, false], [15, 40, false], [15, 40, true]])
  })
})

describe('T1', () => {
  it('3,3,3,3,5 adds weight and stays on 5×3', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, 100), [5, 100]])))
    expect(await squatT1()).toMatchObject({ weightKg: 105, stage: 1 })
  })
  it('a missed last set moves to 6×2 at the same weight', async () => {
    const out = await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, 100), [2, 100]])))
    expect(out.find((o) => o.name === SQUAT)).toMatchObject({ result: 'stage_change', fromKg: 100, toKg: 100 })
    expect(await squatT1()).toMatchObject({ weightKg: 100, stage: 2 })
    const [squat] = await suggestWeights(db, await day(1))
    expect(squat.sets).toHaveLength(6)
    expect(squat.sets.every((s) => s.minReps === 2)).toBe(true)
    expect(squat.sets[5].amrap).toBe(true)
  })
  it('a second miss moves to 10×1', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, 100), [2, 100]])))
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(2, 5, 100), [1, 100]])))
    expect(await squatT1()).toMatchObject({ weightKg: 100, stage: 3 })
    const [squat] = await suggestWeights(db, await day(1))
    expect(squat.sets).toHaveLength(10)
    expect(squat.sets.every((s) => s.minReps === 1)).toBe(true)
  })
  it('succeeding at 6×2 adds weight and stays on 6×2', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, 100), [2, 100]])))
    await applyProgression(db, await doWorkout(db, await day(1), day1(reps(2, 6, 100))))
    expect(await squatT1()).toMatchObject({ weightKg: 105, stage: 2 })
  })
  it('a miss at 10×1 is a retest: back to 5×3 at 85% of the weight', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, 100), [2, 100]])))
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(2, 5, 100), [1, 100]])))
    const w = await doWorkout(db, await day(1), day1(reps(1, 9, 100)))
    const out = await applyProgression(db, w, { [`${SQUAT}|t1`]: 'miss' })
    expect(out.find((o) => o.name === SQUAT)).toMatchObject({ result: 'retest', fromKg: 100, toKg: 85 })
    expect(await squatT1()).toMatchObject({ weightKg: 85, stage: 1, stageStartKg: 85 })
  })
  it('a retest rounds to 5 lb for pound users', async () => {
    await updateSettings(db, { weightUnit: 'lb' })
    await begin(db, 'gzclp', { [`${SQUAT}|t1`]: toKg(225, 'lb') })
    const kg = toKg(225, 'lb')
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(3, 4, kg), [2, kg]])))
    await applyProgression(db, await doWorkout(db, await day(1), day1([...reps(2, 5, kg), [1, kg]])))
    await applyProgression(db, await doWorkout(db, await day(1), day1(reps(1, 9, kg))), { [`${SQUAT}|t1`]: 'miss' })
    expect((await squatT1()).weightKg).toBeCloseTo(toKg(190, 'lb'), 6) // 0.85 × 225 = 191.25 → 190
  })
})

describe('T2', () => {
  it('3×10 adds weight', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1(reps(3, 5, 100))))
    expect(await benchT2()).toMatchObject({ weightKg: 62.5, stage: 1 })
  })
  it('misses go 3×10 → 3×8 → 3×6, then reset to the starting weight plus 5 kg', async () => {
    const miss = (n: number) => ({ [SQUAT]: reps(3, 5, 100), [BENCH]: [...reps(n, 2, 60), [n - 1, 60]] as [number, number][], [PULLDOWN]: reps(15, 3, 40) })
    await applyProgression(db, await doWorkout(db, await day(1), miss(10)))
    expect(await benchT2()).toMatchObject({ weightKg: 60, stage: 2 })
    expect((await suggestWeights(db, await day(1)))[1].sets.map((s) => s.minReps)).toEqual([8, 8, 8])
    await applyProgression(db, await doWorkout(db, await day(1), miss(8)))
    expect(await benchT2()).toMatchObject({ weightKg: 60, stage: 3 })
    expect((await suggestWeights(db, await day(1)))[1].sets.map((s) => s.minReps)).toEqual([6, 6, 6])
    const out = await applyProgression(db, await doWorkout(db, await day(1), miss(6)))
    expect(out.find((o) => o.name === BENCH)).toMatchObject({ result: 'reset', fromKg: 60, toKg: 65 })
    expect(await benchT2()).toMatchObject({ weightKg: 65, stage: 1, stageStartKg: 65 })
    expect((await suggestWeights(db, await day(1)))[1].sets.map((s) => s.minReps)).toEqual([10, 10, 10])
  })
})

describe('T3', () => {
  const T3 = (last: number): Record<string, [number, number][]> => ({ [PULLDOWN]: [[15, 40], [15, 40], [last, 40]] })
  it('adds weight when the last set reaches 25', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), T3(25)))
    expect((await liftState(db, `${PULLDOWN}|t3`)).weightKg).toBe(42.5)
  })
  it('holds at 24', async () => {
    const out = await applyProgression(db, await doWorkout(db, await day(1), T3(24)))
    expect(out.find((o) => o.name === PULLDOWN)!.result).toBe('held')
    expect((await liftState(db, `${PULLDOWN}|t3`)).weightKg).toBe(40)
  })
  it('too few sets is incomplete', async () => {
    const out = await applyProgression(db, await doWorkout(db, await day(1), { [PULLDOWN]: [[25, 40]] }))
    expect(out.find((o) => o.name === PULLDOWN)!.result).toBe('incomplete')
  })
})

describe('GZCLP structure', () => {
  it('Bench keeps separate states as T2 on Day 1 and T1 on Day 3', async () => {
    await applyProgression(db, await doWorkout(db, await day(1), day1(reps(3, 5, 100))))
    expect(await liftState(db, `${BENCH}|t1`)).toMatchObject({ weightKg: 20, stage: 1 })
    const d3 = await suggestWeights(db, await day(3))
    expect(d3[0].name).toBe(BENCH)
    expect(d3[0].sets).toHaveLength(5)
    expect(d3[0].sets[0].weightKg).toBe(20)
    expect((await benchT2()).weightKg).toBe(62.5)
  })
  it('finishing Day 4 wraps to Day 1', async () => {
    for (const n of [1, 2, 3, 4]) await applyProgression(db, await doWorkout(db, await day(n), {}))
    expect((await nextWorkout(db, '2026-10-12'))!.dayName).toBe('Day 1')
  })
  it('lists a 4-of-5 T1 shortfall; "miss" moves to the next stage and the default holds', async () => {
    const short = { [SQUAT]: reps(3, 4, 100) }
    const w = await doWorkout(db, await day(1), short)
    expect(await progressionShortfalls(db, w)).toEqual([expect.objectContaining({ liftKey: `${SQUAT}|t1`, logged: 4, prescribed: 5 })])
    await applyProgression(db, w)
    expect(await squatT1()).toMatchObject({ stage: 1, weightKg: 100 })
    const w2 = await doWorkout(db, await day(1), short)
    await applyProgression(db, w2, { [`${SQUAT}|t1`]: 'miss' })
    expect(await squatT1()).toMatchObject({ stage: 2, weightKg: 100 })
  })
  it('never lists a T3 shortfall', async () => {
    const w = await doWorkout(db, await day(1), { [PULLDOWN]: [[15, 40]] })
    expect((await progressionShortfalls(db, w)).map((s) => s.name)).not.toContain(PULLDOWN)
  })
})
