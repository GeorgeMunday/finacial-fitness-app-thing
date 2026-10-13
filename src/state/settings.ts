import type { SqlExecutor } from '../db/executor'
import type { Sex } from '../db/types'
import type { DateFormat } from '../domain/dates'
import { daysBetween } from '../domain/dates'

export type Settings = {
  onboarded: boolean
  onboardedAt?: string
  optionalPillars: ('food' | 'train')[]
  healthConsent: boolean
  hideCalories: boolean
  weightUnit: 'kg' | 'lb'
  sex: Sex
  monthlyIncomePence?: number
  kcalTarget?: number
  proteinTarget?: number
  lastBackupAt?: string
  theme?: 'light' | 'dark'
  displayName?: string
  avatarIcon: string
  avatarColour: string
  /** Mirrors the monthly income rule's pay day (the rule is the source of truth). */
  payDay?: number
  restSeconds: number
  dateFormat: DateFormat
}

const DEFAULTS: Settings = {
  onboarded: false, optionalPillars: [], healthConsent: false, hideCalories: false, weightUnit: 'kg', sex: 'unspecified',
  avatarIcon: 'user', avatarColour: 'pond', restSeconds: 90, dateFormat: 'long',
}

const KEY = 'app'

export async function getSettings(db: SqlExecutor): Promise<Settings> {
  const [row] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY])
  return { ...DEFAULTS, ...(row ? (JSON.parse(row.value) as Partial<Settings>) : {}) }
}

export async function updateSettings(db: SqlExecutor, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...patch }
  await db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [KEY, JSON.stringify(next), new Date().toISOString()],
  )
  return next
}

/** True when the last backup (or, failing that, onboarding) is more than 30 days before `today`. */
export function backupDue(settings: Settings, today: string): boolean {
  const ref = settings.lastBackupAt ?? settings.onboardedAt
  if (!ref) return false
  return daysBetween(ref.slice(0, 10), today) > 30
}
