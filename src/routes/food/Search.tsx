import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OffAttribution } from '../../components/OffAttribution'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import type { Food, Slot } from '../../db/types'
import { useAsync } from '../../hooks/useAsync'
import { deleteLog, quickAdd, recentFoods } from '../../domain/food'
import { searchFoods } from '../../domain/seed'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { slotFor } from './slots'

export default function Search() {
  const db = useDb()
  const toast = useToast()
  const { settings } = useSettings()
  const [params] = useSearchParams()
  const slot = (params.get('slot') as Slot | null) ?? slotFor(new Date())
  const [q, setQ] = useState('')
  const { data: foods } = useAsync(() => (q.trim() ? searchFoods(db, q.trim()) : recentFoods(db, 15)), [db, q])
  const [quick, setQuick] = useState(false)
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const kcalN = Number(kcal)
  const quickValid = kcal.trim() !== '' && Number.isFinite(kcalN) && kcalN >= 0 && (protein === '' || Number(protein) >= 0)
  const line = (f: Food) =>
    [f.brand, settings.hideCalories ? null : `${Math.round(f.kcal100g)} kcal`, `${f.protein100g} g protein per 100 g`].filter(Boolean).join(', ')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">Add food</h1>
      <label className="flex flex-col gap-1">
        Search foods
        <input className="min-h-11 rounded-xl border border-fog bg-surface px-3" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Link to={`/food/scan?slot=${slot}`} className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Scan barcode</Link>
        <Link to={`/food/new?name=${encodeURIComponent(q)}`} className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Create food</Link>
        <Button variant="secondary" onClick={() => setQuick(true)}>Quick add</Button>
      </div>
      <section aria-label={q ? 'Results' : 'Recent foods'}>
        {!q ? <h2 className="text-sm text-slate">Recent</h2> : null}
        {foods?.length === 0 ? <p className="py-3 text-slate">{q ? 'No foods match. Create it instead.' : 'Foods you log will show here.'}</p> : null}
        {foods?.map((f) => (
          <Link key={f.id} to={`/food/${f.id}?slot=${slot}`} className="flex min-h-14 flex-col justify-center border-b border-fog py-2">
            <span>{f.name}</span>
            <span className="text-sm text-slate">{line(f)}</span>
          </Link>
        ))}
      </section>
      <OffAttribution />
      <Sheet open={quick} onClose={() => setQuick(false)} title="Quick add">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">Calories<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Protein (g, optional)<input className="min-h-11 rounded-xl border border-fog bg-surface px-3" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} /></label>
          <Button
            disabled={!quickValid}
            onClick={async () => {
              const id = await quickAdd(db, { kcal: kcalN, proteinG: protein ? Number(protein) : 0, slot })
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
