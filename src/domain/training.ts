import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import { localDate } from './dates'

export type Exercise = { id: string; name: string; primaryMuscle: string | null; equipment: string | null }

export async function customExercise(db: SqlExecutor, name: string, primaryMuscle?: string): Promise<string> {
  if (!name.trim()) throw new Error('An exercise needs a name')
  const id = newId()
  const now = nowIso()
  await db.run(
    "INSERT INTO exercises (id, created_at, updated_at, source, name, primary_muscle) VALUES (?,?,?,'user',?,?)",
    [id, now, now, name.trim(), primaryMuscle ?? null],
  )
  return id
}

export async function searchExercises(db: SqlExecutor, query: string, limit = 30): Promise<Exercise[]> {
  const rows = await db.all<{ id: string; name: string; primary_muscle: string | null; equipment: string | null }>(
    `SELECT id, name, primary_muscle, equipment FROM exercises WHERE deleted_at IS NULL AND name LIKE ?
     ORDER BY CASE source WHEN 'user' THEN 0 ELSE 1 END, name LIMIT ?`,
    [`%${query}%`, limit],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, primaryMuscle: r.primary_muscle, equipment: r.equipment }))
}

export async function getExercise(db: SqlExecutor, id: string): Promise<Exercise | null> {
  const [r] = await db.all<{ id: string; name: string; primary_muscle: string | null; equipment: string | null }>(
    'SELECT id, name, primary_muscle, equipment FROM exercises WHERE id = ?', [id])
  return r ? { id: r.id, name: r.name, primaryMuscle: r.primary_muscle, equipment: r.equipment } : null
}

export async function createRoutine(db: SqlExecutor, name: string, items: { exerciseId: string; targetSets: number; targetReps: number }[]): Promise<string> {
  const id = newId()
  const now = nowIso()
  await db.transaction(async () => {
    await db.run('INSERT INTO routines (id, created_at, updated_at, name) VALUES (?,?,?,?)', [id, now, now, name.trim()])
    for (const [i, it] of items.entries()) {
      await db.run(
        `INSERT INTO routine_exercises (id, created_at, updated_at, routine_id, exercise_id, position, target_sets, target_reps)
         VALUES (?,?,?,?,?,?,?,?)`,
        [newId(), now, now, id, it.exerciseId, i, it.targetSets, it.targetReps],
      )
    }
  })
  return id
}

export async function listRoutines(db: SqlExecutor): Promise<{ id: string; name: string }[]> {
  return db.all('SELECT id, name FROM routines WHERE deleted_at IS NULL ORDER BY name')
}

export async function routineExercises(db: SqlExecutor, routineId: string) {
  const rows = await db.all<{ exercise_id: string; name: string; target_sets: number; target_reps: number }>(
    `SELECT re.exercise_id, e.name, re.target_sets, re.target_reps FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? AND re.deleted_at IS NULL ORDER BY re.position`,
    [routineId],
  )
  return rows.map((r) => ({ exerciseId: r.exercise_id, name: r.name, targetSets: r.target_sets, targetReps: r.target_reps }))
}

export async function startWorkout(db: SqlExecutor, routineId?: string): Promise<string> {
  const id = newId()
  const now = nowIso()
  await db.run('INSERT INTO workouts (id, created_at, updated_at, routine_id, started_at, log_date) VALUES (?,?,?,?,?,?)', [
    id, now, now, routineId ?? null, now, localDate(),
  ])
  return id
}

export async function getWorkout(db: SqlExecutor, id: string) {
  const [w] = await db.all<{ id: string; routine_id: string | null; ended_at: string | null; log_date: string }>(
    'SELECT id, routine_id, ended_at, log_date FROM workouts WHERE id = ?', [id])
  return w ? { id: w.id, routineId: w.routine_id, endedAt: w.ended_at, logDate: w.log_date } : null
}

/** Sets from the most recent finished workout that included this exercise (warm-ups excluded). */
export async function previousSets(db: SqlExecutor, exerciseId: string): Promise<{ reps: number; weightKg: number }[]> {
  const rows = await db.all<{ reps: number; weight_kg: number }>(
    `SELECT s.reps, s.weight_kg FROM workout_sets s
     WHERE s.deleted_at IS NULL AND s.is_warmup = 0 AND s.exercise_id = ? AND s.workout_id = (
       SELECT w.id FROM workouts w JOIN workout_sets s2 ON s2.workout_id = w.id
       WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s2.exercise_id = ? AND s2.deleted_at IS NULL
       ORDER BY w.ended_at DESC, w.rowid DESC LIMIT 1)
     ORDER BY s.set_number`,
    [exerciseId, exerciseId],
  )
  return rows.map((r) => ({ reps: r.reps, weightKg: r.weight_kg }))
}

export async function logSet(db: SqlExecutor, s: { workoutId: string; exerciseId: string; reps: number; weightKg: number; isWarmup?: boolean }): Promise<string> {
  if (!Number.isInteger(s.reps) || s.reps <= 0) throw new Error('Reps must be a whole number above 0')
  if (!(s.weightKg >= 0)) throw new Error('Weight must be 0 or more')
  const [n] = await db.all<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ? AND exercise_id = ? AND deleted_at IS NULL', [s.workoutId, s.exerciseId])
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO workout_sets (id, created_at, updated_at, workout_id, exercise_id, set_number, reps, weight_kg, is_warmup, completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, now, now, s.workoutId, s.exerciseId, n.n + 1, s.reps, s.weightKg, s.isWarmup ? 1 : 0, now],
  )
  return id
}

export async function deleteSet(db: SqlExecutor, id: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function workoutSets(db: SqlExecutor, workoutId: string) {
  const rows = await db.all<{ id: string; exercise_id: string; set_number: number; reps: number; weight_kg: number; is_warmup: number }>(
    'SELECT * FROM workout_sets WHERE workout_id = ? AND deleted_at IS NULL ORDER BY rowid', [workoutId])
  return rows.map((r) => ({ id: r.id, exerciseId: r.exercise_id, setNumber: r.set_number, reps: r.reps, weightKg: r.weight_kg, isWarmup: r.is_warmup === 1 }))
}

export async function finishWorkout(db: SqlExecutor, workoutId: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE workouts SET ended_at = ?, updated_at = ? WHERE id = ?', [now, now, workoutId])
}

/** Heaviest working weight and best Epley estimate, w × (1 + reps/30). Warm-ups excluded. */
export async function personalRecords(db: SqlExecutor, exerciseId: string): Promise<{ heaviestKg: number; bestEst1rmKg: number }> {
  const [r] = await db.all<{ heaviest: number | null; best: number | null }>(
    `SELECT MAX(weight_kg) AS heaviest, MAX(weight_kg * (1 + reps / 30.0)) AS best FROM workout_sets
     WHERE exercise_id = ? AND deleted_at IS NULL AND is_warmup = 0`,
    [exerciseId],
  )
  return { heaviestKg: r?.heaviest ?? 0, bestEst1rmKg: Math.round((r?.best ?? 0) * 10) / 10 }
}

export async function exerciseHistory(db: SqlExecutor, exerciseId: string) {
  return db.all<{ log_date: string; reps: number; weight_kg: number }>(
    `SELECT w.log_date, s.reps, s.weight_kg FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND s.deleted_at IS NULL AND s.is_warmup = 0 ORDER BY w.log_date DESC, s.set_number LIMIT 60`,
    [exerciseId],
  )
}

export async function lastWorkoutDate(db: SqlExecutor): Promise<string | null> {
  const [r] = await db.all<{ d: string | null }>('SELECT MAX(log_date) AS d FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL')
  return r?.d ?? null
}
