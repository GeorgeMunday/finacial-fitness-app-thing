import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FoodTile } from '../../components/FoodTile'
import { OffAttribution } from '../../components/OffAttribution'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import type { Food, Slot } from '../../db/types'
import { useAsync } from '../../hooks/useAsync'
import { localDate } from '../../domain/dates'
import { deleteLog, quickAdd, recentFoods } from '../../domain/food'
import { foodPhotos } from '../../domain/photos'
import { searchFoods } from '../../domain/seed'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { dayLabel, logDateParam, slotFor, withDate } from './slots'

export default function Search() {
  const db = useDb()
  const toast = useToast()
  const { settings } = useSettings()
  const [params] = useSearchParams()
  const slot = (params.get('slot') as Slot | null) ?? slotFor(new Date())
  const date = logDateParam(params)
  const [q, setQ] = useState('')
  const { data } = useAsync(async () => {
    const list = q.trim() ? await searchFoods(db, q.trim()) : await recentFoods(db, 15)
    return { list, photos: await foodPhotos(db, list.map((f) => f.id)) }
  }, [db, q])
  const foods = data?.list
  const [quick, setQuick] = useState(false)
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const kcalN = Number(kcal)
  const optional = (v: string) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0)
  const quickValid = kcal.trim() !== '' && Number.isFinite(kcalN) && kcalN >= 0 && [protein, carbs, fat].every(optional)
  const line = (f: Food) =>
    [f.brand, settings.hideCalories ? null : `${Math.round(f.kcal100g)} kcal`, `${f.protein100g} g protein per 100 g`].filter(Boolean).join(', ')
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold">Add food</h1>
        {date !== localDate() ? <p className="text-slate">Adding to {dayLabel(date)}</p> : null}
      </div>
      <label className="flex flex-col gap-1">
        Search foods
        <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Link to={withDate('/food/scan', date, { slot })} className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Scan barcode</Link>
        <Link to={withDate('/food/new', date, { name: q, slot })} className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Create food</Link>
        <Button variant="secondary" onClick={() => setQuick(true)}>Quick add</Button>
      </div>
      <section aria-label={q ? 'Results' : 'Recent foods'}>
        {!q ? <h2 className="text-sm text-slate">Recent</h2> : null}
        {foods?.length === 0 ? <p className="py-3 text-slate">{q ? 'No foods match. Create it instead.' : 'Foods you log will show here.'}</p> : null}
        {foods?.map((f) => (
          <Link key={f.id} to={withDate(`/food/${f.id}`, date, { slot })} className="flex min-h-14 items-center gap-3 border-b border-fog py-2">
            <FoodTile name={f.name} photo={data?.photos.get(f.id)} />
            <span className="flex min-w-0 flex-col">
              <span>{f.name}</span>
              <span className="text-sm text-slate">{line(f)}</span>
            </span>
          </Link>
        ))}
      </section>
      <OffAttribution />
      <Sheet open={quick} onClose={() => setQuick(false)} title="Quick add">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">Name (optional)<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Calories<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Protein (g, optional)<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Carbs (g, optional)<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Fat (g, optional)<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} /></label>
          <Button
            disabled={!quickValid}
            onClick={async () => {
              const id = await quickAdd(db, { name, kcal: kcalN, proteinG: Number(protein || 0), carbsG: Number(carbs || 0), fatG: Number(fat || 0), slot, logDate: date })
              setQuick(false)
              toast.show('Food logged', { undo: () => void deleteLog(db, id) })
            }}
          >
            Log food
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
