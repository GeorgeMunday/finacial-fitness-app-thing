import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FoodTile } from '../../components/FoodTile'
import { NutritionPanel } from '../../components/NutritionPanel'
import { OffAttribution } from '../../components/OffAttribution'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import type { Slot } from '../../db/types'
import { useAsync } from '../../hooks/useAsync'
import { deleteLog, getFood, lastGrams, logFood, servingOptions } from '../../domain/food'
import { foodPhotos } from '../../domain/photos'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { localDate } from '../../domain/dates'
import { SLOTS, dayLabel, logDateParam, slotFor, withDate } from './slots'

export default function FoodDetail() {
  const { foodId = '' } = useParams()
  const [params] = useSearchParams()
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const { data } = useAsync(
    async () => ({ food: await getFood(db, foodId), last: await lastGrams(db, foodId), photo: (await foodPhotos(db, [foodId])).get(foodId) ?? null }),
    [db, foodId],
  )
  const [grams, setGrams] = useState('')
  const [slot, setSlot] = useState<Slot>((params.get('slot') as Slot | null) ?? slotFor(new Date()))
  const date = logDateParam(params)
  useEffect(() => {
    if (data?.food) setGrams(String(data.last ?? data.food.servingG ?? 100))
  }, [data])
  if (!data) return null
  const { food } = data
  if (!food) return <p>That food couldn't be found.</p>
  const g = Number(grams.replace(',', '.'))
  const valid = Number.isFinite(g) && g > 0 && g < 5000
  const per = (v: number) => Math.round((v * (valid ? g : 0)) / 10) / 10
  const perKnown = (v: number | null | undefined) => (v == null ? null : per(v))
  return (
    <div className="flex flex-col gap-4">
      {data.photo ? <FoodTile name={food.name} photo={data.photo} size="lg" /> : null}
      <div>
        <h1 className="font-display text-xl font-semibold">{food.name}</h1>
        {food.brand ? <p className="text-slate">{food.brand}</p> : null}
        {date !== localDate() ? <p className="text-slate">Adding to {dayLabel(date)}</p> : null}
      </div>
      <label className="flex flex-col gap-1">
        Portion (g)
        <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
      </label>
      {servingOptions(food).length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Servings">
          {servingOptions(food).map((s) => (
            <Chip key={s.label} selected={valid && g === s.grams} onClick={() => setGrams(String(s.grams))}>{s.label}</Chip>
          ))}
        </div>
      ) : null}
      {!valid && grams !== '' ? <p className="text-amber-ink">Enter a portion in grams, like 40.</p> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
        {SLOTS.map((s) => <Chip key={s.slot} selected={slot === s.slot} onClick={() => setSlot(s.slot)}>{s.label}</Chip>)}
      </div>
      <Button
        disabled={!valid}
        onClick={async () => {
          const id = await logFood(db, { foodId, grams: g, slot, logDate: date })
          toast.show('Food logged', { undo: () => void deleteLog(db, id) })
          navigate(withDate('/food', date))
        }}
      >
        Log food
      </Button>
      <section aria-label="Nutrition" className="flex flex-col gap-2">
        <h2 className="font-semibold">{valid ? `In ${g} g` : 'Per 100 g'}</h2>
        <NutritionPanel
          hideCalories={settings.hideCalories}
          n={valid
            ? { kcal: Math.round((food.kcal100g * g) / 100), proteinG: per(food.protein100g), carbsG: per(food.carbs100g), fatG: per(food.fat100g),
                fibreG: perKnown(food.fibre100g), sugarsG: perKnown(food.sugars100g), saltG: perKnown(food.salt100g) }
            : { kcal: food.kcal100g, proteinG: food.protein100g, carbsG: food.carbs100g, fatG: food.fat100g,
                fibreG: food.fibre100g ?? null, sugarsG: food.sugars100g ?? null, saltG: food.salt100g ?? null }}
        />
      </section>
      <OffAttribution />
    </div>
  )
}
