import type { SqlExecutor } from '../../db/executor'
import { nowIso } from '../../db/ids'
import { getSettings } from '../../state/settings'
import { toProgress } from './catalog'
import { KINDS } from './kinds'
import { toDayExercise, type DayExerciseRow } from './plan'
import { isLowerBody } from './rounding'
import { defaultStartKg, defaultTrainingMaxKg } from './start'
import type { DayExercise, LiftState, ProgressionOutcome } from './types'

type ExRow = { id: string; name: string; primary_muscle: string | null; equipment: string | null }

/** A prescribed lift in a programme day, with the working sets logged for it. */
type Block = { row: DayExercise; ex: ExRow; sets: { reps: number; weightKg: number }[]; prescribed: number; state: LiftState; kindName: keyof typeof KINDS }

async function loadBlocks(db: SqlExecutor, workoutId: string) {
  const [w] = await db.all<{ programme_day_id: string | null; ended_at: string | null; progression_applied_at: string | null }>(
    'SELECT programme_day_id, ended_at, progression_applied_at FROM workouts WHERE id = ? AND deleted_at IS NULL', [workoutId])
  if (!w?.programme_day_id || !w.ended_at || w.progression_applied_at) return null
  const [day] = await db.all<{ id: string; position: number; programme_id: string }>('SELECT id, position, programme_id FROM programme_days WHERE id = ?', [w.programme_day_id])
  const [prog] = await db.all<{ progression: keyof typeof KINDS }>('SELECT progression FROM programmes WHERE id = ?', [day.programme_id])
  const [pr] = await db.all<Parameters<typeof toProgress>[0]>('SELECT * FROM programme_progress WHERE programme_id = ?', [day.programme_id])
  if (!pr) return null
  const progress = toProgress(pr)
  const kind = KINDS[prog.progression]!
  const { weightUnit: unit } = await getSettings(db)
  const exes = new Map((await db.all<ExRow>('SELECT id, name, primary_muscle, equipment FROM exercises')).map((e) => [e.id, e]))
  const rows = (await db.all<DayExerciseRow>('SELECT * FROM programme_day_exercises WHERE day_id = ? AND deleted_at IS NULL ORDER BY position', [day.id]))
    .map(toDayExercise)
    .filter((r) => (r.week === null || r.week === progress.cycleWeek) && r.tier !== 'bw' && r.tier !== 'assist' && r.tier !== 'm531' && r.tier !== 'fsl')
  const blocks: Block[] = []
  for (const row of rows) {
    const ex = exes.get(row.exerciseId)
    if (!ex) continue
    const lower = isLowerBody(ex.primary_muscle)
    const dflt = prog.progression === 'wendler531' ? defaultTrainingMaxKg(ex.name) : defaultStartKg(ex.name, ex.equipment)
    const state = progress.lifts[row.liftKey] ?? { weightKg: dflt, stage: 1, stageStartKg: dflt, fails: 0 }
    const prescribed = kind.prescribe(row, state, { unit, lower, cycleWeek: progress.cycleWeek }).length
    const logged = await db.all<{ reps: number; weight_kg: number }>(
      `SELECT reps, weight_kg FROM workout_sets WHERE workout_id = ? AND exercise_id = ? AND deleted_at IS NULL AND is_warmup = 0
       ORDER BY set_number, rowid LIMIT ?`,
      [workoutId, row.exerciseId, prescribed],
    )
    blocks.push({ row, ex, sets: logged.map((s) => ({ reps: s.reps, weightKg: s.weight_kg })), prescribed, state, kindName: prog.progression })
  }
  return { day, progress, blocks, kind, unit, programmeId: day.programme_id, daysCount: (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM programme_days WHERE programme_id = ? AND deleted_at IS NULL', [day.programme_id]))[0].n, exes }
}

/**
 * Moves a finished programme workout's lifts on (new weights, stages) and points the programme at the next day.
 * Runs once per workout. `decisions` says, per lift key, whether a short lift counts as a miss (default: it doesn't).
 */
export async function applyProgression(db: SqlExecutor, workoutId: string, decisions: Record<string, 'miss' | 'ignore'> = {}): Promise<ProgressionOutcome[]> {
  // Reads and writes share one transaction, and transactions run one at a time, so a double tap can't apply twice.
  let result: ProgressionOutcome[] = []
  await db.transaction(async (tx) => {
    result = await applyIn(tx, workoutId, decisions)
  })
  return result
}

async function applyIn(db: SqlExecutor, workoutId: string, decisions: Record<string, 'miss' | 'ignore'>): Promise<ProgressionOutcome[]> {
  const ctx = await loadBlocks(db, workoutId)
  if (!ctx) return []
  const { day, progress, blocks, kind, unit, daysCount, exes } = ctx
  const outcomes: ProgressionOutcome[] = []
  const lifts = { ...progress.lifts }
  for (const b of blocks) {
    const from = b.state.weightKg
    if (b.sets.length === 0) {
      outcomes.push({ liftKey: b.row.liftKey, exerciseId: b.row.exerciseId, name: b.ex.name, result: 'not_done', fromKg: from, toKg: from })
      continue
    }
    const u = kind.evaluate({ row: b.row, state: b.state, sets: b.sets, prescribed: b.prescribed, unit, lower: isLowerBody(b.ex.primary_muscle), decision: decisions[b.row.liftKey] ?? 'ignore' })
    lifts[b.row.liftKey] = u.state
    outcomes.push({ liftKey: b.row.liftKey, exerciseId: b.row.exerciseId, name: b.ex.name, result: u.result, fromKg: from, toKg: u.state.weightKg, note: u.note })
  }
  let next = { ...progress, lifts }
  if (kind.endOfWorkout) {
    const lowerByLift: Record<string, boolean> = {}
    const names: Record<string, { exerciseId: string; name: string }> = {}
    const all = await db.all<DayExerciseRow>('SELECT x.* FROM programme_day_exercises x JOIN programme_days d ON d.id = x.day_id WHERE d.programme_id = ? AND x.deleted_at IS NULL', [ctx.programmeId])
    for (const r of all) {
      const ex = exes.get(r.exercise_id)
      if (!ex) continue
      lowerByLift[r.lift_key] = isLowerBody(ex.primary_muscle)
      names[r.lift_key] = { exerciseId: ex.id, name: ex.name }
    }
    const end = kind.endOfWorkout({ progress: next, finishedPosition: day.position, days: daysCount, unit, lowerByLift, names })
    next = end.progress
    outcomes.push(...end.outcomes)
  }
  const now = nowIso()
  await db.run(
    'UPDATE programme_progress SET lifts = ?, cycle_week = ?, next_position = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(next.lifts), next.cycleWeek, (day.position + 1) % daysCount, now, progress.id],
  )
  await db.run('UPDATE workouts SET progression_applied_at = ?, updated_at = ? WHERE id = ?', [now, now, workoutId])
  return outcomes
}

/** Lifts logged short (some sets, all of them on target) where the programme would treat a miss differently. */
export async function progressionShortfalls(db: SqlExecutor, workoutId: string): Promise<{ liftKey: string; exerciseId: string; name: string; logged: number; prescribed: number }[]> {
  const ctx = await loadBlocks(db, workoutId)
  if (!ctx || !ctx.kind.missAware) return []
  return ctx.blocks
    .filter((b) => b.row.tier !== 't3' && b.sets.length >= 1 && b.sets.length < b.prescribed)
    .filter((b) => {
      const prescribed = ctx.kind.prescribe(b.row, b.state, { unit: ctx.unit, lower: false, cycleWeek: ctx.progress.cycleWeek })
      return b.sets.every((s, i) => s.reps >= prescribed[i].minReps)
    })
    .map((b) => ({ liftKey: b.row.liftKey, exerciseId: b.row.exerciseId, name: b.ex.name, logged: b.sets.length, prescribed: b.prescribed }))
}
