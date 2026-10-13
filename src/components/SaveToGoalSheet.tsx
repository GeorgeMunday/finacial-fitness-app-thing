import { useEffect, useState } from 'react'
import { localDate } from '../domain/dates'
import { formatPence, parsePence } from '../domain/money'
import { contribute, deleteContribution } from '../domain/savings'
import { useDb } from '../state/DbProvider'
import { AmountKeypad } from './AmountKeypad'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { useToast } from './ui/Toast'

export function SaveToGoalSheet({ goal, mode = 'add', onClose, onDone }: { goal: { id: string; name: string } | null; mode?: 'add' | 'withdraw'; onClose: () => void; onDone: () => void }) {
  const db = useDb()
  const toast = useToast()
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [goal])
  const pence = parsePence(value)
  const verb = mode === 'add' ? 'Add to goal' : 'Withdraw'
  return (
    <Sheet open={goal !== null} onClose={onClose} title={mode === 'add' ? `Save to ${goal?.name ?? ''}` : `Withdraw from ${goal?.name ?? ''}`}>
      <AmountKeypad value={value} onChange={setValue} />
      <Button
        className="mt-3 w-full" disabled={pence === null}
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
