import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AmountKeypad } from '../../components/AmountKeypad'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { addExpense, addIncome, deleteTransaction, formatPence, listCategories, parsePence, recentCategories } from '../../domain/money'
import { useDb } from '../../state/DbProvider'

export default function AddTransaction() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const kind = useSearchParams()[0].get('kind') === 'income' ? 'income' : 'expense'
  const [value, setValue] = useState('')
  const [categoryId, setCategoryId] = useState<string>()
  const [showAll, setShowAll] = useState(false)
  const { data: recent } = useAsync(() => recentCategories(db, 6), [db])
  const { data: all } = useAsync(() => listCategories(db), [db])
  useEffect(() => {
    if (recent && !categoryId) setCategoryId(recent[0]?.id)
  }, [recent, categoryId])
  const pence = parsePence(value)
  const valid = pence !== null && (kind === 'income' || !!categoryId)
  const label = kind === 'income' ? 'Save income' : 'Save expense'
  const chips = showAll ? (all ?? []).filter((c) => c.kind !== 'income') : (recent ?? [])

  async function save() {
    if (pence === null) return
    const id = kind === 'income' ? await addIncome(db, { amountPence: pence }) : await addExpense(db, { amountPence: pence, categoryId: categoryId! })
    toast.show(kind === 'income' ? `Income saved, ${formatPence(pence)}` : 'Expense saved', { undo: () => void deleteTransaction(db, id) })
    navigate(-1)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">{kind === 'income' ? 'Add income' : 'Add expense'}</h1>
      <AmountKeypad value={value} onChange={setValue} />
      {kind === 'expense' ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {chips.map((c) => (
            <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
          ))}
          {!showAll ? <Chip onClick={() => setShowAll(true)}>More…</Chip> : null}
        </div>
      ) : null}
      <Button disabled={!valid} onClick={save}>{label}</Button>
    </div>
  )
}
