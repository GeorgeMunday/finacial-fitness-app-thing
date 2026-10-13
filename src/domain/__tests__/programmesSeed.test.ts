import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { seedAll, type SeedData } from '../seed'

const file = <T,>(name: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/seed', name), 'utf8')) as T
export const realSeed = (): SeedData => ({
  starter: file('starter.json'), cofid: [], exercises: file('exercises.json'), programmes: file('programmes.json'), recipes: null,
})

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
  await seedAll(db, realSeed())
})

type Row = { day: string; name: string; tier: string; sets: number; rep_min: number; rep_max: number; week: number | null; percent: number | null; is_amrap: number; lift_key: string; increment_kg: number | null }
async function rows(key: string): Promise<Row[]> {
  return db.all<Row>(
    `SELECT d.name AS day, e.name, x.tier, x.sets, x.rep_min, x.rep_max, x.week, x.percent, x.is_amrap, x.lift_key, x.increment_kg
     FROM programme_day_exercises x JOIN programme_days d ON d.id = x.day_id JOIN programmes p ON p.id = d.programme_id
     JOIN exercises e ON e.id = x.exercise_id WHERE p.key = ? ORDER BY d.position, x.position`, [key])
}
const range = (r: Row) => (r.rep_min === r.rep_max ? `${r.rep_min}` : `${r.rep_min}–${r.rep_max}`)
async function outline(key: string, day: string) {
  return (await rows(key)).filter((r) => r.day === day).map((r) => `${r.name} ${r.sets}×${range(r)}`)
}

