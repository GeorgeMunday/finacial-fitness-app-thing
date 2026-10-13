import { useFormatDate } from '../../hooks/useFormatDate'
import { useState } from 'react'
import { Amount } from '../../components/ui/Amount'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { EmptyState } from '../../components/ui/EmptyState'
import { ListRow } from '../../components/ui/ListRow'
import { useToast } from '../../components/ui/Toast'
import type { TxKind } from '../../db/types'
import { useAsync } from '../../hooks/useAsync'
import { localDate } from '../../domain/dates'
import { addRecurringRule, deleteRecurring, listCategories, listRecurring, parsePence, type Cadence } from '../../domain/money'
import { useDb } from '../../state/DbProvider'

const input = 'min-h-11 w-full rounded-xl border border-fog bg-surface px-3'

export default function Recurring() {
  const db = useDb()
  const fmt = useFormatDate()
  const toast = useToast()
  const { data: rules, reload } = useAsync(() => listRecurring(db), [db])
  const { data: cats } = useAsync(() => listCategories(db), [db])
  const [kind, setKind] = useState<TxKind>('expense')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [next, setNext] = useState(localDate())
  const [categoryId, setCategoryId] = useState('cat-bills')
  const pence = parsePence(amount)
  const valid = name.trim() !== '' && pence !== null && next !== ''
  if (!rules) return null
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">Recurring</h1>
      {rules.length === 0 ? <EmptyState message="No recurring payments yet" /> : null}
      {rules.map((r) => (
        <ListRow
          key={r.id} title={r.name} detail={`${r.kind === 'income' ? 'Income' : 'Expense'}, ${r.cadence}, next ${fmt(r.nextDate)}`}
          trailing={
            <>
              <Amount pence={r.amountPence} />
              <Button variant="quiet" aria-label={`Delete ${r.name}`} onClick={async () => { await deleteRecurring(db, r.id); reload(); toast.show('Recurring payment deleted') }}>Delete</Button>
            </>
          }
        />
      ))}
      <h2 className="font-semibold">Add a recurring payment</h2>
      <div className="flex gap-2" role="group" aria-label="Type">
        <Chip selected={kind === 'expense'} onClick={() => { setKind('expense'); setCategoryId('cat-bills') }}>Expense</Chip>
        <Chip selected={kind === 'income'} onClick={() => { setKind('income'); setCategoryId('cat-income') }}>Income</Chip>
      </div>
      <label className="flex flex-col gap-1">Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="flex flex-col gap-1">Amount<input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <div className="flex gap-2" role="group" aria-label="How often">
        {(['weekly', 'monthly', 'yearly'] as const).map((c) => <Chip key={c} selected={cadence === c} onClick={() => setCadence(c)}>{c[0].toUpperCase() + c.slice(1)}</Chip>)}
      </div>
      {kind === 'expense' ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {(cats ?? []).filter((c) => c.kind !== 'income').map((c) => <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>)}
        </div>
      ) : null}
      <label className="flex flex-col gap-1">Next date<input className={input} type="date" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <Button
        disabled={!valid}
        onClick={async () => {
          await addRecurringRule(db, { kind, name: name.trim(), amountPence: pence!, categoryId, cadence, nextDate: next })
          setName(''); setAmount('')
          reload()
          toast.show('Recurring payment saved')
        }}
      >
        Save recurring payment
      </Button>
    </div>
  )
}
