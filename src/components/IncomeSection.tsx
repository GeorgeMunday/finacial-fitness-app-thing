import { useEffect, useState } from 'react'
import { localDate } from '../domain/dates'
import { getMonthlyIncome, saveMonthlyIncome, stopMonthlyIncome } from '../domain/income'
import { formatPence, parsePence } from '../domain/money'
import { useAsync } from '../hooks/useAsync'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { Button } from './ui/Button'
import { useToast } from './ui/Toast'

const input = 'min-h-11 rounded-xl border border-fog bg-surface px-3'

/** Edits the recurring "Monthly income" rule, so a change here changes the income Tally posts. */
export function IncomeSection() {
  const db = useDb()
  const toast = useToast()
  const { update } = useSettings()
  const { data: current, reload } = useAsync(() => getMonthlyIncome(db), [db])
  const [amount, setAmount] = useState('')
  const [payDay, setPayDay] = useState(1)
  useEffect(() => {
    if (current) {
      setAmount((current.amountPence / 100).toFixed(2))
      setPayDay(current.payDay)
    }
  }, [current])
  const pence = parsePence(amount)
  if (current === undefined) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Monthly income</h2>
      <p className="text-sm text-slate">
        {current ? `Tally adds ${formatPence(current.amountPence)} as income on day ${current.payDay} of each month.` : 'Add your take-home pay and Tally will log it each month.'}
      </p>
      <input aria-label="Monthly income" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
      <label className="flex flex-col gap-1">
        Day of the month you're paid
        <select className={input} value={payDay} onChange={(e) => setPayDay(Number(e.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pence === null}
          onClick={async () => {
            await saveMonthlyIncome(db, { amountPence: pence!, payDay, today: localDate() })
            await update({})
            reload()
            toast.show('Income saved')
          }}
        >
          Save income
        </Button>
        {current ? (
          <Button
            variant="secondary"
            onClick={async () => {
              await stopMonthlyIncome(db)
              await update({})
              setAmount('')
              reload()
              toast.show('Monthly income stopped')
            }}
          >
            Stop monthly income
          </Button>
        ) : null}
      </div>
    </section>
  )
}
