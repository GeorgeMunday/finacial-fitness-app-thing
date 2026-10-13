export type WeightUnit = 'kg' | 'lb'
const LB = 0.45359237

export function parseWeight(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n < 1000 ? n : null
}

export const toKg = (v: number, unit: WeightUnit): number => (unit === 'kg' ? v : v * LB)

/** Display value, rounded to the nearest 0.5. */
export const fromKg = (kg: number, unit: WeightUnit): number => Math.round((unit === 'kg' ? kg : kg / LB) * 2) / 2
