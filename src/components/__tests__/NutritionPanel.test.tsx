import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NutritionPanel, energySplit } from '../NutritionPanel'

const n = { kcal: 400, proteinG: 30, carbsG: 40, fatG: 13.3, fibreG: 6, sugarsG: 4.5, saltG: null }

describe('energySplit', () => {
  it('splits energy 4/4/9 into whole percentages that add to 100', () => {
    expect(energySplit(30, 40, 13.3)).toEqual({ protein: 30, carbs: 40, fat: 30 })
    const s = energySplit(10, 10, 10)!
    expect(s.protein + s.carbs + s.fat).toBe(100)
  })
  it('is null when there is no energy to split', () => {
    expect(energySplit(0, 0, 0)).toBeNull()
  })
})

describe('NutritionPanel', () => {
  it('labels every bar segment in text and lists each nutrient, saying when one is not known', () => {
    render(<NutritionPanel n={n} hideCalories={false} />)
    expect(screen.getByRole('img', { name: 'Energy from protein 30%, carbs 40%, fat 30%' })).toBeInTheDocument()
    for (const t of ['Protein 30%', 'Carbs 40%', 'Fat 30%']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Fibre 6 g/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /of which sugars 4.5 g/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Salt Not known/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Calories 400 kcal/ })).toBeInTheDocument()
  })
  it('leaves calories out when they are hidden', () => {
    render(<NutritionPanel n={n} hideCalories />)
    expect(document.body.textContent).not.toMatch(/kcal|Calories/i)
  })
})
