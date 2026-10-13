import { describe, expect, it } from 'vitest'
import { convertCofidCsv, parseCsv, requiredExerciseNames } from '../seedConvert.ts'

const header = 'Food Code,Food Name,"Energy (kcal) (kcal)",Protein (g),Carbohydrate (g),Fat (g)'

describe('parseCsv', () => {
  it('handles quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']])
  })
})

describe('convertCofidCsv', () => {
  it('converts rows, treats trace as 0 and skips foods with missing nutrients', () => {
    const csv = [
      header,
      '11-001,"Oats, porridge, raw",375,11.2,60.4,8.1',
      '11-002,Banana,95,1.2,Tr,0.3',
      '11-003,Mystery stew,N,4,5,6',
      '11-004,No fat value,100,4,5,',
    ].join('\n')
    const { foods, skipped } = convertCofidCsv(csv)
    expect(foods).toEqual([
      { name: 'Oats, porridge, raw', kcal_100g: 375, protein_100g: 11.2, carbs_100g: 60.4, fat_100g: 8.1 },
      { name: 'Banana', kcal_100g: 95, protein_100g: 1.2, carbs_100g: 0, fat_100g: 0.3 },
    ])
    expect(skipped).toBe(2)
  })
  it('fails clearly, naming every missing column', () => {
    const csv = 'Food Code,Food Name,Energy (kJ)\n1,Thing,100\n'
    expect(() => convertCofidCsv(csv)).toThrow(/missing columns: energy \(kcal\), protein, carbohydrate, fat/i)
    expect(() => convertCofidCsv(csv)).toThrow(/Found: Food Code, Food Name, Energy \(kJ\)/)
  })
  it('fails when there are no rows', () => {
    expect(() => convertCofidCsv(header + '\n')).toThrow(/no foods/i)
  })
})

describe('requiredExerciseNames', () => {
  it('lists each main and alternative exercise once, sorted', () => {
    const programmes = [
      { days: [{ exercises: [{ exercise: 'Squat', alt: null }, { exercise: 'Lat Pulldown', alt: 'Pullups' }] }] },
      { days: [{ exercises: [{ exercise: 'Squat' }, { exercise: 'Bench' }] }] },
    ]
    expect(requiredExerciseNames(programmes)).toEqual(['Bench', 'Lat Pulldown', 'Pullups', 'Squat'])
  })
})
