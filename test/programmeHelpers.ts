import type { SqlExecutor } from '../src/db/executor'
import { activeProgramme, getProgramme } from '../src/domain/programmes/catalog'
import { startProgrammeWorkout } from '../src/domain/programmes/plan'
import { startProgramme } from '../src/domain/programmes/start'
import { finishWorkout, logSet } from '../src/domain/training'

export const MON = '2026-10-12'
export const BENCH = 'Barbell Bench Press - Medium Grip'
export const OHP = 'Standing Military Press'
export const SQUAT = 'Barbell Squat'
export const DEADLIFT = 'Barbell Deadlift'

export async function exId(db: SqlExecutor, name: string): Promise<string> {
  const [r] = await db.all<{ id: string }>("SELECT id FROM exercises WHERE name = ? AND source = 'seed'", [name])
  if (!r) throw new Error(`no exercise ${name}`)
  return r.id
}

/** Starts a programme with weights given by lift key. */
export async function begin(db: SqlExecutor, key: string, startKg: Record<string, number> = {}, o: { daysPerWeek?: number; onDate?: string } = {}) {
  const p = (await getProgramme(db, key))!
  await startProgramme(db, p.id, { onDate: o.onDate ?? MON, startKg, daysPerWeek: o.daysPerWeek })
  return p
}

export async function dayOf(db: SqlExecutor, key: string, name: string): Promise<string> {
  return (await getProgramme(db, key))!.days.find((d) => d.name === name)!.id
}

/** Opens a programme day's workout, logs sets (exercise name → [reps, kg][]) in the order given, and optionally finishes it. */
export async function doWorkout(
  db: SqlExecutor,
  dayId: string,
  sets: Record<string, [number, number][]>,
  o: { date?: string; finish?: boolean; warmups?: Record<string, [number, number][]> } = {},
): Promise<string> {
  const w = await startProgrammeWorkout(db, dayId, o.date ?? MON)
  for (const [name, list] of Object.entries(o.warmups ?? {})) {
    for (const [reps, kg] of list) await logSet(db, { workoutId: w, exerciseId: await exId(db, name), reps, weightKg: kg, isWarmup: true })
  }
  for (const [name, list] of Object.entries(sets)) {
    for (const [reps, kg] of list) await logSet(db, { workoutId: w, exerciseId: await exId(db, name), reps, weightKg: kg })
  }
  if (o.finish !== false) await finishWorkout(db, w)
  return w
}

export async function liftState(db: SqlExecutor, liftKey: string) {
  return (await activeProgramme(db))!.progress.lifts[liftKey]
}
export const reps = (n: number, count: number, kg: number): [number, number][] => Array.from({ length: count }, () => [n, kg])
