import { describe, expect, it } from 'vitest'
import { addMonths, localDate, monthRange, weekStart, yearRange } from '../dates'

describe('dates', () => {
  it('weekStart gives Monday', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12')
    expect(weekStart('2026-10-12')).toBe('2026-10-12')
  })
  it('monthRange / yearRange', () => {
    expect(monthRange('2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthRange('2026-02-10').to).toBe('2026-02-28')
    expect(yearRange('2026-12-31').to).toBe('2026-12-31')
    expect(yearRange('2026-12-31').from).toBe('2026-01-01')
  })
  it('localDate uses device-local date', () => {
    expect(localDate(new Date(2026, 9, 12, 23, 59))).toBe('2026-10-12')
    expect(localDate(new Date(2026, 9, 13, 0, 1))).toBe('2026-10-13')
  })
  it('addMonths clamps', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })
})
