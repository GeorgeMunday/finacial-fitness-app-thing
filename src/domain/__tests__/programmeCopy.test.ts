import { beforeEach, describe, expect, it } from 'vitest'
import { BENCH, SQUAT, begin } from '../../../test/programmeHelpers'
import { seededDb } from '../../../test/realSeed'
import type { SqlExecutor } from '../../db/executor'
import { activeProgramme, getProgramme } from '../programmes/catalog'
import { copyProgrammeToRoutines } from '../programmes/catalog'
import { createRoutine, deleteRoutine, getRoutine, listRoutines, restoreRoutine, routineExercises, updateRoutine } from '../training'

let db: SqlExecutor
beforeEach(async () => {
  db = await seededDb()
})
const pid = async (key: string) => (await getProgramme(db, key))!.id

describe('copyProgrammeToRoutines', () => {
  it('makes one routine per day with the programme sets and the bottom of each rep range', async () => {
    const ids = await copyProgrammeToRoutines(db, await pid('ppl'))
    expect(ids).toHaveLength(3)
    expect((await listRoutines(db)).map((r) => r.name).sort()).toEqual(['Push / Pull / Legs – Legs day', 'Push / Pull / Legs – Pull day', 'Push / Pull / Legs – Push day'])
    const push = (await listRoutines(db)).find((r) => r.name.endsWith('Push day'))!
    const items = await routineExercises(db, push.id)
    expect(items).toHaveLength(5)
    expect(items[0]).toMatchObject({ name: BENCH, targetSets: 4, targetReps: 6 })
    expect(items[4]).toMatchObject({ name: 'Triceps Pushdown', targetSets: 3, targetReps: 10 })
  })
  it("doesn't touch the programme or its progress", async () => {
    await begin(db, 'ppl', { [`${BENCH}|main`]: 60 })
    const before = JSON.stringify((await activeProgramme(db))!.progress)
    await copyProgrammeToRoutines(db, await pid('ppl'))
    expect(JSON.stringify((await activeProgramme(db))!.progress)).toBe(before)
    expect(await db.all('SELECT * FROM programmes WHERE deleted_at IS NOT NULL')).toEqual([])
  })
  it('copying twice makes a second set instead of overwriting', async () => {
    await copyProgrammeToRoutines(db, await pid('ppl'))
    await copyProgrammeToRoutines(db, await pid('ppl'))
    expect(await listRoutines(db)).toHaveLength(6)
  })
  it('5/3/1 becomes each main lift as 3×5 plus the assistance slots, without the weekly rows', async () => {
    const [first] = await copyProgrammeToRoutines(db, await pid('531-beginners'))
    const items = await routineExercises(db, first)
    expect(items.map((i) => [i.name, i.targetSets, i.targetReps])).toEqual([
      [SQUAT, 3, 5], [BENCH, 3, 5], ['Pushups', 5, 10], ['Chin-Up', 5, 10], ['Barbell Walking Lunge', 5, 10]])
  })
})

describe('routine editing', () => {
  it('getRoutine returns name and items', async () => {
    const ex = (await db.all<{ id: string }>("SELECT id FROM exercises WHERE name = ?", [SQUAT]))[0].id
    const id = await createRoutine(db, 'Mine', [{ exerciseId: ex, targetSets: 3, targetReps: 5 }])
    expect(await getRoutine(db, id)).toEqual({ id, name: 'Mine', items: [{ exerciseId: ex, name: SQUAT, targetSets: 3, targetReps: 5 }] })
    expect(await getRoutine(db, 'nope')).toBeNull()
  })
  it('updateRoutine replaces the items and keeps the id', async () => {
    const [sq, be] = await Promise.all([SQUAT, BENCH].map(async (n) => (await db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [n]))[0].id))
    const id = await createRoutine(db, 'Mine', [{ exerciseId: sq, targetSets: 3, targetReps: 5 }])
    await updateRoutine(db, id, ' Mine v2 ', [{ exerciseId: be, targetSets: 4, targetReps: 6 }, { exerciseId: sq, targetSets: 2, targetReps: 8 }])
    expect(await getRoutine(db, id)).toMatchObject({ id, name: 'Mine v2' })
    expect((await routineExercises(db, id)).map((i) => [i.name, i.targetSets, i.targetReps])).toEqual([[BENCH, 4, 6], [SQUAT, 2, 8]])
    expect(await listRoutines(db)).toHaveLength(1)
  })
  it('deleteRoutine hides it, and restoreRoutine brings it back', async () => {
    const sq = (await db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [SQUAT]))[0].id
    const id = await createRoutine(db, 'Mine', [{ exerciseId: sq, targetSets: 3, targetReps: 5 }])
    await deleteRoutine(db, id)
    expect(await listRoutines(db)).toEqual([])
    expect(await getRoutine(db, id)).toBeNull()
    await restoreRoutine(db, id)
    expect(await listRoutines(db)).toHaveLength(1)
  })
  it('refuses a routine with no name or no exercises', async () => {
    await expect(createRoutine(db, '  ', [])).rejects.toThrow()
  })
})
