import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import type { Slot } from '../../db/types'
import { deleteLog } from '../../domain/food'
import { formatPence, parsePence } from '../../domain/money'
import { latestPrice, setIngredientPrice } from '../../domain/recipes/prices'
import { copyRecipe, deleteRecipe, getRecipe, logRecipe, recipeCost, recipeNutrition, restoreRecipe } from '../../domain/recipes/recipes'
import { useAsync } from '../../hooks/useAsync'
import { emitChange } from '../../state/changes'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { slotFor } from './slots'

const MEALS: Slot[] = ['breakfast', 'lunch', 'dinner']
const TAG_LABEL: Record<string, string> = { batch: 'Batch', quick: 'Quick', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'freezer-friendly': 'Freezer-friendly' }

export default function RecipeDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings } = useSettings()
  const [portions, setPortions] = useState(1)
  const [pricing, setPricing] = useState(false)
  const { data, reload } = useAsync(async () => {
    const recipe = await getRecipe(db, id)
    if (!recipe) return null
    const prices = await Promise.all(recipe.items.map(async (i) => ({ ...i, price: await latestPrice(db, i.foodId) })))
    return { recipe, nutrition: await recipeNutrition(db, id), cost: await recipeCost(db, id), prices }
  }, [db, id])
  if (data === undefined) return null
  if (data === null) return <p>That recipe couldn't be found.</p>
  const { recipe: r, nutrition: n, cost } = data
  const mealTags = MEALS.filter((m) => (r.tags as string[]).includes(m))
  const slot: Slot = mealTags.length === 1 ? mealTags[0] : slotFor(new Date())
  const own = r.source === 'user'
  const perPound = cost.complete && cost.perPortionPence > 0 ? Math.round(n.proteinG / (cost.perPortionPence / 100)) : null
  const nutritionLine = [`${n.proteinG} g protein`, `${n.carbsG} g carbs`, `${n.fatG} g fat`, settings.hideCalories ? null : `${n.kcal} kcal`].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-5 pb-16">
      <Link to="/food/recipes" className="flex min-h-11 items-center self-start text-pond">All recipes</Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">{r.name}</h1>
        {r.description ? <p>{r.description}</p> : null}
        <p className="text-sm text-slate">
          {[`Serves ${r.servings}`, r.prepMinutes ? `Prep ${r.prepMinutes} min` : null, r.cookMinutes ? `Cook ${r.cookMinutes} min` : null,
            r.fridgeDays ? `Keeps ${r.fridgeDays} days in the fridge` : 'Best eaten straight away'].filter(Boolean).join(' · ')}
        </p>
        {r.tags.length ? <p className="text-sm text-slate">{r.tags.map((t) => TAG_LABEL[t] ?? t).join(' · ')}</p> : null}
      </header>

      <section aria-label="Per portion" className="flex flex-col gap-1">
        <h2 className="font-semibold">Per portion</h2>
        <p>{nutritionLine}</p>
        {cost.complete ? (
          <>
            <p>{`${formatPence(cost.perPortionPence)} a portion · ${formatPence(cost.totalPence)} for the recipe`}</p>
            {perPound ? <p>{perPound} g protein per £1</p> : null}
          </>
        ) : (
          <p className="text-amber-ink">{`Cost is incomplete. Add a price for ${cost.missing.join(', ')}.`}</p>
        )}
        {cost.estimatedMonth ? <p className="text-sm text-slate">Prices estimated {cost.estimatedMonth}</p> : null}
        <Button variant="quiet" className="self-start" onClick={() => setPricing(true)}>Edit prices</Button>
      </section>

      <section className="flex flex-col gap-3" aria-label="Log">
        <div className="flex items-center gap-3">
          <Button variant="secondary" aria-label="Fewer portions" disabled={portions <= 0.5} onClick={() => setPortions((p) => Math.max(0.5, p - 0.5))}><Minus aria-hidden="true" size={18} /></Button>
          <span className="min-w-24 text-center tabular">{portions} {portions === 1 ? 'portion' : 'portions'}</span>
          <Button variant="secondary" aria-label="More portions" onClick={() => setPortions((p) => p + 0.5)}><Plus aria-hidden="true" size={18} /></Button>
        </div>
        <Button
          onClick={async () => {
            const logId = await logRecipe(db, r.id, portions, slot)
            toast.show(`Logged ${r.name}`, { undo: () => void deleteLog(db, logId) })
          }}
        >
          {portions === 1 ? 'Log a portion' : `Log ${portions} portions`}
        </Button>
      </section>

      <section aria-label="Ingredients">
        <h2 className="border-b border-fog pb-2 font-semibold">Ingredients</h2>
        <ul aria-label="Ingredients">
          {r.items.map((i) => <li key={i.foodId} className="min-h-9 border-b border-fog py-2">{`${i.grams} g ${i.name}`}</li>)}
        </ul>
      </section>
      {r.steps.length ? (
        <section aria-label="Method">
          <h2 className="border-b border-fog pb-2 font-semibold">Method</h2>
          <ol aria-label="Steps" className="list-decimal pl-6">
            {r.steps.map((s, i) => <li key={i} className="py-2">{s}</li>)}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-col items-start gap-1">
        <Button
          variant="secondary"
          onClick={async () => navigate(`/food/recipes/${await copyRecipe(db, r.id)}/edit`)}
        >
          Copy and edit
        </Button>
        {own ? (
          <>
            <Link to={`/food/recipes/${r.id}/edit`} className="flex min-h-11 items-center text-pond">Edit recipe</Link>
            <Button
              variant="quiet"
              onClick={async () => {
                await deleteRecipe(db, r.id)
                toast.show('Recipe deleted', { undo: () => restoreRecipe(db, r.id) })
                navigate('/food/recipes', { replace: true })
              }}
            >
              Delete recipe
            </Button>
          </>
        ) : (
          <Button
            variant="quiet"
            onClick={async () => {
              const copy = await copyRecipe(db, r.id)
              toast.show('Saved to your recipes')
              navigate(`/food/recipes/${copy}`)
            }}
          >
            Save as my recipe
          </Button>
        )}
      </div>

      <PriceSheet
        open={pricing} onClose={() => setPricing(false)} rows={data.prices}
        onSaved={() => { setPricing(false); toast.show('Prices saved'); reload(); emitChange() }}
      />
    </div>
  )
}

