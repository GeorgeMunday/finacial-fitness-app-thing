import { describe, expect, it } from 'vitest'
import { fromKg, parseWeight, toKg } from '../units'

describe('units', () => {
  it('converts', () => {
    expect(toKg(100, 'lb')).toBeCloseTo(45.36, 2)
    expect(toKg(60, 'kg')).toBe(60)
    expect(fromKg(60, 'lb')).toBe(132.5)
    expect(fromKg(62.4, 'kg')).toBe(62.5)
  })
  it('parses weights', () => {
    expect(parseWeight('62,5')).toBe(62.5)
    expect(parseWeight(' 62.5 ')).toBe(62.5)
    expect(parseWeight('x')).toBeNull()
    expect(parseWeight('-5')).toBeNull()
    expect(parseWeight('')).toBeNull()
  })
})
