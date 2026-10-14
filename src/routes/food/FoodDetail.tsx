import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { OffAttribution } from '../../components/OffAttribution'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import type { Slot } from '../../db/types'
import { useAsync } from '../../hooks/useAsync'
import { deleteLog, getFood, lastGrams, logFood, servingOptions } from '../../domain/food'
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
  const { data } = useAsync(async () => ({ food: await getFood(db, foodId), last: await lastGrams(db, foodId) }), [db, foodId])
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
  return (
    <div className="flex flex-col gap-4">
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
      <p className="text-slate">
        {settings.hideCalories ? null : <>{Math.round((food.kcal100g * (valid ? g : 0)) / 100)} kcal, </>}
        {per(food.protein100g)} g protein, {per(food.carbs100g)} g carbs, {per(food.fat100g)} g fat
      </p>
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
      <OffAttribution />
    </div>
  )
}
