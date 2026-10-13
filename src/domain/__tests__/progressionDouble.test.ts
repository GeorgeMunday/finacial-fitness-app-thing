import { beforeEach, describe, expect, it } from 'vitest'
import { BENCH, DEADLIFT, MON, SQUAT, begin, exId, dayOf, doWorkout, liftState, reps } from '../../../test/programmeHelpers'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { updateSettings } from '../../state/settings'
import { applyProgression } from '../programmes/progression'
import { nextWorkout, startProgrammeWorkout } from '../programmes/plan'
import { finishWorkout, logSet, startWorkout } from '../training'
import { toKg } from '../units'

let db: SqlExecutor
beforeEach(async () => {
  db = await seededDb()
  await begin(db, 'ppl', { [`${BENCH}|main`]: 60, [`${SQUAT}|main`]: 100, [`${DEADLIFT}|main`]: 100 })
})
const push = () => dayOf(db, 'ppl', 'Push day')
const bench = () => liftState(db, `${BENCH}|main`)

describe('double progression', () => {
  it('all four bench sets at the top of the range adds 2.5 kg', async () => {
    const w = await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) })
    const out = await applyProgression(db, w)
    expect((await bench()).weightKg).toBe(62.5)
    expect(out.find((o) => o.name === BENCH)).toMatchObject({ result: 'progressed', fromKg: 60, toKg: 62.5 })
  })
  it('lower-body lifts add 5 kg', async () => {
    const legs = await dayOf(db, 'ppl', 'Legs day')
    const pull = await dayOf(db, 'ppl', 'Pull day')
    await applyProgression(db, await doWorkout(db, legs, { [SQUAT]: reps(8, 4, 100) }))
    await applyProgression(db, await doWorkout(db, pull, { [DEADLIFT]: reps(5, 3, 100) }))
    expect((await liftState(db, `${SQUAT}|main`)).weightKg).toBe(105)
    expect((await liftState(db, `${DEADLIFT}|main`)).weightKg).toBe(105)
  })
  it('one set short of the top holds the weight', async () => {
    await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: [[8, 60], [8, 60], [8, 60], [7, 60]] }))
    expect((await bench()).weightKg).toBe(60)
  })
  it('three of four sets logged is incomplete and unchanged', async () => {
    const out = await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: reps(8, 3, 60) }))
    expect(out.find((o) => o.name === BENCH)!.result).toBe('incomplete')
    expect((await bench()).weightKg).toBe(60)
  })
  it('a lift with no sets is not_done', async () => {
    const out = await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) }))
    expect(out.find((o) => o.name === 'Triceps Pushdown')!.result).toBe('not_done')
  })
  it('extra sets are ignored', async () => {
    await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: [...reps(8, 4, 60), [3, 60]] }))
    expect((await bench()).weightKg).toBe(62.5)
  })
  it('warm-ups do not count', async () => {
    await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) }, { warmups: { [BENCH]: [[3, 40]] } }))
    expect((await bench()).weightKg).toBe(62.5)
  })
  it('progresses from the lightest weight actually lifted', async () => {
    await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 55) }))
    expect((await bench()).weightKg).toBe(57.5)
  })
  it('applying twice changes nothing the second time', async () => {
    const w = await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) })
    expect(await applyProgression(db, w)).not.toEqual([])
    expect(await applyProgression(db, w)).toEqual([])
    expect((await bench()).weightKg).toBe(62.5)
  })
  it('two taps at once apply it only once', async () => {
    const w = await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) })
    await Promise.all([applyProgression(db, w), applyProgression(db, w)])
    expect((await bench()).weightKg).toBe(62.5)
  })
  it('an unfinished workout changes nothing', async () => {
    const w = await doWorkout(db, await push(), { [BENCH]: reps(8, 4, 60) }, { finish: false })
    expect(await applyProgression(db, w)).toEqual([])
    expect((await bench()).weightKg).toBe(60)
    expect((await nextWorkout(db, MON))!.dayName).toBe('Push day')
  })
  it('a routine workout (no programme day) is ignored', async () => {
    const id = await startWorkout(db)
    await finishWorkout(db, id)
    expect(await applyProgression(db, id)).toEqual([])
  })
  it('a swapped exercise leaves the prescribed lift untouched', async () => {
    const w = await startProgrammeWorkout(db, await push(), MON)
    const other = await exId(db, 'Incline Dumbbell Press')
    for (let i = 0; i < 4; i++) await logSet(db, { workoutId: w, exerciseId: other, reps: 8, weightKg: 60 })
    await finishWorkout(db, w)
    const out = await applyProgression(db, w)
    expect(out.find((o) => o.name === BENCH)!.result).toBe('not_done')
    expect((await bench()).weightKg).toBe(60)
  })
  it('pound users: 135 lb benches go to 140 lb and 225 lb squats to 235 lb, with no false miss from rounding', async () => {
    await updateSettings(db, { weightUnit: 'lb' })
    await begin(db, 'ppl', { [`${BENCH}|main`]: toKg(135, 'lb'), [`${SQUAT}|main`]: toKg(225, 'lb') })
    await applyProgression(db, await doWorkout(db, await push(), { [BENCH]: reps(8, 4, toKg(135, 'lb')) }))
    await applyProgression(db, await doWorkout(db, await dayOf(db, 'ppl', 'Legs day'), { [SQUAT]: reps(8, 4, toKg(225, 'lb')) }))
    expect((await bench()).weightKg).toBeCloseTo(toKg(140, 'lb'), 6)
    expect((await liftState(db, `${SQUAT}|main`)).weightKg).toBeCloseTo(toKg(235, 'lb'), 6)
  })
})

describe('rotation', () => {
  it('Push → Pull → Legs → Push, wrapping', async () => {
    for (const expected of ['Pull day', 'Legs day', 'Push day']) {
      const n = (await nextWorkout(db, MON))!
      await applyProgression(db, await doWorkout(db, n.dayId, {}))
      expect((await nextWorkout(db, MON))!.dayName).toBe(expected)
    }
  })
  it('doneToday is true after finishing today', async () => {
    const n = (await nextWorkout(db, MON))!
    await applyProgression(db, await doWorkout(db, n.dayId, {}))
    expect(await nextWorkout(db, MON)).toMatchObject({ doneToday: true, doneThisWeek: 1 })
    expect((await nextWorkout(db, '2026-10-13'))!.doneToday).toBe(false)
  })
  it('weeks run Monday to Sunday', async () => {
    const days = ['Push day', 'Pull day', 'Legs day']
    const dates = ['2026-10-11', '2026-10-12', '2026-10-18'] // Sun (last week), Mon, Sun
    for (const [i, date] of dates.entries()) await applyProgression(db, await doWorkout(db, await dayOf(db, 'ppl', days[i]), {}, { date }))
    expect((await nextWorkout(db, '2026-10-14'))!.doneThisWeek).toBe(2)
    expect((await nextWorkout(db, '2026-10-19'))!.doneThisWeek).toBe(0)
  })
})
