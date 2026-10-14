import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { createUserFood } from '../../domain/food'
import { useDb } from '../../state/DbProvider'
import { logDateParam, withDate } from './slots'

const input = 'min-h-11 w-full rounded-xl border border-fog bg-surface px-3'
const n = (s: string) => {
  const v = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null
}

export default function NewFood() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [f, setF] = useState({
    name: params.get('name') ?? '', brand: params.get('brand') ?? '', barcode: params.get('barcode') ?? '',
    kcal: params.get('kcal') ?? '', protein: params.get('protein') ?? '', carbs: params.get('carbs') ?? '', fat: params.get('fat') ?? '',
    serving: params.get('serving') ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }))
  const kcal = n(f.kcal), protein = n(f.protein), carbs = n(f.carbs), fat = n(f.fat)
  const serving = f.serving.trim() === '' ? null : n(f.serving)
  const valid = f.name.trim() !== '' && kcal !== null && protein !== null && carbs !== null && fat !== null && (f.serving.trim() === '' || (serving ?? 0) > 0)
  const field = (label: string, k: keyof typeof f, decimal = true) => (
    <label className="flex flex-col gap-1">{label}<input className={input} inputMode={decimal ? 'decimal' : undefined} value={f[k]} onChange={set(k)} /></label>
  )
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-xl font-semibold">Create food</h1>
      {f.barcode ? <p className="text-slate">We couldn't find every detail for this barcode. Check the label and fill in the rest.</p> : null}
      {field('Food name', 'name', false)}
      {field('Brand (optional)', 'brand', false)}
      <label className="flex flex-col gap-1">Barcode<input className={input} inputMode="numeric" value={f.barcode} onChange={set('barcode')} /></label>
      {field('Calories per 100 g', 'kcal')}
      {field('Protein per 100 g', 'protein')}
      {field('Carbs per 100 g', 'carbs')}
      {field('Fat per 100 g', 'fat')}
      {field('Serving size in g (optional)', 'serving')}
      <Button
        disabled={!valid}
        onClick={async () => {
          const id = await createUserFood(db, {
            createdAt: '', updatedAt: '', deletedAt: null, name: f.name, brand: f.brand.trim() || null, barcode: f.barcode.trim() || null,
            kcal100g: kcal!, protein100g: protein!, carbs100g: carbs!, fat100g: fat!, servingG: serving, servingLabel: null,
          })
          toast.show('Food saved')
          navigate(withDate(`/food/${id}`, logDateParam(params), { slot: params.get('slot') ?? '' }), { replace: true })
        }}
      >
        Save food
      </Button>
    </div>
  )
}
