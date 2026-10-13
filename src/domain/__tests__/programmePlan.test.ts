import { beforeEach, describe, expect, it } from 'vitest'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { updateSettings } from '../../state/settings'
import { activeProgramme, getProgramme, listProgrammes } from '../programmes/catalog'
import { incrementKg, isLowerBody, roundKg, stepKg } from '../programmes/rounding'
import { defaultStartKg, defaultTrainingMaxKg, programmeLifts, startProgramme } from '../programmes/start'
import { nextWorkout, startProgrammeWorkout, suggestWeights } from '../programmes/plan'
import { toKg } from '../units'

let db: SqlExecutor
const MON = '2026-10-12'
beforeEach(async () => {
  db = await seededDb()
})

const BENCH = 'Barbell Bench Press - Medium Grip'
const pid = async (key: string) => (await getProgramme(db, key))!.id
const dayId = async (key: string, name: string) => (await getProgramme(db, key))!.days.find((d) => d.name === name)!.id

describe('rounding', () => {
  it('rounds to the nearest 2.5 kg', () => {
    expect(roundKg(61, 'kg')).toBe(60)
    expect(roundKg(61.3, 'kg')).toBe(62.5)
  })
  it('rounds pound users to 5 lb', () => {
    expect(roundKg(toKg(137, 'lb'), 'lb')).toBeCloseTo(toKg(135, 'lb'), 9)
    expect(roundKg(toKg(138, 'lb'), 'lb')).toBeCloseTo(toKg(140, 'lb'), 9)
  })
  it('steps are 2.5 kg or 5 lb', () => {
    expect(stepKg('kg')).toBe(2.5)
    expect(stepKg('lb')).toBeCloseTo(toKg(5, 'lb'), 9)
  })
  it('increments: one step upper body, two lower body, explicit values win', () => {
    expect(incrementKg({ incrementKg: null }, false, 'kg')).toBe(2.5)
    expect(incrementKg({ incrementKg: null }, true, 'kg')).toBe(5)
    expect(incrementKg({ incrementKg: 2.5 }, true, 'kg')).toBe(2.5)
    expect(incrementKg({ incrementKg: 5 }, false, 'kg')).toBe(5)
    expect(incrementKg({ incrementKg: null }, false, 'lb')).toBeCloseTo(toKg(5, 'lb'), 9)
    expect(incrementKg({ incrementKg: null }, true, 'lb')).toBeCloseTo(toKg(10, 'lb'), 9)
    expect(incrementKg({ incrementKg: 2.5 }, false, 'lb')).toBeCloseTo(toKg(5, 'lb'), 9)
    expect(incrementKg({ incrementKg: 5 }, false, 'lb')).toBeCloseTo(toKg(10, 'lb'), 9)
  })
  it('knows which muscles are lower body', () => {
    for (const m of ['quadriceps', 'hamstrings', 'glutes', 'calves', 'lower back', 'adductors', 'abductors']) expect(isLowerBody(m)).toBe(true)
    for (const m of ['chest', 'lats', 'shoulders', null]) expect(isLowerBody(m)).toBe(false)
  })
})

describe('defaults', () => {
  it('uses light empty-bar starting weights', () => {
    expect(defaultStartKg('Barbell Squat', 'barbell')).toBe(20)
    expect(defaultStartKg('Side Lateral Raise', 'dumbbell')).toBe(3)
    expect(defaultStartKg('Dumbbell Bicep Curl', 'dumbbell')).toBe(6)
    expect(defaultStartKg('Chin-Up', 'body only')).toBe(0)
    expect(defaultStartKg('Wide-Grip Lat Pulldown', 'cable')).toBe(25)
    expect(defaultStartKg('Face Pull', 'cable')).toBe(10)
    expect(defaultStartKg('Leg Press', 'machine')).toBe(40)
    expect(defaultStartKg('Standing Calf Raises', 'machine')).toBe(30)
    expect(defaultStartKg('EZ-Bar Skullcrusher', 'e-z curl bar')).toBe(10)
    expect(defaultStartKg('Goblet Squat', 'kettlebells')).toBe(8)
  })
  it('training maxes default to 40 kg, 30 kg for the overhead press', () => {
    expect(defaultTrainingMaxKg('Barbell Squat')).toBe(40)
    expect(defaultTrainingMaxKg('Standing Military Press')).toBe(30)
  })
})

