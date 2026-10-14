import { useState } from 'react'
import { Link, Route, Routes, useSearchParams } from 'react-router-dom'
import { FoodTile } from '../components/FoodTile'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { useAsync } from '../hooks/useAsync'
import { addDays, localDate } from '../domain/dates'
import { copyDay, dailyKcal, dayLogsNamed, dayTotals, deleteLog, restoreLog } from '../domain/food'
import { foodPhotos } from '../domain/photos'
import { loggingStreak, proteinWeek } from '../domain/targets'
import { SUPPORT_MESSAGE, lowIntakeStreak } from '../domain/safety'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { EditLogSheet } from './food/EditLogSheet'
import FoodDetail from './food/FoodDetail'
import NewFood from './food/NewFood'
import PlanWeek from './food/PlanWeek'
import RecipeDetail from './food/RecipeDetail'
import RecipeEdit from './food/RecipeEdit'
import Recipes from './food/Recipes'
import Scan from './food/Scan'
import Search from './food/Search'
import { SLOTS, dayLabel, logDateParam, withDate } from './food/slots'
import { TargetsCard } from './food/TargetsCard'

function FoodDay() {
  const db = useDb()
  const toast = useToast()
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const date = logDateParam(params)
  const setDate = (d: string) => setParams(d === localDate() ? {} : { date: d }, { replace: true })
  const [editing, setEditing] = useState<string | null>(null)
  const { data, reload } = useAsync(async () => {
    const logs = await dayLogsNamed(db, date)
    return {
    logs,
    photos: await foodPhotos(db, [...new Set(logs.map((l) => l.foodId).filter((x): x is string => !!x))]),
    totals: await dayTotals(db, date),
    recent: await dailyKcal(db, addDays(localDate(), -6), localDate()),
    week: settings.proteinTarget ? await proteinWeek(db, date, settings.proteinTarget) : null,
    streak: await loggingStreak(db, localDate()),
    }
  }, [db, date, settings.proteinTarget])
  if (!data) return null
  const { logs, totals } = data
  const hide = settings.hideCalories
  const label = date === localDate() ? 'Today' : dayLabel(date)
  const editLog = logs.find((l) => l.id === editing)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button variant="quiet" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</Button>
        <h1 className="font-display text-xl font-semibold">{label}</h1>
        <Button variant="quiet" aria-label="Next day" disabled={date >= localDate()} onClick={() => setDate(addDays(date, 1))}>›</Button>
      </div>
      <TargetsCard totals={totals} settings={settings} week={data.week} streak={data.streak} />
      <div className="flex flex-wrap gap-2">
        <Link to="/food/recipes" className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Recipes</Link>
        <Link to="/food/plan" className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Plan my week</Link>
        <Link to="/progress" className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Your progress</Link>
      </div>
      {lowIntakeStreak(data.recent, settings.sex) ? <p className="rounded-xl bg-surface p-3">{SUPPORT_MESSAGE}</p> : null}
      {SLOTS.map(({ slot, label: slotLabel }) => {
        const items = logs.filter((l) => l.slot === slot)
        return (
          <section key={slot} aria-label={slotLabel}>
            <div className="flex items-center justify-between border-b border-fog">
              <h2 className="font-semibold">{slotLabel}</h2>
              <div className="flex">
                <Button
                  variant="quiet"
                  onClick={async () => {
                    const n = await copyDay(db, addDays(date, -1), date, slot)
                    reload()
                    toast.show(n ? `Copied ${n} from yesterday` : 'Nothing to copy from yesterday')
                  }}
                >
                  Copy yesterday
                </Button>
                <Link to={withDate('/food/search', date, { slot })} aria-label={`Add to ${slotLabel}`} className="flex min-h-11 min-w-11 items-center justify-center text-pond">Add</Link>
              </div>
            </div>
            {items.map((l) => (
              <div key={l.id} className="flex min-h-16 items-center gap-3 border-b border-fog">
                <button type="button" aria-label={`Edit ${l.name}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left" onClick={() => setEditing(l.id)}>
                  <FoodTile name={l.name} photo={l.foodId ? data.photos.get(l.foodId) : null} />
                  <span className="min-w-0">
                    <span className="block truncate">{l.name}</span>
                    <span className="mt-0.5 block text-sm text-slate">
                      {[l.grams ? `${l.grams} g` : null, hide ? null : `${l.kcal} kcal`, `${l.proteinG} g protein`].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </button>
                <Button
                  variant="quiet" aria-label={`Delete ${l.name}`}
                  onClick={async () => {
                    await deleteLog(db, l.id)
                    reload()
                    toast.show('Deleted', { undo: () => void restoreLog(db, l.id).then(reload) })
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </section>
        )
      })}
      {editLog ? (
        <EditLogSheet
          log={editLog} onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
            toast.show('Saved')
          }}
        />
      ) : null}
    </div>
  )
}

export default function Food() {
  return (
    <Routes>
      <Route index element={<FoodDay />} />
      <Route path="search" element={<Search />} />
      <Route path="scan" element={<Scan />} />
      <Route path="new" element={<NewFood />} />
      <Route path="plan" element={<PlanWeek />} />
      <Route path="recipes" element={<Recipes />} />
      <Route path="recipes/new" element={<RecipeEdit />} />
      <Route path="recipes/:id" element={<RecipeDetail />} />
      <Route path="recipes/:id/edit" element={<RecipeEdit />} />
      <Route path=":foodId" element={<FoodDetail />} />
    </Routes>
  )
}
