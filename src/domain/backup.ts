import type { SqlExecutor } from '../db/executor'
import { MIGRATIONS, migrate } from '../db/migrations'
import { getSettings, updateSettings } from '../state/settings'

export type Backup = { app: 'tally'; schemaVersion: number; exportedAt: string; tables: Record<string, Record<string, unknown>[]> }

async function tableNames(db: SqlExecutor): Promise<string[]> {
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  return rows.map((r) => r.name)
}

async function columns(db: SqlExecutor, table: string): Promise<Set<string>> {
  const rows = await db.all<{ name: string }>(`PRAGMA table_info("${table}")`)
  return new Set(rows.map((r) => r.name))
}

export async function exportAll(db: SqlExecutor): Promise<Backup> {
  const [v] = await db.all<{ user_version: number }>('PRAGMA user_version')
  const tables: Backup['tables'] = {}
  for (const t of await tableNames(db)) tables[t] = await db.all(`SELECT * FROM "${t}" ORDER BY rowid`)
  return { app: 'tally', schemaVersion: v.user_version, exportedAt: new Date().toISOString(), tables }
}

type Tables = Record<string, Record<string, unknown>[]>

/** Row changes that mirror each migration, keyed by the version a backup is upgraded *from*. */
const UPGRADES: Record<number, (t: Tables) => void> = {
  4: (t) => {
    // Migration 5 added saved product photos.
    t.food_images ??= []
  },
  2: (t) => {
    // Migration 3 added the programme tables; older backups simply have none.
    for (const n of ['programmes', 'programme_days', 'programme_day_exercises', 'programme_progress']) t[n] ??= []
  },
  1: (t) => {
    // Matches migration 2: every pre-v2 'cofid' row was the hand-written starter list.
    for (const f of t.foods ?? []) if (f.source === 'cofid') f.source = 'starter'
    for (const r of t.recurring_rules ?? [])
      if (r.anchor_day === undefined && typeof r.next_date === 'string') r.anchor_day = Number(r.next_date.slice(8, 10))
  },
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Replaces all data with a backup, all or nothing. Invalid input is rejected before anything is touched. */
export async function importAll(db: SqlExecutor, backup: unknown): Promise<{ tables: number; rows: number }> {
  if (!isObj(backup) || backup.app !== 'tally') throw new Error("That file isn't a Tally backup.")
  const v = backup.schemaVersion
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('That backup is missing its version.')
  if (v > MIGRATIONS.length) throw new Error('That backup comes from a newer version of Tally. Update Tally, then try again.')
  if (typeof backup.exportedAt !== 'string' || !isObj(backup.tables)) throw new Error('That backup is incomplete.')
  const known = await tableNames(db)
  const tables = structuredClone(backup.tables) as Tables
  for (const t of Object.values(tables)) if (!Array.isArray(t)) throw new Error('That backup is incomplete.')
  for (let from = v; from < MIGRATIONS.length; from++) UPGRADES[from]?.(tables)
  for (const name of known) if (!Array.isArray(tables[name])) throw new Error(`That backup is incomplete (no ${name}).`)
  for (const name of Object.keys(tables)) if (!known.includes(name)) throw new Error(`That backup has an unknown table: ${name}.`)
  const plan: { table: string; cols: string[]; rows: Record<string, unknown>[] }[] = []
  for (const table of known) {
    const allowed = await columns(db, table)
    const rows = tables[table] as unknown[]
    const cols = new Set<string>()
    for (const r of rows) {
      if (!isObj(r)) throw new Error(`That backup has a broken row in ${table}.`)
      for (const [k, val] of Object.entries(r)) {
        if (!allowed.has(k)) throw new Error(`That backup has an unknown column in ${table}.`)
        if (val !== null && !['string', 'number'].includes(typeof val)) throw new Error(`That backup has a broken value in ${table}.`)
        cols.add(k)
      }
    }
    plan.push({ table, cols: [...cols], rows: rows as Record<string, unknown>[] })
  }
  let count = 0
  await db.transaction(async (tx) => {
    // Rows go in table by table; check references once, at commit, not row by row.
    await tx.exec('PRAGMA defer_foreign_keys = ON')
    for (const { table } of plan) await tx.run(`DELETE FROM "${table}"`)
    for (const { table, cols, rows } of plan) {
      if (!cols.length) continue
      const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      for (const r of rows) {
        await tx.run(sql, cols.map((c) => r[c] ?? null))
        count++
      }
    }
  })
  await migrate(db)
  return { tables: plan.length, rows: count }
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

export async function transactionsCsv(db: SqlExecutor): Promise<string> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT t.log_date AS date, t.kind, printf('%.2f', t.amount_pence / 100.0) AS amount, t.currency, c.name AS category, t.merchant, t.note
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.deleted_at IS NULL ORDER BY t.log_date, t.rowid`,
  )
  return toCsv(rows)
}

export async function deleteHealthData(db: SqlExecutor): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM food_logs')
    await tx.run('DELETE FROM body_metrics')
    await tx.run("DELETE FROM meal_items WHERE meal_id IN (SELECT id FROM meals WHERE source = 'user')")
    await tx.run("DELETE FROM meals WHERE source = 'user'")
    await tx.run("DELETE FROM product_prices WHERE food_id IN (SELECT id FROM foods WHERE source = 'user')")
    await tx.run("DELETE FROM foods WHERE source = 'user'")
    await tx.run('UPDATE transaction_links SET food_log_id = NULL')
  })
  const s = await getSettings(db)
  await updateSettings(db, { healthConsent: false, optionalPillars: s.optionalPillars.filter((p) => p !== 'food') })
}

export async function deleteEverything(db: SqlExecutor): Promise<void> {
  const names = await tableNames(db)
  await db.transaction(async (tx) => {
    await tx.exec('PRAGMA defer_foreign_keys = ON')
    for (const t of names) await tx.run(`DROP TABLE "${t}"`)
    await tx.exec('PRAGMA user_version = 0')
  })
  await migrate(db)
}