describe('catalog', () => {
  it('lists nine programmes with a preview of every day', async () => {
    const list = await listProgrammes(db)
    expect(list).toHaveLength(9)
    const ppl = list.find((p) => p.key === 'ppl')!
    expect(ppl.days.map((d) => d.name)).toEqual(['Push day', 'Pull day', 'Legs day'])
    expect(ppl.days[0].exercises[0]).toEqual({ name: BENCH, tier: 'main', sets: 4, repMin: 6, repMax: 8, amrap: false })
    expect(ppl.daysPerWeekOptions).toEqual([3, 6])
  })
  it('previews a 5/3/1 lift once, as three working sets', async () => {
    const p = (await getProgramme(db, '531-beginners'))!
    expect(p.days[0].exercises.slice(0, 2).map((e) => [e.name, e.sets])).toEqual([['Barbell Squat', 3], [BENCH, 3]])
    expect(p.days[0].exercises).toHaveLength(5)
  })
  it('has no active programme until one is started', async () => {
    expect(await activeProgramme(db)).toBeNull()
  })
})

describe('programmeLifts', () => {
  it('PPL has 15 weight lifts', async () => {
    const lifts = await programmeLifts(db, await pid('ppl'))
    expect(lifts).toHaveLength(15)
    expect(lifts.every((l) => l.kind === 'weight')).toBe(true)
    expect(lifts.find((l) => l.name === 'Barbell Squat')!.lower).toBe(true)
    expect(lifts.find((l) => l.name === BENCH)!.lower).toBe(false)
  })
  it('5/3/1 has four training-max lifts', async () => {
    const lifts = await programmeLifts(db, await pid('531-beginners'))
    expect(lifts.map((l) => l.name).sort()).toEqual(['Barbell Deadlift', 'Barbell Squat', BENCH, 'Standing Military Press'].sort())
    expect(lifts.every((l) => l.kind === 'trainingMax')).toBe(true)
  })
  it('a bodyweight programme needs no starting weights', async () => {
    expect(await programmeLifts(db, await pid('bodyweight-home'))).toEqual([])
  })
  it('leaves out chin-ups and assistance work', async () => {
    const lifts = await programmeLifts(db, await pid('full-body-beginner'))
    expect(lifts.map((l) => l.name)).not.toContain('Chin-Up')
  })
})

describe('startProgramme', () => {
  it('stores the given weight and defaults the rest', async () => {
    const id = await pid('ppl')
    await startProgramme(db, id, { onDate: MON, startKg: { [`${BENCH}|main`]: 61 } })
    const a = (await activeProgramme(db))!
    expect(a.programme.key).toBe('ppl')
    expect(a.progress.lifts[`${BENCH}|main`].weightKg).toBe(60)
    expect(a.progress.lifts['Barbell Squat|main'].weightKg).toBe(20)
    expect(a.progress.nextPosition).toBe(0)
    expect(a.progress.daysPerWeek).toBe(3)
  })
  it('a second programme deactivates the first but keeps its state', async () => {
    await startProgramme(db, await pid('ppl'), { onDate: MON, startKg: { [`${BENCH}|main`]: 60 } })
    await startProgramme(db, await pid('gzclp'), { onDate: MON })
    expect((await activeProgramme(db))!.programme.key).toBe('gzclp')
    expect(await db.all('SELECT active FROM programme_progress WHERE active = 1')).toHaveLength(1)
    await startProgramme(db, await pid('ppl'), { onDate: MON })
    expect((await activeProgramme(db))!.progress.lifts[`${BENCH}|main`].weightKg).toBe(60)
  })
  it('rejects a days-a-week the programme does not offer', async () => {
    await expect(startProgramme(db, await pid('ppl'), { onDate: MON, daysPerWeek: 4 })).rejects.toThrow()
    await startProgramme(db, await pid('ppl'), { onDate: MON, daysPerWeek: 6 })
    expect((await activeProgramme(db))!.progress.daysPerWeek).toBe(6)
  })
  it('stores training maxes for 5/3/1', async () => {
    await startProgramme(db, await pid('531-beginners'), { onDate: MON, startKg: { 'Barbell Squat': 100 } })
    const p = (await activeProgramme(db))!.progress
    expect(p.lifts['Barbell Squat'].trainingMaxKg).toBe(100)
    expect(p.lifts['Standing Military Press'].trainingMaxKg).toBe(30)
    expect(p.lifts[BENCH].trainingMaxKg).toBe(40)
  })
  it('refuses a weight below zero', async () => {
    await expect(startProgramme(db, await pid('ppl'), { onDate: MON, startKg: { [`${BENCH}|main`]: -5 } })).rejects.toThrow()
  })
})

