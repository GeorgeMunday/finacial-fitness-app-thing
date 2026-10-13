import { useEffect, useState } from 'react'
import { localDate } from '../domain/dates'
import { formatPence, parsePence } from '../domain/money'
import { contribute, deleteContribution } from '../domain/savings'
import { useDb } from '../state/DbProvider'
import { AmountKeypad } from './AmountKeypad'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { useToast } from './ui/Toast'

/** `maxWithdrawPence` is what's saved in the goal's current period: withdrawing more would hide later savings. */
export function SaveToGoalSheet({ goal, mode = 'add', maxWithdrawPence = 0, onClose, onDone }: { goal: { id: string; name: string } | null; mode?: 'add' | 'withdraw'; maxWithdrawPence?: number; onClose: () => void; onDone: () => void }) {
  const db = useDb()
  const toast = useToast()
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [goal])
  const pence = parsePence(value)
  const verb = mode === 'add' ? 'Add to goal' : 'Withdraw'
  const tooMuch = mode === 'withdraw' && pence !== null && pence > maxWithdrawPence
  return (
    <Sheet open={goal !== null} onClose={onClose} title={mode === 'add' ? `Save to ${goal?.name ?? ''}` : `Withdraw from ${goal?.name ?? ''}`}>
      <AmountKeypad value={value} onChange={setValue} />
      {mode === 'withdraw' ? (
        <p className={`mt-3 ${tooMuch ? 'text-amber-ink' : 'text-slate'}`}>You can withdraw up to {formatPence(maxWithdrawPence)}.</p>
      ) : null}
      <Button
        className="mt-3 w-full" disabled={pence === null || tooMuch}
        onClick={async () => {
          if (pence === null || !goal) return
          const signed = mode === 'add' ? pence : -pence
          const id = await contribute(db, goal.id, signed, localDate())
          toast.show(mode === 'add' ? `${formatPence(pence)} added to ${goal.name}` : `${formatPence(pence)} withdrawn`, {
            undo: () => void deleteContribution(db, id).then(onDone),
          })
          onClose()
          onDone()
        }}
      >
        {verb}
      </Button>
    </Sheet>
  )
}
