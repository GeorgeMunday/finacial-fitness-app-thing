// Pure conversion helpers for scripts/build-seed.ts (kept separate so they can be tested).

export type SeedFood = { name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

const COLUMNS = [
  { key: 'name', label: 'food name', re: /^food name$/i },
  { key: 'kcal', label: 'energy (kcal)', re: /energy.*kcal/i },
  { key: 'protein', label: 'protein', re: /^protein/i },
  { key: 'carbs', label: 'carbohydrate', re: /^carbohydrate/i },
  { key: 'fat', label: 'fat', re: /^fat\b/i },
] as const

/** CoFID uses "Tr" for trace amounts (treated as 0) and "N" for not measured (the food is skipped). */
function nutrient(raw: string | undefined): number | null {
  const s = (raw ?? '').trim()
  if (/^tr$/i.test(s)) return 0
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Converts the CoFID labelling CSV. Throws, naming every missing column, if the layout isn't the expected one. */
export function convertCofidCsv(text: string): { foods: SeedFood[]; skipped: number } {
  const [header = [], ...rows] = parseCsv(text.replace(/^﻿/, ''))
  const idx: Record<string, number> = {}
  const missing: string[] = []
  for (const c of COLUMNS) {
    const i = header.findIndex((h) => c.re.test(h.trim()))
    if (i < 0) missing.push(c.label)
    else idx[c.key] = i
  }
  if (missing.length) {
    throw new Error(
      `CoFID CSV is missing columns: ${missing.join(', ')}. Found: ${header.map((h) => h.trim()).join(', ')}. ` +
        'Check you downloaded the CoFID labelling dataset as CSV, or update COLUMNS in scripts/seedConvert.ts.',
    )
  }
  const foods: SeedFood[] = []
  let skipped = 0
  for (const r of rows) {
    const name = (r[idx.name] ?? '').trim()
    const [kcal, protein, carbs, fat] = (['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => nutrient(r[idx[k]]))
    // Never store a guessed zero for a nutrient that wasn't measured.
    if (!name || kcal === null || protein === null || carbs === null || fat === null) {
      skipped++
      continue
    }
    foods.push({ name, kcal_100g: kcal, protein_100g: protein, carbs_100g: carbs, fat_100g: fat })
  }
  if (!foods.length) throw new Error(`CoFID CSV has no foods with complete nutrients (${skipped} rows skipped).`)
  return { foods, skipped }
}

type ProgrammeLike = { days: { exercises: { exercise: string; alt?: string | null }[] }[] }

/** Every exercise name (main or alternative) the programmes use, once each, sorted. */
export function requiredExerciseNames(programmes: ProgrammeLike[]): string[] {
  const names = new Set<string>()
  for (const p of programmes) for (const d of p.days) for (const e of d.exercises) {
    names.add(e.exercise)
    if (e.alt) names.add(e.alt)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}
