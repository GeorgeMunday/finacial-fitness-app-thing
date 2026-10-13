import { describe, expect, it } from 'vitest'
import { addMonths, addMonthsAnchored, formatDate, monthLabel, localDate, monthRange, nextMonthlyOccurrence, weekStart, yearRange } from '../dates'

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
  it('nextMonthlyOccurrence finds the next pay day, clamped to short months', () => {
    expect(nextMonthlyOccurrence('2026-10-13', 1)).toBe('2026-11-01')
    expect(nextMonthlyOccurrence('2026-10-13', 13)).toBe('2026-10-13')
    expect(nextMonthlyOccurrence('2026-10-13', 31)).toBe('2026-10-31')
    expect(nextMonthlyOccurrence('2026-02-10', 31)).toBe('2026-02-28')
    expect(nextMonthlyOccurrence('2028-02-10', 30)).toBe('2028-02-29')
    expect(nextMonthlyOccurrence('2026-12-20', 15)).toBe('2027-01-15')
    expect(nextMonthlyOccurrence('2026-04-30', 31)).toBe('2026-04-30')
  })
  it('addMonthsAnchored returns to the anchor day after a short month', () => {
    expect(addMonthsAnchored('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(addMonthsAnchored('2026-02-28', 1, 31)).toBe('2026-03-31')
    expect(addMonthsAnchored('2026-02-28', 12, 29)).toBe('2027-02-28')
  })
  it('formats dates in the chosen style', () => {
    expect(formatDate('2026-10-12', 'long')).toBe('12 Oct 2026')
    expect(formatDate('2026-10-12', 'numeric')).toBe('12/10/2026')
    expect(formatDate('2026-01-05', 'numeric')).toBe('05/01/2026')
    expect(formatDate('2026-01-05', 'long')).toBe('5 Jan 2026')
  })
  it('labels months by short name', () => {
    expect(monthLabel('2026-10')).toBe('Oct')
    expect(monthLabel('2027-01')).toBe('Jan')
  })
})
