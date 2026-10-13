import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { useToast } from '../../components/ui/Toast'
import type { GoalPeriod } from '../../db/types'
import { parsePence } from '../../domain/money'
import { createGoal } from '../../domain/savings'
import { useDb } from '../../state/DbProvider'

const input = 'min-h-11 w-full rounded-xl border border-fog bg-surface px-3'

export default function NewGoal() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [period, setPeriod] = useState<GoalPeriod>('year')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [touched, setTouched] = useState(false)
  const pence = parsePence(target)
  const valid = name.trim() !== '' && pence !== null && (period !== 'once' || date !== '')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold">New goal</h1>
      <label className="flex flex-col gap-1">Goal name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Goal period">
        {([['month', 'This month'], ['year', 'This year'], ['once', 'By a date']] as const).map(([p, l]) => (
          <Chip key={p} selected={period === p} onClick={() => setPeriod(p)}>{l}</Chip>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        Target
        <input className={input} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => setTouched(true)} />
      </label>
      {touched && target !== '' && pence === null ? <p className="text-amber-ink">That amount isn't valid. Use numbers like 500.00.</p> : null}
      {period === 'once' ? (
        <label className="flex flex-col gap-1">Target date<input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      ) : null}
      <Button
        disabled={!valid}
        onClick={async () => {
          await createGoal(db, { name, period, targetPence: pence!, targetDate: period === 'once' ? date : undefined })
          toast.show('Goal saved')
          navigate('/money/goals', { replace: true })
        }}
      >
        Save goal
      </Button>
    </div>
  )
}
