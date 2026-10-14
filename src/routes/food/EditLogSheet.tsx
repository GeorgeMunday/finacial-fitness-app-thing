import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Sheet } from '../../components/ui/Sheet'
import type { FoodLog, Slot } from '../../db/types'
import { editLog, type LogEdit } from '../../domain/food'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { SLOTS } from './slots'

const input = 'min-h-11 rounded-xl border border-fog bg-surface px-3'
const num = (s: string) => {
  const v = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(v) ? v : null
}
const r1 = (n: number) => Math.round(n * 10) / 10

/** Change a logged entry's meal and amount: grams for a food, portions for a recipe, the numbers themselves for a quick add. */
export function EditLogSheet({ log, onClose, onSaved }: { log: FoodLog & { name: string }; onClose: () => void; onSaved: () => void }) {
  const db = useDb()
  const { settings } = useSettings()
  const kind = log.foodId && log.grams ? 'food' : log.recipeId ? 'recipe' : 'quick'
  const [slot, setSlot] = useState<Slot>(log.slot)
  const [grams, setGrams] = useState(String(log.grams ?? ''))
  const [portions, setPortions] = useState(String(log.portions ?? 1))
  const [q, setQ] = useState({
    name: log.name === 'Quick add' ? '' : log.name, kcal: String(log.kcal),
    protein: String(log.proteinG), carbs: String(log.carbsG), fat: String(log.fatG),
  })
  const [error, setError] = useState<string | null>(null)

  let edit: LogEdit | null = null
  let factor = 1
  if (kind === 'food') {
    const g = num(grams)
    if (g !== null && g > 0 && g < 5000) {
      edit = { slot, grams: g }
      factor = g / log.grams!
    }
  } else if (kind === 'recipe') {
    const p = num(portions)
    if (p !== null && p >= 0.5 && p <= 20) {
      edit = { slot, portions: p }
      factor = p / (log.portions ?? 1)
    }
  } else {
    const [kcal, proteinG, carbsG, fatG] = [num(q.kcal), num(q.protein) ?? 0, num(q.carbs) ?? 0, num(q.fat) ?? 0]
    if (kcal !== null && kcal >= 0 && kcal < 10000 && [proteinG, carbsG, fatG].every((v) => v >= 0 && v < 1000))
      edit = { slot, name: q.name, kcal, proteinG, carbsG, fatG }
  }
  const setQField = (k: keyof typeof q) => (e: React.ChangeEvent<HTMLInputElement>) => setQ((cur) => ({ ...cur, [k]: e.target.value }))

  return (
    <Sheet open onClose={onClose} title={`Edit ${log.name}`}>
      <div className="flex flex-col gap-3">
        {kind === 'food' ? (
          <label className="flex flex-col gap-1">
            Portion (g)
            <input className={input} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
          </label>
        ) : null}
        {kind === 'recipe' ? (
          <label className="flex flex-col gap-1">
            Portions
            <input className={input} inputMode="decimal" value={portions} onChange={(e) => setPortions(e.target.value)} />
          </label>
        ) : null}
        {kind === 'quick' ? (
          <>
            <label className="flex flex-col gap-1">Name (optional)<input className={input} value={q.name} onChange={setQField('name')} /></label>
            <label className="flex flex-col gap-1">Calories<input className={input} inputMode="decimal" value={q.kcal} onChange={setQField('kcal')} /></label>
            <label className="flex flex-col gap-1">Protein (g, optional)<input className={input} inputMode="decimal" value={q.protein} onChange={setQField('protein')} /></label>
            <label className="flex flex-col gap-1">Carbs (g, optional)<input className={input} inputMode="decimal" value={q.carbs} onChange={setQField('carbs')} /></label>
            <label className="flex flex-col gap-1">Fat (g, optional)<input className={input} inputMode="decimal" value={q.fat} onChange={setQField('fat')} /></label>
          </>
        ) : (
          <p className="text-slate">
            {edit
              ? [settings.hideCalories ? null : `${Math.round(log.kcal * factor)} kcal`, `${r1(log.proteinG * factor)} g protein`, `${r1(log.carbsG * factor)} g carbs`, `${r1(log.fatG * factor)} g fat`].filter(Boolean).join(', ')
              : kind === 'food' ? 'Enter a portion in grams, like 40.' : 'Enter portions from 0.5 to 20.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
          {SLOTS.map((s) => <Chip key={s.slot} selected={slot === s.slot} onClick={() => setSlot(s.slot)}>{s.label}</Chip>)}
        </div>
        {error ? <p className="text-amber-ink">{error}</p> : null}
        <Button
          disabled={!edit}
          onClick={async () => {
            try {
              await editLog(db, log.id, edit!)
              onSaved()
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't save that change.")
            }
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  )
}
