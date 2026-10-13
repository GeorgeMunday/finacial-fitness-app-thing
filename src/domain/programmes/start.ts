import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import { getSettings } from '../../state/settings'
import { personalRecords } from '../training'
import { toProgress } from './catalog'
import { isLowerBody, roundKg } from './rounding'
import type { LiftState } from './types'

export type StartLift = { liftKey: string; exerciseId: string; name: string; lower: boolean; kind: 'weight' | 'trainingMax' }

const BY_NAME: [RegExp, number][] = [
  [/lateral raise/i, 3], [/lat pulldown/i, 25], [/cable row/i, 25], [/face pull/i, 10], [/pushdown/i, 15],
  [/leg press/i, 40], [/standing calf/i, 30],
]
const BY_EQUIPMENT: Record<string, number> = { barbell: 20, 'e-z curl bar': 10, dumbbell: 6, kettlebells: 8, cable: 15, machine: 20, 'body only': 0 }

/** A light, empty-bar starting weight for a lift the user doesn't know their weight for. */
export function defaultStartKg(name: string, equipment: string | null): number {
  for (const [re, kg] of BY_NAME) if (re.test(name)) return kg
  return BY_EQUIPMENT[equipment ?? ''] ?? 0
}

export const defaultTrainingMaxKg = (name: string): number => (/military press|overhead/i.test(name) ? 30 : 40)

type LiftRow = { lift_key: string; exercise_id: string; name: string; primary_muscle: string | null; equipment: string | null }

/** Lifts that need a starting weight: one per lift key, in programme order. Chin-ups and assistance work are left out. */
export async function programmeLifts(db: SqlExecutor, programmeId: string): Promise<(StartLift & { equipment: string | null })[]> {
  const [p] = await db.all<{ progression: string }>('SELECT progression FROM programmes WHERE id = ?', [programmeId])
  const rows = await db.all<LiftRow>(
    `SELECT x.lift_key, x.exercise_id, e.name, e.primary_muscle, e.equipment
     FROM programme_day_exercises x JOIN programme_days d ON d.id = x.day_id JOIN exercises e ON e.id = x.exercise_id
     WHERE d.programme_id = ? AND x.deleted_at IS NULL AND x.tier NOT IN ('bw', 'assist') ORDER BY d.position, x.position`,
    [programmeId],
  )
  const seen = new Set<string>()
  const out: (StartLift & { equipment: string | null })[] = []
  for (const r of rows) {
    if (seen.has(r.lift_key)) continue
    seen.add(r.lift_key)
    out.push({
      liftKey: r.lift_key, exerciseId: r.exercise_id, name: r.name, lower: isLowerBody(r.primary_muscle), equipment: r.equipment,
      kind: p?.progression === 'wendler531' ? 'trainingMax' : 'weight',
    })
  }
  return out
}

/** 90% of the best estimated one-rep max from logged working sets, rounded; null if the lift was never logged. */
export async function estimateTrainingMax(db: SqlExecutor, exerciseId: string): Promise<number | null> {
  const { bestEst1rmKg } = await personalRecords(db, exerciseId)
  if (!(bestEst1rmKg > 0)) return null
  const { weightUnit } = await getSettings(db)
  return roundKg(0.9 * bestEst1rmKg, weightUnit)
}

/** Weight to start a lift at when the user gave none: a training max estimated from their logs, else a light default. */
async function fallbackKg(db: SqlExecutor, lift: StartLift & { equipment: string | null }): Promise<number> {
  if (lift.kind === 'trainingMax') return (await estimateTrainingMax(db, lift.exerciseId)) ?? defaultTrainingMaxKg(lift.name)
  return defaultStartKg(lift.name, lift.equipment)
}

/**
 * Makes this programme the active one, at day 1. `startKg` maps lift key → kg (a weight, or a training max for 5/3/1);
 * lifts not given keep their previous state if the programme was started before, else get a light default.
 */
export async function startProgramme(
  db: SqlExecutor,
  programmeId: string,
  o: { onDate: string; daysPerWeek?: number; startKg?: Record<string, number> },
): Promise<string> {
  const [p] = await db.all<{ days_per_week_options: string }>('SELECT days_per_week_options FROM programmes WHERE id = ? AND deleted_at IS NULL', [programmeId])
  if (!p) throw new Error('Programme not found')
  const options = JSON.parse(p.days_per_week_options) as number[]
  const daysPerWeek = o.daysPerWeek ?? options[0]
  if (!options.includes(daysPerWeek)) throw new Error(`This programme runs ${options.join(' or ')} days a week`)
  for (const v of Object.values(o.startKg ?? {})) if (!(v >= 0)) throw new Error('Weights must be 0 or more')
  const { weightUnit: unit } = await getSettings(db)
  const lifts = await programmeLifts(db, programmeId)
  const [prev] = await db.all<Parameters<typeof toProgress>[0]>('SELECT * FROM programme_progress WHERE programme_id = ?', [programmeId])
  const before = prev ? toProgress(prev).lifts : {}
  const next: Record<string, LiftState> = { ...before }
  for (const l of lifts) {
    const given = o.startKg?.[l.liftKey]
    if (given === undefined && before[l.liftKey]) continue
    const kg = roundKg(given ?? (await fallbackKg(db, l)), unit)
    next[l.liftKey] = l.kind === 'trainingMax'
      ? { weightKg: kg, stage: 1, stageStartKg: kg, fails: 0, trainingMaxKg: kg }
      : { weightKg: kg, stage: 1, stageStartKg: kg, fails: 0 }
  }
  const now = nowIso()
  let id = prev?.id
  await db.transaction(async (tx) => {
    await tx.run('UPDATE programme_progress SET active = 0, updated_at = ? WHERE programme_id <> ? AND active = 1', [now, programmeId])
    if (id) {
      await tx.run(
        'UPDATE programme_progress SET active = 1, started_on = ?, days_per_week = ?, next_position = 0, cycle_week = 1, lifts = ?, updated_at = ? WHERE id = ?',
        [o.onDate, daysPerWeek, JSON.stringify(next), now, id],
      )
    } else {
      id = newId()
      await tx.run(
        `INSERT INTO programme_progress (id, created_at, updated_at, programme_id, active, started_on, days_per_week, next_position, cycle_week, lifts)
         VALUES (?,?,?,?,1,?,?,0,1,?)`,
        [id, now, now, programmeId, o.onDate, daysPerWeek, JSON.stringify(next)],
      )
    }
  })
  return id!
}
