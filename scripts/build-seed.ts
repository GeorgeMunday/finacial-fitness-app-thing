// Run by hand:  node scripts/build-seed.ts --exercises path/to/exercises.json [--cofid path/to/cofid.csv]
// Writes public/seed/exercises.json and, when --cofid is given, public/seed/cofid.json.
// exercises.json comes from github.com/yuhonas/free-exercise-db (Unlicense): dist/exercises.json.
// cofid.csv is the CoFID labelling dataset download from fnnbri.quadram.ac.uk (CC BY-NC-SA 4.0, non-commercial).
import { readFileSync, writeFileSync } from 'node:fs'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])

const OUT = new URL('../public/seed/', import.meta.url)

type RawExercise = { name: string; equipment: string | null; primaryMuscles: string[]; category: string; mechanic: string | null; level: string }

function buildExercises(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawExercise[]
  const wanted = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'body only'])
  const pool = raw
    .filter((e) => e.category === 'strength' && e.equipment && wanted.has(e.equipment) && e.level !== 'expert')
    .sort((a, b) => Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound') || a.name.length - b.name.length || a.name.localeCompare(b.name))
  // Round-robin across primary muscles so the 150 cover the whole body.
  const byMuscle = new Map<string, RawExercise[]>()
  for (const e of pool) {
    const m = e.primaryMuscles[0] ?? 'other'
    byMuscle.set(m, [...(byMuscle.get(m) ?? []), e])
  }
  const picked: RawExercise[] = []
  while (picked.length < 150 && [...byMuscle.values()].some((l) => l.length)) {
    for (const list of byMuscle.values()) {
      const next = list.shift()
      if (next && picked.length < 150) picked.push(next)
    }
  }
  return picked
    .map((e) => ({ name: e.name, primary_muscle: e.primaryMuscles[0] ?? 'other', equipment: e.equipment ?? 'other' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') (row.push(cell), (cell = ''))
    else if (c === '\n' || c === '\r') {
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

function buildFoods(path: string) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  const col = (re: RegExp) => {
    const i = header.findIndex((h) => re.test(h))
    if (i < 0) throw new Error(`CoFID column not found: ${re}`)
    return i
  }
  const name = col(/^food name$/i), kcal = col(/energy.*kcal/i), protein = col(/^protein/i), carbs = col(/^carbohydrate/i), fat = col(/^fat/i)
  const num = (s: string) => {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const out = []
  for (const r of rows) {
    const v = [kcal, protein, carbs, fat].map((i) => num(r[i]))
    if (!r[name] || v.some((x) => x === null)) continue // skip foods with missing nutrients, never store zero-kcal guesses
    out.push({ name: r[name].trim(), kcal_100g: v[0]!, protein_100g: v[1]!, carbs_100g: v[2]!, fat_100g: v[3]! })
  }
  return out
}

const ex = args.get('exercises')
if (ex) {
  const list = buildExercises(ex)
  writeFileSync(new URL('exercises.json', OUT), JSON.stringify(list, null, 1))
  console.log(`exercises.json: ${list.length}`)
}
const cofid = args.get('cofid')
if (cofid) {
  const list = buildFoods(cofid)
  writeFileSync(new URL('cofid.json', OUT), JSON.stringify(list))
  console.log(`cofid.json: ${list.length}`)
}
if (!ex && !cofid) console.log('Usage: node scripts/build-seed.ts --exercises <json> [--cofid <csv>]')
