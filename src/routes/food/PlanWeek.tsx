import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { formatPence } from '../../domain/money'
import { listRecipes } from '../../domain/recipes/recipes'
import { weekShoppingList } from '../../domain/recipes/shopping'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'

/** Pick recipes and portions, get one shopping list with an estimated total. Picks live on this screen only. */
export default function PlanWeek() {
  const db = useDb()
  const navigate = useNavigate()
  const [picks, setPicks] = useState<Record<string, number>>({})
  const { data: recipes } = useAsync(() => listRecipes(db), [db])
  const selections = Object.entries(picks).filter(([, n]) => n > 0).map(([recipeId, portions]) => ({ recipeId, portions }))
  const key = JSON.stringify(selections)
  const { data: list } = useAsync(() => weekShoppingList(db, selections), [db, key])
  if (!recipes) return null
  const month = recipes.filter((r) => picks[r.id] > 0).map((r) => r.cost.estimatedMonth).find(Boolean)
  const set = (id: string, n: number) => setPicks((cur) => ({ ...cur, [id]: Math.max(0, n) }))
  const total = list?.totalPence ?? 0
  return (
    <div className="flex flex-col gap-5 pb-16">
      <Link to="/food/recipes" className="flex min-h-11 items-center self-start text-pond">All recipes</Link>
      <h1 className="font-display text-xl font-semibold">Plan my week</h1>
      <ul aria-label="Recipes to plan">
        {recipes.map((r) => (
          <li key={r.id} className="flex min-h-16 items-center gap-3 border-b border-fog py-3">
            <div className="min-w-0 flex-1">
              <div>{r.name}</div>
              <div className="text-sm text-slate">{[`${r.nutrition.proteinG} g protein`, r.cost.complete ? `${formatPence(r.cost.perPortionPence)} a portion` : 'Cost incomplete'].join(' · ')}</div>
            </div>
            <Button variant="secondary" aria-label={`Fewer portions of ${r.name}`} disabled={!(picks[r.id] > 0)} onClick={() => set(r.id, (picks[r.id] ?? 0) - 1)}><Minus aria-hidden="true" size={18} /></Button>
            <span className="w-6 text-center tabular" aria-label={`${picks[r.id] ?? 0} portions of ${r.name}`}>{picks[r.id] ?? 0}</span>
            <Button variant="secondary" aria-label={`More portions of ${r.name}`} onClick={() => set(r.id, (picks[r.id] ?? 0) + 1)}><Plus aria-hidden="true" size={18} /></Button>
          </li>
        ))}
      </ul>
      {selections.length === 0 || !list ? (
        <p className="text-slate">Pick the recipes you'll eat this week and Tally adds up what to buy.</p>
      ) : (
        <section aria-label="Shopping" className="flex flex-col gap-2">
          <h2 className="border-b border-fog pb-2 font-semibold">Shopping list</h2>
          <ul aria-label="Shopping list">
            {list.lines.map((l) => (
              <li key={l.foodId} className="flex min-h-11 items-center justify-between gap-3 border-b border-fog py-2">
                <span>{`${l.grams} g ${l.name}`}</span>
                <span className="text-slate tabular">{l.costPence === null ? 'No price' : formatPence(l.costPence)}</span>
              </li>
            ))}
          </ul>
          <p className="font-display text-lg font-semibold">{`Estimated total ${formatPence(total)}`}</p>
          <p className="text-sm text-slate">Worked out by weight, so packs can cost more if you can't use the rest.</p>
          {!list.complete ? <p className="text-amber-ink">{`Some prices are missing: ${list.missing.join(', ')}. The total leaves them out.`}</p> : null}
          {month ? <p className="text-sm text-slate">Prices estimated {month}</p> : null}
        </section>
      )}
      <Button disabled={total <= 0} onClick={() => navigate(`/money/add?kind=expense&amount=${(total / 100).toFixed(2)}&category=cat-groceries`)}>
        Add as expense
      </Button>
    </div>
  )
}
