import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { deleteBudget, listBudgets, listCategories, parsePence, setBudget } from '../../domain/money'
import { useDb } from '../../state/DbProvider'

type Draft = Record<string, string> // `${categoryId}:${period}` → text

export default function Budgets() {
  const db = useDb()
  const toast = useToast()
  const { data } = useAsync(async () => ({ cats: (await listCategories(db)).filter((c) => c.kind !== 'income'), budgets: await listBudgets(db) }), [db])
  const [draft, setDraft] = useState<Draft>({})
  useEffect(() => {
    if (!data) return
    setDraft(Object.fromEntries(data.budgets.map((b) => [`${b.categoryId}:${b.period}`, (b.limitPence / 100).toFixed(2)])))
  }, [data])
  if (!data) return null
  const bad = Object.values(draft).some((v) => v.trim() !== '' && parsePence(v) === null)
  const field = (id: string, period: 'week' | 'month') => (
    <label className="flex flex-col text-sm text-slate">
      {period === 'week' ? 'Per week' : 'Per month'}
      <input
        inputMode="decimal" className="min-h-11 w-28 rounded-xl border border-fog bg-surface px-3 text-ink" value={draft[`${id}:${period}`] ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, [`${id}:${period}`]: e.target.value }))}
      />
    </label>
  )
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-display text-xl font-semibold">Budgets</h1>
      <p className="text-slate">Set a weekly or monthly limit for the categories you want to keep an eye on. Clear a field to remove that budget.</p>
      {data.cats.map((c) => (
        <div key={c.id} className="flex items-end justify-between gap-3 border-b border-fog py-2">
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          {field(c.id, 'week')}
          {field(c.id, 'month')}
        </div>
      ))}
      {bad ? <p className="text-amber-ink">One of those amounts isn't valid. Use numbers like 50.00.</p> : null}
      <Button
        disabled={bad}
        onClick={async () => {
          for (const [key, text] of Object.entries(draft)) {
            const pence = parsePence(text)
            const [categoryId, period] = key.split(':') as [string, 'week' | 'month']
            if (pence !== null) await setBudget(db, categoryId, period, pence)
            // An emptied field removes that budget.
            else if (text.trim() === '' && data.budgets.some((b) => b.categoryId === categoryId && b.period === period)) await deleteBudget(db, categoryId, period)
          }
          toast.show('Budgets saved')
        }}
      >
        Save budgets
      </Button>
    </div>
  )
}
