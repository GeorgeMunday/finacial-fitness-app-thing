// Run by hand:  node scripts/build-seed.ts --exercises path/to/exercises.json [--cofid path/to/cofid.csv]
// Writes public/seed/exercises.json and, when --cofid is given, public/seed/cofid.json.
// exercises.json comes from github.com/yuhonas/free-exercise-db (Unlicense): dist/exercises.json.
// cofid.csv is the CoFID labelling dataset download from fnnbri.quadram.ac.uk (CC BY-NC-SA 4.0, non-commercial).
// public/seed/starter.json is Tally's own hand-written list of typical values. It is not CoFID and is never labelled as such.
import { readFileSync, writeFileSync } from 'node:fs'
import { convertCofidCsv } from './seedConvert.ts'

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

const ex = args.get('exercises')
if (ex) {
  const list = buildExercises(ex)
  writeFileSync(new URL('exercises.json', OUT), JSON.stringify(list, null, 1))
  console.log(`Wrote ${list.length} exercises to public/seed/exercises.json.`)
}
const cofid = args.get('cofid')
if (cofid) {
  try {
    const { foods, skipped } = convertCofidCsv(readFileSync(cofid, 'utf8'))
    writeFileSync(new URL('cofid.json', OUT), JSON.stringify(foods))
    console.log(`Wrote ${foods.length} foods to public/seed/cofid.json (skipped ${skipped} with missing nutrients).`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
if (!ex && !cofid) console.log('Usage: node scripts/build-seed.ts --exercises <json> [--cofid <csv>]')
