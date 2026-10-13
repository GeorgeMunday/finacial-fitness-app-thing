import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import { getSettings } from '../../state/settings'
import { addDays, weekStart } from '../dates'
import { activeProgramme, toProgress } from './catalog'
import { KINDS } from './kinds'
import { previousSets } from '../training'
import { isLowerBody } from './rounding'
import { defaultStartKg, defaultTrainingMaxKg } from './start'
import type { DayExercise, LiftState, NextWorkout, PlannedExercise, Tier } from './types'

export type DayExerciseRow = {
  id: string; day_id: string; position: number; exercise_id: string; alt_exercise_id: string | null; lift_key: string; tier: Tier
  sets: number; rep_min: number; rep_max: number; percent: number | null; week: number | null; is_amrap: number
  increment_kg: number | null; note: string | null
}
export const toDayExercise = (r: DayExerciseRow): DayExercise => ({
  id: r.id, dayId: r.day_id, position: r.position, exerciseId: r.exercise_id, altExerciseId: r.alt_exercise_id, liftKey: r.lift_key, tier: r.tier,
  sets: r.sets, repMin: r.rep_min, repMax: r.rep_max, percent: r.percent, week: r.week, isAmrap: r.is_amrap === 1,
  incrementKg: r.increment_kg, note: r.note,
})

type DayInfo = { id: string; name: string; position: number; programme_id: string }

async function dayRows(db: SqlExecutor, programmeId: string) {
  return db.all<DayInfo>('SELECT id, name, position, programme_id FROM programme_days WHERE programme_id = ? AND deleted_at IS NULL ORDER BY position', [programmeId])
}

export async function nextWorkout(db: SqlExecutor, onDate: string): Promise<NextWorkout | null> {
  const active = await activeProgramme(db)
  if (!active) return null
  const { programme, progress } = active
  const days = await dayRows(db, programme.id)
  if (!days.length) return null
  const idx = progress.nextPosition % days.length
  const day = days[idx]
  const from = weekStart(onDate)
  const finished = async (a: string, b: string) =>
    (await db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM workouts w JOIN programme_days d ON d.id = w.programme_day_id
       WHERE d.programme_id = ? AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.log_date BETWEEN ? AND ?`,
      [programme.id, a, b],
    ))[0].n
  const [open] = await db.all<{ id: string }>(
    `SELECT id FROM workouts WHERE programme_day_id = ? AND deleted_at IS NULL AND ended_at IS NULL AND log_date = ? ORDER BY rowid DESC LIMIT 1`,
    [day.id, onDate],
  )
  return {
    programmeId: programme.id, programmeName: programme.name, dayId: day.id, dayName: day.name, dayNumber: idx + 1, daysInRotation: days.length,
    plannedPerWeek: progress.daysPerWeek ?? programme.daysPerWeekOptions[0],
    doneThisWeek: await finished(from, addDays(from, 6)),
    doneToday: (await finished(onDate, onDate)) > 0,
    cycleWeek: programme.progression === 'wendler531' ? progress.cycleWeek : null,
    openWorkoutId: open?.id ?? null,
  }
}

type ExRow = { id: string; name: string; primary_muscle: string | null; equipment: string | null }

/** What to lift on this day: sets, reps and weights from the programme's progression state (or light defaults before it is started). */
export async function suggestWeights(db: SqlExecutor, programmeDayId: string): Promise<PlannedExercise[]> {
  const [day] = await db.all<DayInfo>('SELECT id, name, position, programme_id FROM programme_days WHERE id = ?', [programmeDayId])
  if (!day) throw new Error('Programme day not found')
  const [prog] = await db.all<{ progression: keyof typeof KINDS }>('SELECT progression FROM programmes WHERE id = ?', [day.programme_id])
  const kind = KINDS[prog.progression]
  if (!kind) throw new Error(`No progression for ${prog.progression}`)
  const [pr] = await db.all<Parameters<typeof toProgress>[0]>('SELECT * FROM programme_progress WHERE programme_id = ?', [day.programme_id])
  const progress = pr ? toProgress(pr) : null
  const cycleWeek = progress?.cycleWeek ?? 1
  const { weightUnit: unit } = await getSettings(db)
  const exes = new Map((await db.all<ExRow>('SELECT id, name, primary_muscle, equipment FROM exercises')).map((e) => [e.id, e]))
  const rows = (await db.all<DayExerciseRow>('SELECT * FROM programme_day_exercises WHERE day_id = ? AND deleted_at IS NULL ORDER BY position', [day.id]))
    .map(toDayExercise)
    .filter((r) => r.week === null || r.week === cycleWeek)
  const out: PlannedExercise[] = []
  for (const row of rows) {
    const ex = exes.get(row.exerciseId)
    if (!ex) continue
    const lower = isLowerBody(ex.primary_muscle)
    let state: LiftState | undefined = progress?.lifts[row.liftKey]
    if (!state) {
      const kg = prog.progression === 'wendler531' ? defaultTrainingMaxKg(ex.name) : defaultStartKg(ex.name, ex.equipment)
      state = { weightKg: kg, stage: 1, stageStartKg: kg, fails: 0, ...(prog.progression === 'wendler531' ? { trainingMaxKg: kg } : {}) }
    }
    const sets = kind.prescribe(row, state, { unit, lower, cycleWeek })
    if (row.tier === 'assist') {
      // Assistance work is picked by the user, so start it from what they last lifted for it.
      const last = (await previousSets(db, row.exerciseId)).at(-1)
      for (const s of sets) s.weightKg = last?.weightKg ?? 0
    }
    const prev = out[out.length - 1]
    if (prev && prev.exerciseId === row.exerciseId && prev.tier === row.tier && prev.liftKey === row.liftKey) {
      prev.sets.push(...sets)
    } else {
      out.push({ dayExerciseId: row.id, exerciseId: row.exerciseId, altExerciseId: row.altExerciseId, name: ex.name, tier: row.tier, liftKey: row.liftKey, sets, note: row.note })
    }
  }
  return out
}

/** Starts the workout for a programme day, or returns today's unfinished one for that day. */
export async function startProgrammeWorkout(db: SqlExecutor, programmeDayId: string, logDate: string): Promise<string> {
  const [open] = await db.all<{ id: string }>(
    'SELECT id FROM workouts WHERE programme_day_id = ? AND deleted_at IS NULL AND ended_at IS NULL AND log_date = ? ORDER BY rowid DESC LIMIT 1',
    [programmeDayId, logDate],
  )
  if (open) return open.id
  const id = newId()
  const now = nowIso()
  await db.run('INSERT INTO workouts (id, created_at, updated_at, started_at, log_date, programme_day_id) VALUES (?,?,?,?,?,?)', [id, now, now, now, logDate, programmeDayId])
  return id
}
