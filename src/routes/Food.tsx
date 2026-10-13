import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ListRow } from '../components/ui/ListRow'
import { useToast } from '../components/ui/Toast'
import { useAsync } from '../hooks/useAsync'
import { addDays, localDate } from '../domain/dates'
import { copyDay, dailyKcal, dayLogsNamed, dayTotals, deleteLog, restoreLog } from '../domain/food'
import { SUPPORT_MESSAGE, lowIntakeStreak } from '../domain/safety'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import FoodDetail from './food/FoodDetail'
import NewFood from './food/NewFood'
import PlanWeek from './food/PlanWeek'
import RecipeDetail from './food/RecipeDetail'
import RecipeEdit from './food/RecipeEdit'
import Recipes from './food/Recipes'
import Scan from './food/Scan'
import Search from './food/Search'
import { SLOTS } from './food/slots'

function FoodDay() {
  const db = useDb()
  const toast = useToast()
  const { settings } = useSettings()
  const [date, setDate] = useState(localDate())
  const { data, reload } = useAsync(async () => ({
    logs: await dayLogsNamed(db, date),
    totals: await dayTotals(db, date),
    recent: await dailyKcal(db, addDays(localDate(), -6), localDate()),
  }), [db, date])
  if (!data) return null
  const { logs, totals } = data
  const hide = settings.hideCalories
  const label = date === localDate() ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button variant="quiet" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</Button>
        <h1 className="font-display text-xl font-semibold">{label}</h1>
        <Button variant="quiet" aria-label="Next day" disabled={date >= localDate()} onClick={() => setDate(addDays(date, 1))}>›</Button>
      </div>
      <section aria-label="Totals" className="flex gap-6">
        {hide ? null : (
          <div>
            <p className="font-display text-2xl font-semibold tabular">{totals.kcal.toLocaleString('en-GB')}</p>
            <p className="text-sm text-slate">{settings.kcalTarget ? `of ${settings.kcalTarget.toLocaleString('en-GB')} kcal` : 'kcal'}</p>
          </div>
        )}
        <div>
          <p className="font-display text-2xl font-semibold tabular">{totals.proteinG} g</p>
          <p className="text-sm text-slate">{settings.proteinTarget ? `of ${settings.proteinTarget} g protein` : 'protein'}</p>
        </div>
      </section>
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
                <Link to={`/food/search?slot=${slot}`} aria-label={`Add to ${slotLabel}`} className="flex min-h-11 min-w-11 items-center justify-center text-pond">Add</Link>
              </div>
            </div>
            {items.map((l) => (
              <ListRow
                key={l.id} title={l.name}
                detail={[l.grams ? `${l.grams} g` : null, hide ? null : `${l.kcal} kcal`, `${l.proteinG} g protein`].filter(Boolean).join(', ')}
                trailing={
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
                }
              />
            ))}
          </section>
        )
      })}
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
