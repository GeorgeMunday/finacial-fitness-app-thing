import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { localDate, nextMonthlyOccurrence } from '../../domain/dates'
import { addRecurringRule, parsePence } from '../../domain/money'
import { createGoal } from '../../domain/savings'
import type { GoalPeriod } from '../../db/types'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { requestPersistence } from '../../state/storage'

type Step = 'age' | 'pillars' | 'income' | 'goal' | 'consent' | 'local'

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-xl font-semibold">{title}</h1>
      {children}
    </main>
  )
}

const inputCls = 'min-h-11 w-full rounded-xl border border-fog bg-surface px-3'

export default function OnboardingFlow() {
  const db = useDb()
  const { update } = useSettings()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('age')
  const [adult, setAdult] = useState(false)
  const [pillars, setPillars] = useState<('food' | 'train')[]>([])
  const [income, setIncome] = useState('')
  const [incomeTouched, setIncomeTouched] = useState(false)
  const [payDay, setPayDay] = useState(1)
  const [goalName, setGoalName] = useState('')
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('year')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [consent, setConsent] = useState(false)

  const incomePence = parsePence(income)
  const targetPence = parsePence(goalTarget)
  const goalValid = goalName.trim() !== '' && targetPence !== null && (goalPeriod !== 'once' || goalDate !== '')

  const afterGoal = () => setStep(pillars.includes('food') ? 'consent' : 'local')

  async function finish() {
    await update({ optionalPillars: pillars, onboarded: true, onboardedAt: new Date().toISOString() })
    await requestPersistence()
    navigate('/', { replace: true })
  }

  if (step === 'age')
    return (
      <Screen title="Welcome to Tally">
        <p className="text-slate">A pocket ledger for spending, saving and, if you like, food and training.</p>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          I'm 18 or over
        </label>
        <Button disabled={!adult} onClick={() => setStep('pillars')}>Continue</Button>
      </Screen>
    )

  if (step === 'pillars')
    return (
      <Screen title="What do you want to track?">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked disabled /> Money
        </label>
        <p className="-mt-3 text-sm text-slate">Included. Spending and savings are always on.</p>
        {(['food', 'train'] as const).map((p) => (
          <label key={p} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox" className="size-6" checked={pillars.includes(p)}
              onChange={(e) => setPillars((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
            />
            {p === 'food' ? 'Food' : 'Train'}
          </label>
        ))}
        <Button onClick={() => setStep('income')}>Continue</Button>
      </Screen>
    )

  if (step === 'income')
    return (
      <Screen title="What do you take home each month?">
        <p className="text-slate">Optional. It helps Tally show what's left each month.</p>
        <label className="flex flex-col gap-1">
          Monthly income
          <input
            className={inputCls} inputMode="decimal" value={income}
            onChange={(e) => setIncome(e.target.value)} onBlur={() => setIncomeTouched(true)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Day of the month you're paid
          <select className={inputCls} value={payDay} onChange={(e) => setPayDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <p className="-mt-2 text-sm text-slate">If a month is shorter, Tally uses its last day.</p>
        {incomeTouched && income !== '' && incomePence === null ? (
          <p className="text-amber-ink">That amount isn't valid. Use numbers like 1850.00.</p>
        ) : null}
        <Button
          disabled={incomePence === null}
          onClick={async () => {
            const pence = incomePence!
            await update({ monthlyIncomePence: pence })
            await addRecurringRule(db, {
              kind: 'income', name: 'Monthly income', amountPence: pence, categoryId: 'cat-income', cadence: 'monthly',
              nextDate: nextMonthlyOccurrence(localDate(), payDay), anchorDay: payDay,
            })
            setStep('goal')
          }}
        >
          Save income
        </Button>
        <Button variant="quiet" onClick={() => setStep('goal')}>Skip</Button>
      </Screen>
    )

  if (step === 'goal')
    return (
      <Screen title="Set a first savings goal">
        <p className="text-slate">Optional. You can add or change goals any time.</p>
        <label className="flex flex-col gap-1">
          Goal name
          <input className={inputCls} value={goalName} onChange={(e) => setGoalName(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Goal period">
          {([['month', 'This month'], ['year', 'This year'], ['once', 'By a date']] as const).map(([p, l]) => (
            <Chip key={p} selected={goalPeriod === p} onClick={() => setGoalPeriod(p)}>{l}</Chip>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          Target
          <input className={inputCls} inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
        </label>
        {goalPeriod === 'once' ? (
          <label className="flex flex-col gap-1">
            Target date
            <input className={inputCls} type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
          </label>
        ) : null}
        <Button
          disabled={!goalValid}
          onClick={async () => {
            await createGoal(db, { name: goalName, period: goalPeriod, targetPence: targetPence!, targetDate: goalPeriod === 'once' ? goalDate : undefined })
            afterGoal()
          }}
        >
          Save goal
        </Button>
        <Button variant="quiet" onClick={afterGoal}>Skip</Button>
      </Screen>
    )

  if (step === 'consent')
    return (
      <Screen title="Your health data">
        <p>
          To use Food, Tally stores your food logs and body weight on this device. Nothing is sent anywhere.
          You can delete this data from More at any time.
        </p>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I agree Tally can store this health data on my device
        </label>
        <Button
          disabled={!consent}
          onClick={async () => {
            await update({ healthConsent: true })
            setStep('local')
          }}
        >
          I agree
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setPillars((cur) => cur.filter((p) => p !== 'food'))
            setStep('local')
          }}
        >
          Not now
        </Button>
      </Screen>
    )

  return (
    <Screen title="Your data stays on this device">
      <p>Everything you log is saved in this browser. There are no accounts and nothing is uploaded.</p>
      <p>
        Browsers can clear site data, so download a backup from More now and then. Tally will remind you if it has been
        more than 30 days.
      </p>
      <Button onClick={finish}>Start using Tally</Button>
    </Screen>
  )
}

