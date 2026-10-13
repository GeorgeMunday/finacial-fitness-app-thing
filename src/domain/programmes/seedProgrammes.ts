import type { SqlExecutor } from '../../db/executor'
import { newId, nowIso } from '../../db/ids'
import type { SeedProgramme } from './types'

type Row = {
  exercise: string; alt: string | null; liftKey: string; tier: string; sets: number; repMin: number; repMax: number
  percent: number | null; week: number | null; amrap: boolean; incrementKg: number | null; note: string | null
}

/** Expands a programme day into database rows. A 5/3/1 main lift becomes one row per prescribed set per week, then its back-off rows. */
function expand(p: SeedProgramme, exercises: SeedProgramme['days'][number]['exercises']): Row[] {
  const out: Row[] = []
  for (const e of exercises) {
    const liftKey = e.lift ?? `${e.exercise}|${e.tier}`
    const base = { exercise: e.exercise, alt: e.alt ?? null, liftKey, incrementKg: e.incrementKg ?? null, note: e.note ?? null }
    if (e.tier === 'm531') {
      const weeks = p.cycle?.weeks ?? []
      weeks.forEach((w, wi) => w.percents.forEach((pc, i) =>
        out.push({ ...base, tier: 'm531', sets: 1, repMin: w.reps[i], repMax: w.reps[i], percent: pc, week: wi + 1, amrap: i === w.percents.length - 1 })))
      weeks.forEach((w, wi) =>
        out.push({ ...base, tier: 'fsl', sets: 5, repMin: 5, repMax: 5, percent: w.fslPercent, week: wi + 1, amrap: false, note: 'Back-off sets: same weight as the first set, five times' }))
    } else {
      out.push({ ...base, tier: e.tier, sets: e.sets, repMin: e.reps[0], repMax: e.reps[1], percent: null, week: null, amrap: !!e.amrap })
    }
  }
  return out
}

/** Inserts programmes whose key isn't there yet. Returns how many were added. Runs inside the caller's transaction. */
export async function seedProgrammes(tx: SqlExecutor, list: SeedProgramme[]): Promise<number> {
  const have = new Set((await tx.all<{ key: string }>('SELECT key FROM programmes')).map((r) => r.key))
  const ids = new Map((await tx.all<{ id: string; name: string }>("SELECT id, name FROM exercises WHERE source = 'seed' AND deleted_at IS NULL")).map((r) => [r.name, r.id]))
  const idOf = (name: string) => {
    const id = ids.get(name)
    if (!id) throw new Error(`Exercise not found: ${name}`)
    return id
  }
  const now = nowIso()
  let added = 0
  for (const p of list) {
    if (have.has(p.key)) continue
    const pid = newId()
    await tx.run(
      `INSERT INTO programmes (id, created_at, updated_at, key, name, author, level, description, progression, days_per_week_options, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,'tally')`,
      [pid, now, now, p.key, p.name, p.author ?? null, p.level, p.description, p.progression, JSON.stringify(p.daysPerWeekOptions)],
    )
    for (const [di, day] of p.days.entries()) {
      const did = newId()
      await tx.run('INSERT INTO programme_days (id, created_at, updated_at, programme_id, position, name) VALUES (?,?,?,?,?,?)', [did, now, now, pid, di, day.name])
      for (const [pos, r] of expand(p, day.exercises).entries()) {
        await tx.run(
          `INSERT INTO programme_day_exercises (id, created_at, updated_at, day_id, position, exercise_id, alt_exercise_id, lift_key, tier, sets, rep_min, rep_max, percent, week, is_amrap, increment_kg, note)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), now, now, did, pos, idOf(r.exercise), r.alt ? idOf(r.alt) : null, r.liftKey, r.tier, r.sets, r.repMin, r.repMax, r.percent, r.week, r.amrap ? 1 : 0, r.incrementKg, r.note],
        )
      }
    }
    added++
  }
  return added
}
