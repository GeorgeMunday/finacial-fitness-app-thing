import { beforeEach, describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, OHP, SQUAT, begin, dayOf, doWorkout, liftState, reps } from '../../../test/programmeHelpers'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { applyProgression, progressionShortfalls } from '../programmes/progression'

let db: SqlExecutor
const ROW = 'Bent Over Barbell Row'
beforeEach(async () => {
  db = await seededDb()
  await begin(db, 'full-body-beginner', {
    [`${SQUAT}|main`]: 60, [`${BENCH}|main`]: 40, [`${ROW}|main`]: 40, [`${OHP}|main`]: 30, [`${DEADLIFT}|main`]: 80,
  })
})
const A = () => dayOf(db, 'full-body-beginner', 'Workout A')
const B = () => dayOf(db, 'full-body-beginner', 'Workout B')
const squat = () => liftState(db, `${SQUAT}|main`)
const goodA = { [SQUAT]: reps(5, 3, 60), [BENCH]: reps(5, 3, 40), [ROW]: reps(5, 3, 40) }

describe('linear progression', () => {
  it('adds 2.5 kg after a good session, 5 kg on the deadlift, and never changes chin-ups', async () => {
    await applyProgression(db, await doWorkout(db, await A(), { ...goodA, 'Chin-Up': reps(6, 3, 0) }))
    await applyProgression(db, await doWorkout(db, await B(), { [SQUAT]: reps(5, 3, 62.5), [OHP]: reps(5, 3, 30), [DEADLIFT]: reps(5, 1, 80) }))
    expect((await squat()).weightKg).toBe(65)
    expect((await liftState(db, `${BENCH}|main`)).weightKg).toBe(42.5)
    expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(85)
    expect(await liftState(db, 'Chin-Up|bw')).toBeUndefined()
  })
  it('a 4-rep set is a miss: the failure count goes up and the weight holds', async () => {
    const out = await applyProgression(db, await doWorkout(db, await A(), { ...goodA, [SQUAT]: [[5, 60], [5, 60], [4, 60]] }))
    expect(out.find((o) => o.name === SQUAT)!.result).toBe('held')
    expect(await squat()).toMatchObject({ weightKg: 60, fails: 1 })
  })
  it('three misses in three workouts deload 60 kg to 55 kg and reset the count', async () => {
    const miss = { ...goodA, [SQUAT]: [[5, 60], [5, 60], [4, 60]] as [number, number][] }
    await applyProgression(db, await doWorkout(db, await A(), miss))
    await applyProgression(db, await doWorkout(db, await A(), miss))
    const out = await applyProgression(db, await doWorkout(db, await A(), miss))
    expect(out.find((o) => o.name === SQUAT)).toMatchObject({ result: 'deload', fromKg: 60, toKg: 55 })
    expect(await squat()).toMatchObject({ weightKg: 55, fails: 0 })
  })
  it('a success resets the failure count', async () => {
    await applyProgression(db, await doWorkout(db, await A(), { ...goodA, [SQUAT]: [[5, 60], [5, 60], [4, 60]] }))
    await applyProgression(db, await doWorkout(db, await A(), goodA))
    expect(await squat()).toMatchObject({ weightKg: 62.5, fails: 0 })
  })
  it('too few sets, with the default decision, is incomplete and not counted', async () => {
    const out = await applyProgression(db, await doWorkout(db, await A(), { ...goodA, [SQUAT]: reps(5, 2, 60) }))
    expect(out.find((o) => o.name === SQUAT)!.result).toBe('incomplete')
    expect(await squat()).toMatchObject({ weightKg: 60, fails: 0 })
  })
  it('too few sets counts as a miss when the user says so', async () => {
    const w = await doWorkout(db, await A(), { ...goodA, [SQUAT]: reps(5, 2, 60) })
    await applyProgression(db, w, { [`${SQUAT}|main`]: 'miss' })
    expect(await squat()).toMatchObject({ weightKg: 60, fails: 1 })
  })
})

describe('progressionShortfalls', () => {
  it('lists a lift with 2 of 3 sets logged that all hit their reps', async () => {
    const w = await doWorkout(db, await A(), { ...goodA, [SQUAT]: reps(5, 2, 60) })
    expect(await progressionShortfalls(db, w)).toEqual([
      expect.objectContaining({ liftKey: `${SQUAT}|main`, name: SQUAT, logged: 2, prescribed: 3 }),
    ])
  })
  it('leaves out lifts with a rep miss, full lifts, untouched lifts and chin-ups', async () => {
    const w = await doWorkout(db, await A(), { [SQUAT]: [[5, 60], [4, 60]], [BENCH]: reps(5, 3, 40), 'Chin-Up': reps(5, 1, 0) })
    expect(await progressionShortfalls(db, w)).toEqual([])
  })
  it('never lists double-progression lifts', async () => {
    await begin(db, 'ppl')
    const w = await doWorkout(db, await dayOf(db, 'ppl', 'Push day'), { [BENCH]: reps(8, 2, 20) })
    expect(await progressionShortfalls(db, w)).toEqual([])
  })
})