type PriceRow = { foodId: string; name: string; price: { pricePence: number; packG: number } | null }

/** One price and pack size per ingredient. Only rows the user changed are saved, as their own prices. */
function PriceSheet({ open, onClose, rows, onSaved }: { open: boolean; onClose: () => void; rows: PriceRow[]; onSaved: () => void }) {
  const db = useDb()
  const initial = (r: PriceRow) => ({ price: r.price ? (r.price.pricePence / 100).toFixed(2) : '', pack: r.price ? String(r.price.packG) : '' })
  const [edits, setEdits] = useState<Record<string, { price: string; pack: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const val = (r: PriceRow) => edits[r.foodId] ?? initial(r)
  return (
    <Sheet open={open} onClose={onClose} title="Ingredient prices">
      <div className="flex flex-col gap-3">
        <p className="text-slate">What a pack costs and how many grams are in it. Cost is worked out by weight.</p>
        {rows.map((r) => (
          <div key={r.foodId} className="grid grid-cols-2 gap-3 border-b border-fog pb-3">
            <label className="flex flex-col gap-1 text-sm">
              {`${r.name} price (£)`}
              <input className="min-h-11 rounded-xl border border-fog bg-surface px-3 text-base" inputMode="decimal" value={val(r).price}
                onChange={(e) => setEdits((c) => ({ ...c, [r.foodId]: { ...val(r), price: e.target.value } }))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {`${r.name} pack size (g)`}
              <input className="min-h-11 rounded-xl border border-fog bg-surface px-3 text-base" inputMode="decimal" value={val(r).pack}
                onChange={(e) => setEdits((c) => ({ ...c, [r.foodId]: { ...val(r), pack: e.target.value } }))} />
            </label>
          </div>
        ))}
        {error ? <p className="text-amber-ink">{error}</p> : null}
        <Button
          onClick={async () => {
            const changes: { foodId: string; pence: number; pack: number }[] = []
            for (const r of rows) {
              const e = edits[r.foodId]
              if (!e) continue
              const was = initial(r)
              if (e.price === was.price && e.pack === was.pack) continue
              const pence = parsePence(e.price)
              const pack = Number(e.pack.replace(',', '.'))
              if (pence === null || !(pack > 0)) {
                setError(`Use a price like 1.50 and a pack size in grams for ${r.name}.`)
                return
              }
              changes.push({ foodId: r.foodId, pence, pack })
            }
            for (const c of changes) await setIngredientPrice(db, c.foodId, c.pence, c.pack)
            setError(null)
            setEdits({})
            onSaved()
          }}
        >
          Save prices
        </Button>
      </div>
    </Sheet>
  )
}
