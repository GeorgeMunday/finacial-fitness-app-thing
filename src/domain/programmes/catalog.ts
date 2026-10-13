import type { SqlExecutor } from '../../db/executor'
import type { Programme, ProgrammeProgress, Tier } from './types'

type ProgrammeRow = {
  id: string; key: string; name: string; author: string | null; level: Programme['level']; description: string
  progression: Programme['progression']; days_per_week_options: string; source: Programme['source']
}
export const toProgramme = (r: ProgrammeRow): Programme => ({
  id: r.id, key: r.key, name: r.name, author: r.author, level: r.level, description: r.description, progression: r.progression,
  daysPerWeekOptions: JSON.parse(r.days_per_week_options) as number[], source: r.source,
})

type ProgressRow = {
  id: string; programme_id: string; active: number; started_on: string | null; days_per_week: number | null
  next_position: number; cycle_week: number; lifts: string
}
export const toProgress = (r: ProgressRow): ProgrammeProgress => ({
  id: r.id, programmeId: r.programme_id, active: r.active === 1, startedOn: r.started_on, daysPerWeek: r.days_per_week,
  nextPosition: r.next_position, cycleWeek: r.cycle_week, lifts: JSON.parse(r.lifts) as ProgrammeProgress['lifts'],
})

export type ProgrammeSummary = Programme & {
  days: { id: string; name: string; exercises: { name: string; tier: Tier; sets: number; repMin: number; repMax: number; amrap: boolean }[] }[]
}

type PreviewRow = { name: string; tier: Tier; sets: number; rep_min: number; rep_max: number; is_amrap: number; week: number | null }

async function withDays(db: SqlExecutor, programmes: Programme[]): Promise<ProgrammeSummary[]> {
  const out: ProgrammeSummary[] = []
  for (const p of programmes) {
    const days = await db.all<{ id: string; name: string }>('SELECT id, name FROM programme_days WHERE programme_id = ? AND deleted_at IS NULL ORDER BY position', [p.id])
    const summary: ProgrammeSummary['days'] = []
    for (const d of days) {
      // For 5/3/1 only the first week's rows are shown, and each main lift is one entry of three working sets.
      const rows = await db.all<PreviewRow>(
        `SELECT e.name, x.tier, x.sets, x.rep_min, x.rep_max, x.is_amrap, x.week
         FROM programme_day_exercises x JOIN exercises e ON e.id = x.exercise_id
         WHERE x.day_id = ? AND x.deleted_at IS NULL AND x.tier <> 'fsl' AND (x.week IS NULL OR x.week = 1) ORDER BY x.position`,
        [d.id],
      )
      const exercises: ProgrammeSummary['days'][number]['exercises'] = []
      for (const r of rows) {
        const prev = exercises[exercises.length - 1]
        if (r.tier === 'm531' && prev?.tier === 'm531' && prev.name === r.name) {
          prev.sets += 1
          prev.repMin = Math.min(prev.repMin, r.rep_min)
          prev.repMax = Math.max(prev.repMax, r.rep_max)
          prev.amrap = prev.amrap || r.is_amrap === 1
        } else {
          exercises.push({ name: r.name, tier: r.tier, sets: r.sets, repMin: r.rep_min, repMax: r.rep_max, amrap: r.is_amrap === 1 })
        }
      }
      summary.push({ id: d.id, name: d.name, exercises })
    }
    out.push({ ...p, days: summary })
  }
  return out
}

export async function listProgrammes(db: SqlExecutor): Promise<ProgrammeSummary[]> {
  const rows = await db.all<ProgrammeRow>("SELECT * FROM programmes WHERE deleted_at IS NULL ORDER BY CASE source WHEN 'tally' THEN 0 ELSE 1 END, rowid")
  return withDays(db, rows.map(toProgramme))
}

export async function getProgramme(db: SqlExecutor, key: string): Promise<ProgrammeSummary | null> {
  const [r] = await db.all<ProgrammeRow>('SELECT * FROM programmes WHERE key = ? AND deleted_at IS NULL', [key])
  return r ? (await withDays(db, [toProgramme(r)]))[0] : null
}

export async function activeProgramme(db: SqlExecutor): Promise<{ programme: Programme; progress: ProgrammeProgress } | null> {
  const [pr] = await db.all<ProgressRow>(
    `SELECT pp.* FROM programme_progress pp JOIN programmes p ON p.id = pp.programme_id
     WHERE pp.active = 1 AND pp.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY pp.updated_at DESC LIMIT 1`,
  )
  if (!pr) return null
  const [p] = await db.all<ProgrammeRow>('SELECT * FROM programmes WHERE id = ?', [pr.programme_id])
  return { programme: toProgramme(p), progress: toProgress(pr) }
}
