import { describe, expect, it } from 'vitest'
import { SUPPORT_MESSAGE, clampTarget, goalWeightWarning, lowIntakeStreak, maxWeeklyLossKg } from '../safety'

describe('safety', () => {
  it('clamps targets to the floor', () => {
    expect(clampTarget(1000, 'female')).toEqual({ kcal: 1200, clamped: true })
    expect(clampTarget(1400, 'unspecified')).toEqual({ kcal: 1500, clamped: true })
    expect(clampTarget(1800, 'male')).toEqual({ kcal: 1800, clamped: false })
  })
  it('max weekly loss is 1% of body weight', () => expect(maxWeeklyLossKg(80)).toBe(0.8))
  it('flags goal weights under BMI 18.5', () => {
    expect(goalWeightWarning(50, 175)).toBe(true)
    expect(goalWeightWarning(65, 175)).toBe(false)
  })
  it('detects 3 consecutive logged days under the floor', () => {
    const d = (logDate: string, kcal: number) => ({ logDate, kcal })
    expect(lowIntakeStreak([d('2026-10-10', 900), d('2026-10-11', 900), d('2026-10-12', 900)], 'female')).toBe(true)
    expect(lowIntakeStreak([d('2026-10-10', 900), d('2026-10-11', 900), d('2026-10-13', 900)], 'female')).toBe(false)
    expect(lowIntakeStreak([d('2026-10-12', 900), d('2026-10-10', 900), d('2026-10-11', 900)], 'male')).toBe(true)
    expect(lowIntakeStreak([d('2026-10-10', 900), d('2026-10-11', 1300), d('2026-10-12', 900)], 'female')).toBe(false)
  })
  it('support message is gentle and names Beat', () => {
    expect(SUPPORT_MESSAGE).toContain('Beat')
    expect(SUPPORT_MESSAGE).toContain('beateatingdisorders.org.uk')
    expect(SUPPORT_MESSAGE.toLowerCase()).not.toMatch(/warning|danger/)
  })
})