describe('programme seed', () => {
  it('seeds five programmes', async () => {
    const list = await db.all<{ key: string }>('SELECT key FROM programmes ORDER BY key')
    expect(list.map((p) => p.key)).toEqual(['531-beginners', 'full-body-beginner', 'gzclp', 'phul', 'ppl'])
  })
  it('Push / Pull / Legs matches the brief', async () => {
    expect(await outline('ppl', 'Push day')).toEqual([
      'Barbell Bench Press - Medium Grip 4×6–8', 'Standing Military Press 3×8–10', 'Incline Dumbbell Press 3×8–12', 'Side Lateral Raise 3×12–15', 'Triceps Pushdown 3×10–12'])
    expect(await outline('ppl', 'Pull day')).toEqual([
      'Barbell Deadlift 3×5', 'Wide-Grip Lat Pulldown 3×8–10', 'Seated Cable Rows 3×10–12', 'Face Pull 3×15', 'Dumbbell Bicep Curl 3×10–12'])
    expect(await outline('ppl', 'Legs day')).toEqual([
      'Barbell Squat 4×6–8', 'Romanian Deadlift 3×8–10', 'Leg Press 3×10–12', 'Seated Leg Curl 3×10–12', 'Standing Calf Raises 4×12–15'])
    const [alt] = await db.all<{ n: string }>(`SELECT a.name AS n FROM programme_day_exercises x JOIN exercises e ON e.id = x.exercise_id JOIN exercises a ON a.id = x.alt_exercise_id WHERE e.name = 'Wide-Grip Lat Pulldown'`)
    expect(alt.n).toBe('Pullups')
  })
  it('Upper / Lower matches the brief', async () => {
    expect(await outline('phul', 'Upper power')).toEqual([
      'Barbell Bench Press - Medium Grip 3×3–5', 'Bent Over Barbell Row 3×3–5', 'Standing Military Press 3×6–8', 'Wide-Grip Lat Pulldown 3×6–10', 'Barbell Curl 2×6–10', 'EZ-Bar Skullcrusher 2×6–10'])
    expect(await outline('phul', 'Lower power')).toEqual([
      'Barbell Squat 3×3–5', 'Barbell Deadlift 3×3–5', 'Leg Press 3×10–15', 'Seated Leg Curl 3×6–10', 'Standing Calf Raises 4×6–10'])
    expect(await outline('phul', 'Upper hypertrophy')).toEqual([
      'Incline Dumbbell Press 3×8–12', 'Dumbbell Flyes 3×8–12', 'Seated Cable Rows 3×8–12', 'One-Arm Dumbbell Row 3×8–12', 'Side Lateral Raise 3×10–15', 'Incline Dumbbell Curl 3×8–12', 'Triceps Pushdown 3×8–12'])
    expect(await outline('phul', 'Lower hypertrophy')).toEqual([
      'Front Squat (Clean Grip) 3×8–12', 'Barbell Walking Lunge 3×8–12', 'Leg Extensions 3×10–15', 'Seated Leg Curl 3×10–15', 'Seated Calf Raise 4×8–12'])
    const curls = (await rows('phul')).filter((r) => r.name === 'Seated Leg Curl').map((r) => r.lift_key)
    expect(new Set(curls).size).toBe(2)
  })
  it('Full body beginner matches the brief', async () => {
    expect(await outline('full-body-beginner', 'Workout A')).toEqual(['Barbell Squat 3×5', 'Barbell Bench Press - Medium Grip 3×5', 'Bent Over Barbell Row 3×5', 'Chin-Up 3×1'])
    expect(await outline('full-body-beginner', 'Workout B')).toEqual(['Barbell Squat 3×5', 'Standing Military Press 3×5', 'Barbell Deadlift 1×5', 'Chin-Up 3×1'])
    const all = await rows('full-body-beginner')
    expect(all.filter((r) => r.tier === 'bw').every((r) => r.is_amrap === 1)).toBe(true)
  })
  it('full body rows carry the 2.5 kg increment and the deadlift 5 kg; PPL rows carry none', async () => {
    const fb = await rows('full-body-beginner')
    for (const r of fb.filter((x) => x.tier !== 'bw')) expect(r.increment_kg, r.name).toBe(r.name === 'Barbell Deadlift' ? 5 : 2.5)
    for (const r of await rows('ppl')) expect(r.increment_kg).toBeNull()
  })
  it('GZCLP matches the brief', async () => {
    const days = (await rows('gzclp')).reduce<Record<string, string[]>>((m, r) => ((m[r.day] ??= []).push(`${r.tier.toUpperCase()} ${r.name} ${r.sets}×${range(r)}${r.is_amrap ? '+' : ''}`), m), {})
    expect(days['Day 1']).toEqual(['T1 Barbell Squat 5×3+', 'T2 Barbell Bench Press - Medium Grip 3×10', 'T3 Wide-Grip Lat Pulldown 3×15+'])
    expect(days['Day 2']).toEqual(['T1 Standing Military Press 5×3+', 'T2 Barbell Deadlift 3×10', 'T3 One-Arm Dumbbell Row 3×15+'])
    expect(days['Day 3']).toEqual(['T1 Barbell Bench Press - Medium Grip 5×3+', 'T2 Barbell Squat 3×10', 'T3 Wide-Grip Lat Pulldown 3×15+'])
    expect(days['Day 4']).toEqual(['T1 Barbell Deadlift 5×3+', 'T2 Standing Military Press 3×10', 'T3 One-Arm Dumbbell Row 3×15+'])
  })
  it('5/3/1 days pair the right lifts, each with 9 main sets, 3 back-off rows and 3 assistance rows', async () => {
    const all = await rows('531-beginners')
    const lifts = (day: string) => [...new Set(all.filter((r) => r.day === day && r.tier === 'm531').map((r) => r.name))]
    expect(lifts('Day 1')).toEqual(['Barbell Squat', 'Barbell Bench Press - Medium Grip'])
    expect(lifts('Day 2')).toEqual(['Barbell Deadlift', 'Standing Military Press'])
    expect(lifts('Day 3')).toEqual(['Barbell Bench Press - Medium Grip', 'Barbell Squat'])
    for (const day of ['Day 1', 'Day 2', 'Day 3']) {
      const d = all.filter((r) => r.day === day)
      expect(d.filter((r) => r.tier === 'm531')).toHaveLength(18)
      expect(d.filter((r) => r.tier === 'fsl')).toHaveLength(6)
      expect(d.filter((r) => r.tier === 'assist')).toHaveLength(3)
    }
    // Squat comes first, its back-off rows follow it, then the bench.
    const d1 = all.filter((r) => r.day === 'Day 1').map((r) => `${r.name}|${r.tier}`)
    expect(d1.indexOf('Barbell Squat|fsl')).toBeLessThan(d1.indexOf('Barbell Bench Press - Medium Grip|m531'))
  })
  it('5/3/1 week percentages and reps are 65/75/85×5, 70/80/90×3 and 75/85/95 × 5,3,1 with the last set AMRAP', async () => {
    const sq = (await rows('531-beginners')).filter((r) => r.day === 'Day 1' && r.name === 'Barbell Squat')
    const main = (w: number) => sq.filter((r) => r.tier === 'm531' && r.week === w)
    expect(main(1).map((r) => [r.percent, r.rep_min, r.is_amrap])).toEqual([[65, 5, 0], [75, 5, 0], [85, 5, 1]])
    expect(main(2).map((r) => [r.percent, r.rep_min, r.is_amrap])).toEqual([[70, 3, 0], [80, 3, 0], [90, 3, 1]])
    expect(main(3).map((r) => [r.percent, r.rep_min, r.is_amrap])).toEqual([[75, 5, 0], [85, 3, 0], [95, 1, 1]])
    expect(sq.filter((r) => r.tier === 'fsl').map((r) => [r.week, r.percent, r.sets, r.rep_min])).toEqual([[1, 65, 5, 5], [2, 70, 5, 5], [3, 75, 5, 5]])
  })
  it('credits the three authors and no other programme has one', async () => {
    const authors = await db.all<{ key: string; author: string | null }>('SELECT key, author FROM programmes ORDER BY key')
    expect(authors).toEqual([
      { key: '531-beginners', author: 'Jim Wendler' }, { key: 'full-body-beginner', author: null }, { key: 'gzclp', author: 'Cody Lefever' },
      { key: 'phul', author: 'Brandon Campbell' }, { key: 'ppl', author: null }])
  })
  it('descriptions are short, name the author where there is one and contain no URL', async () => {
    for (const p of await db.all<{ description: string; author: string | null }>('SELECT description, author FROM programmes')) {
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.description.length).toBeLessThanOrEqual(280)
      expect(p.description).not.toMatch(/https?:|www\.|\.com/i)
      if (p.author) expect(p.description).toContain(p.author.split(' ')[1])
    }
  })
  it('records level, days a week and the progression kind', async () => {
    const list = await db.all<{ key: string; level: string; progression: string; days_per_week_options: string }>('SELECT key, level, progression, days_per_week_options FROM programmes ORDER BY key')
    expect(list.map((p) => [p.key, p.level, p.progression, JSON.parse(p.days_per_week_options)])).toEqual([
      ['531-beginners', 'intermediate', 'wendler531', [3]], ['full-body-beginner', 'beginner', 'linear', [3]], ['gzclp', 'intermediate', 'gzclp', [4]],
      ['phul', 'intermediate', 'double', [4]], ['ppl', 'beginner', 'double', [3, 6]]])
  })
  it('seeding twice inserts nothing the second time, and a renamed programme survives', async () => {
    await db.run("UPDATE programmes SET name = 'My PPL' WHERE key = 'ppl'")
    const before = (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM programme_day_exercises'))[0].n
    expect((await seedAll(db, realSeed())).programmes).toBe(0)
    expect((await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM programme_day_exercises'))[0].n).toBe(before)
    expect(await db.all("SELECT name FROM programmes WHERE key = 'ppl'")).toEqual([{ name: 'My PPL' }])
  })
  it('fails clearly if a programme names an exercise that is not in the exercise seed', async () => {
    const bad = realSeed()
    bad.exercises = bad.exercises.filter((e) => e.name !== 'Face Pull')
    const fresh = memoryExecutor()
    await migrate(fresh)
    await expect(seedAll(fresh, bad)).rejects.toThrow('Exercise not found: Face Pull')
  })
})