describe('nextWorkout', () => {
  it('is null with no active programme', async () => {
    expect(await nextWorkout(db, MON)).toBeNull()
  })
  it('starts at Push, 1 of 3, with nothing done', async () => {
    await startProgramme(db, await pid('ppl'), { onDate: MON })
    expect(await nextWorkout(db, MON)).toMatchObject({
      programmeName: 'Push / Pull / Legs', dayName: 'Push day', dayNumber: 1, daysInRotation: 3, plannedPerWeek: 3,
      doneThisWeek: 0, doneToday: false, cycleWeek: null, openWorkoutId: null,
    })
  })
  it('reports six planned days for a six-day week', async () => {
    await startProgramme(db, await pid('ppl'), { onDate: MON, daysPerWeek: 6 })
    expect((await nextWorkout(db, MON))!.plannedPerWeek).toBe(6)
  })
  it('shows the cycle week for 5/3/1', async () => {
    await startProgramme(db, await pid('531-beginners'), { onDate: MON })
    expect((await nextWorkout(db, MON))!.cycleWeek).toBe(1)
  })
})

describe('suggestWeights', () => {
  it('prescribes sets, reps and the stored weight', async () => {
    await startProgramme(db, await pid('ppl'), { onDate: MON, startKg: { [`${BENCH}|main`]: 60 } })
    const plan = await suggestWeights(db, await dayId('ppl', 'Push day'))
    expect(plan.map((p) => p.name)).toEqual([BENCH, 'Standing Military Press', 'Incline Dumbbell Press', 'Side Lateral Raise', 'Triceps Pushdown'])
    expect(plan[0].sets).toHaveLength(4)
    expect(plan[0].sets[0]).toEqual({ reps: 6, minReps: 6, maxReps: 8, weightKg: 60, amrap: false })
    expect(plan[1].sets).toHaveLength(3)
    expect(plan[1].sets[0].weightKg).toBe(20)
    expect(plan.flatMap((p) => p.sets).some((s) => s.amrap)).toBe(false)
  })
  it('uses the empty-bar defaults before the programme is started', async () => {
    const plan = await suggestWeights(db, await dayId('ppl', 'Legs day'))
    expect(plan[0].sets[0].weightKg).toBe(20)
    expect(plan[2].sets[0].weightKg).toBe(40)
  })
  it('offers the alternative exercise where there is one', async () => {
    const pull = await suggestWeights(db, await dayId('ppl', 'Pull day'))
    expect(pull[1].altExerciseId).toBeTruthy()
  })
  it('chin-ups are bodyweight and every set is as many reps as possible', async () => {
    await startProgramme(db, await pid('full-body-beginner'), { onDate: MON })
    const plan = await suggestWeights(db, await dayId('full-body-beginner', 'Workout A'))
    const chin = plan.find((p) => p.name === 'Chin-Up')!
    expect(chin.sets).toHaveLength(3)
    expect(chin.sets.every((s) => s.amrap && s.weightKg === 0)).toBe(true)
  })
})

describe('startProgrammeWorkout', () => {
  it('links the workout to the day and returns the same open one for the same day', async () => {
    await startProgramme(db, await pid('ppl'), { onDate: MON })
    const day = await dayId('ppl', 'Push day')
    const a = await startProgrammeWorkout(db, day, MON)
    const b = await startProgrammeWorkout(db, day, MON)
    expect(b).toBe(a)
    expect(await db.all('SELECT programme_day_id FROM workouts WHERE id = ?', [a])).toEqual([{ programme_day_id: day }])
    expect((await nextWorkout(db, MON))!.openWorkoutId).toBe(a)
  })
  it('lb users see weights as pounds in settings but kg is stored', async () => {
    await updateSettings(db, { weightUnit: 'lb' })
    await startProgramme(db, await pid('ppl'), { onDate: MON, startKg: { [`${BENCH}|main`]: toKg(135, 'lb') } })
    const w = (await activeProgramme(db))!.progress.lifts[`${BENCH}|main`].weightKg
    expect(w).toBeCloseTo(toKg(135, 'lb'), 9)
  })
})
