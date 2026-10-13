import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import type { Food } from '../../db/types'
import { recentFoods } from '../../domain/food'
import { createRecipe, getRecipe, updateRecipe } from '../../domain/recipes/recipes'
import { RECIPE_TAGS, type Recipe, type RecipeTag } from '../../domain/recipes/types'
import { searchFoods } from '../../domain/seed'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'

const TAG_LABEL: Record<RecipeTag, string> = { batch: 'Batch', quick: 'Quick', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'freezer-friendly': 'Freezer-friendly' }
const input = 'min-h-11 rounded-xl border border-fog bg-surface px-3'

export default function RecipeEdit() {
  const { id } = useParams()
  const db = useDb()
  const { data: existing } = useAsync(() => (id ? getRecipe(db, id) : Promise.resolve(undefined)), [db, id])
  if (id && existing === undefined) return null
  if (id && existing === null) return <p>That recipe couldn't be found.</p>
  if (existing && existing.source !== 'user') {
    return (
      <div className="flex flex-col gap-3">
        <p>Tally's recipes can't be changed. Copy it first, then edit your copy.</p>
        <Link to={`/food/recipes/${existing.id}`} className="flex min-h-11 items-center text-pond">Back to the recipe</Link>
      </div>
    )
  }
  return <RecipeForm key={id ?? 'new'} initial={existing ?? undefined} />
}

type Ingredient = { foodId: string; name: string; grams: string }

function RecipeForm({ initial }: { initial?: Recipe }) {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [servings, setServings] = useState(String(initial?.servings ?? 1))
  const [prep, setPrep] = useState(initial?.prepMinutes != null ? String(initial.prepMinutes) : '')
  const [cook, setCook] = useState(initial?.cookMinutes != null ? String(initial.cookMinutes) : '')
  const [fridge, setFridge] = useState(initial?.fridgeDays != null ? String(initial.fridgeDays) : '')
  const [tags, setTags] = useState<RecipeTag[]>(initial?.tags ?? [])
  const [steps, setSteps] = useState((initial?.steps ?? []).join('\n'))
  const [items, setItems] = useState<Ingredient[]>(initial?.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: String(i.grams) })) ?? [])
  const [q, setQ] = useState('')
  const { data: foods } = useAsync<Food[]>(() => (q.trim() ? searchFoods(db, q.trim(), 8) : recentFoods(db, 12)), [db, q])

  const n = (s: string) => Number(s.replace(',', '.'))
  const optional = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(n(s))))
  const valid = name.trim() !== '' && items.length > 0 && Number.isInteger(n(servings)) && n(servings) >= 1 && items.every((i) => n(i.grams) > 0)
  const add = (f: Food) => {
    setItems((cur) => (cur.some((c) => c.foodId === f.id) ? cur : [...cur, { foodId: f.id, name: f.name, grams: '100' }]))
    setQ('')
  }
  return (
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="font-display text-xl font-semibold">{initial ? 'Edit recipe' : 'New recipe'}</h1>
      <label className="flex flex-col gap-1">Recipe name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">Portions<input className={input} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} /></label>
        <label className="flex flex-col gap-1">Keeps in the fridge (days)<input className={input} inputMode="numeric" value={fridge} onChange={(e) => setFridge(e.target.value)} /></label>
        <label className="flex flex-col gap-1">Prep (minutes)<input className={input} inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} /></label>
        <label className="flex flex-col gap-1">Cook (minutes)<input className={input} inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
        {RECIPE_TAGS.map((t) => <Chip key={t} selected={tags.includes(t)} onClick={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}>{TAG_LABEL[t]}</Chip>)}
      </div>

      <section aria-label="Ingredients" className="flex flex-col gap-2">
        <h2 className="border-b border-fog pb-2 font-semibold">Ingredients</h2>
        {items.map((it, i) => (
          <div key={it.foodId} className="flex items-end gap-2 border-b border-fog pb-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {`${it.name} (g)`}
              <input className={`${input} text-base`} inputMode="decimal" value={it.grams} onChange={(e) => setItems((cur) => cur.map((c, j) => (j === i ? { ...c, grams: e.target.value } : c)))} />
            </label>
            <Button variant="quiet" aria-label={`Remove ${it.name}`} onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <label className="flex flex-col gap-1">Search foods<input className={input} type="search" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} /></label>
        {!q.trim() ? <p className="text-sm text-slate">Recently logged</p> : null}
        {foods?.length === 0 ? <p className="text-slate">{q.trim() ? 'No foods match.' : 'Foods you log will show here. You can also search.'}</p> : null}
        {foods?.map((f) => (
          <button key={f.id} type="button" aria-label={`Add ${f.name}`} className="min-h-11 border-b border-fog text-left" onClick={() => add(f)}>{f.name}</button>
        ))}
      </section>

      <label className="flex flex-col gap-1">Steps (one per line)<textarea className={`${input} py-2`} rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
      {!valid ? <p className="text-slate">Add a name, at least one ingredient and 1 or more portions.</p> : null}
      <Button
        disabled={!valid}
        onClick={async () => {
          const r = {
            name, description: initial?.description ?? null, servings: n(servings), prepMinutes: optional(prep), cookMinutes: optional(cook), fridgeDays: optional(fridge),
            tags, steps: steps.split('\n').map((s) => s.trim()).filter(Boolean), items: items.map((i) => ({ foodId: i.foodId, grams: n(i.grams) })),
          }
          const id = initial ? initial.id : await createRecipe(db, r)
          if (initial) await updateRecipe(db, initial.id, r)
          toast.show('Recipe saved')
          navigate(`/food/recipes/${id}`, { replace: true })
        }}
      >
        Save recipe
      </Button>
    </div>
  )
}
