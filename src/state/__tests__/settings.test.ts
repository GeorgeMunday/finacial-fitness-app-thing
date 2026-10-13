import { describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import { migrate } from '../../db/migrations'
import { backupDue, getSettings, updateSettings, type Settings } from '../settings'

describe('settings', () => {
  it('returns defaults and merges patches', async () => {
    const db = memoryExecutor()
    await migrate(db)
    expect(await getSettings(db)).toEqual({
      onboarded: false, optionalPillars: [], healthConsent: false, hideCalories: false, weightUnit: 'kg', sex: 'unspecified',
      avatarIcon: 'user', avatarColour: 'pond', restSeconds: 90, dateFormat: 'long',
    })
    await updateSettings(db, { hideCalories: true })
    const s = await updateSettings(db, { weightUnit: 'lb' })
    expect(s).toMatchObject({ hideCalories: true, weightUnit: 'lb' })
    expect(await getSettings(db)).toEqual(s)
  })
  it('existing users get the new profile defaults merged in', async () => {
    const db = memoryExecutor()
    await migrate(db)
    await db.run("INSERT INTO settings (key, value) VALUES ('app', ?)", [JSON.stringify({ onboarded: true, weightUnit: 'lb' })])
    expect(await getSettings(db)).toMatchObject({ onboarded: true, weightUnit: 'lb', avatarIcon: 'user', restSeconds: 90, dateFormat: 'long' })
  })
  it('backupDue follows lastBackupAt and onboarding age', () => {
    const base: Settings = { onboarded: true, optionalPillars: [], healthConsent: false, hideCalories: false, weightUnit: 'kg', sex: 'unspecified', avatarIcon: 'user', avatarColour: 'pond', restSeconds: 90, dateFormat: 'long' }
    expect(backupDue({ ...base, lastBackupAt: '2026-09-11T10:00:00.000Z' }, '2026-10-12')).toBe(true)
    expect(backupDue({ ...base, lastBackupAt: '2026-09-13T10:00:00.000Z' }, '2026-10-12')).toBe(false)
    expect(backupDue({ ...base, onboardedAt: '2026-09-01T10:00:00.000Z' }, '2026-10-12')).toBe(true)
    expect(backupDue({ ...base, onboardedAt: '2026-10-01T10:00:00.000Z' }, '2026-10-12')).toBe(false)
    expect(backupDue({ ...base }, '2026-10-12')).toBe(false)
  })
})
