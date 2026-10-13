import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../../components/ui/Chip'
import { formatPence } from '../../domain/money'
import { listRecipes } from '../../domain/recipes/recipes'
import type { RecipeSummary, RecipeTag } from '../../domain/recipes/types'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'

type Filter = 'all' | 'mine' | RecipeTag
type Sort = 'cost' | 'protein' | 'time'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'batch', label: 'Batch' }, { id: 'quick', label: 'Quick' }, { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'mine', label: 'Mine' },
]
const SORTS: { id: Sort; label: string }[] = [{ id: 'cost', label: 'Cost' }, { id: 'protein', label: 'Protein' }, { id: 'time', label: 'Time' }]

export const totalMinutes = (r: { prepMinutes: number | null; cookMinutes: number | null }) => (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)

function sorted(list: RecipeSummary[], by: Sort): RecipeSummary[] {
  const key = (r: RecipeSummary) => (by === 'cost' ? (r.cost.complete ? r.cost.perPortionPence : Infinity) : by === 'protein' ? -r.nutrition.proteinG : totalMinutes(r))
  return [...list].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))
}

export default function Recipes() {
  const db = useDb()
  const { settings } = useSettings()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('cost')
  const { data } = useAsync(() => listRecipes(db), [db])
  if (!data) return null
  const shown = sorted(data.filter((r) => (filter === 'all' ? true : filter === 'mine' ? r.source === 'user' : r.tags.includes(filter))), sort)
  const estimated = data.map((r) => r.cost.estimatedMonth).find(Boolean)
  return (
    <div className="flex flex-col gap-4">
      <Link to="/food" className="flex min-h-11 items-center self-start text-pond">Back to Food</Link>
      <h1 className="font-display text-xl font-semibold">Recipes</h1>
      <div className="flex flex-wrap gap-2">
        <Link to="/food/plan" className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">Plan my week</Link>
        <Link to="/food/recipes/new" className="flex min-h-11 items-center rounded-xl border border-fog bg-surface px-4">New recipe</Link>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort by">
        <span className="text-sm text-slate">Sort by</span>
        {SORTS.map((s) => <Chip key={s.id} selected={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</Chip>)}
      </div>
      {shown.length === 0 ? <p className="py-4 text-slate">{filter === 'mine' ? 'No recipes of your own yet. Save one from any recipe, or make a new one.' : 'No recipes match.'}</p> : null}
      <ul aria-label="Recipes">
        {shown.map((r) => (
          <li key={r.id} className="border-b border-fog">
            <Link to={`/food/recipes/${r.id}`} className="flex min-h-16 flex-col justify-center py-3">
              <span className="font-semibold">{r.name}</span>
              <span className="text-sm text-slate">
                {[
                  `${r.nutrition.proteinG} g protein`,
                  r.cost.complete ? `${formatPence(r.cost.perPortionPence)} a portion` : 'Cost incomplete',
                  totalMinutes(r) ? `${totalMinutes(r)} min` : null,
                  settings.hideCalories ? null : `${r.nutrition.kcal} kcal`,
                ].filter(Boolean).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {estimated ? <p className="text-sm text-slate">Prices estimated {estimated}</p> : null}
    </div>
  )
}
