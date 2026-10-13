import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { Amount } from '../components/ui/Amount'
import { EmptyState } from '../components/ui/EmptyState'
import { ListRow } from '../components/ui/ListRow'
import { Button } from '../components/ui/Button'
import { TallyMarks } from '../components/ui/TallyMarks'
import { useToast } from '../components/ui/Toast'
import { goalLabel } from '../components/GoalRow'
import { useAsync } from '../hooks/useAsync'
import { localDate, monthRange } from '../domain/dates'
import { deleteTransaction, formatPence, leftToSpend, listTransactions, restoreTransaction } from '../domain/money'
import { listGoals, monthlySummary } from '../domain/savings'
import { useDb } from '../state/DbProvider'
import AddTransaction from './money/AddTransaction'
import Budgets from './money/Budgets'
import GoalDetail from './money/GoalDetail'
import Goals from './money/Goals'
import NewGoal from './money/NewGoal'
import Recurring from './money/Recurring'

function Left({ label, left }: { label: string; left: { limitPence: number; spentPence: number; leftPence: number } }) {
  if (left.limitPence === 0)
    return (
      <div>
        <Amount pence={left.spentPence} size="hero" />
        <p className="text-slate">spent {label}. <Link to="/money/budgets" className="text-pond underline">Set a budget</Link></p>
      </div>
    )
  const over = left.leftPence < 0
  return (
    <div>
      <Amount pence={Math.abs(left.leftPence)} size="hero" />
      <p className={over ? 'text-amber-ink' : 'text-slate'}>{over ? `over budget ${label}` : `left to spend ${label}`}</p>
    </div>
  )
}

function MoneyHome() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const today = localDate()
  const { data, reload } = useAsync(async () => {
    const month = monthRange(today)
    return {
      week: await leftToSpend(db, 'week', today),
      monthLeft: await leftToSpend(db, 'month', today),
      goals: await listGoals(db, today),
      summary: await monthlySummary(db, today.slice(0, 7)),
      txs: await listTransactions(db, month.from, month.to),
    }
  }, [db, today])
  if (!data) return null
  const { week, monthLeft, goals, summary, txs } = data
  const days = [...new Set(txs.map((t) => t.logDate))]
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-xl font-semibold">Money</h1>
      <Left label="this week" left={week} />
      {monthLeft.limitPence > 0 ? <Left label="this month" left={monthLeft} /> : null}

      {goals.length > 0 ? (
        <section aria-label="Savings">
          {goals.slice(0, 3).map((p) => (
            <Link key={p.goal.id} to={`/money/goals/${p.goal.id}`} className="flex min-h-14 flex-col justify-center gap-1 border-b border-fog py-2">
              <span className="flex justify-between"><span>{p.goal.name}</span><span className="text-slate">{p.percent}% saved, {formatPence(p.remainingPence)} to go</span></span>
              <TallyMarks percent={p.percent} seed={p.goal.id} label={goalLabel(p)} />
            </Link>
          ))}
        </section>
      ) : null}

      <section aria-label="This month" className="grid grid-cols-3 gap-2">
        <div><p className="text-sm text-slate">Income</p><Amount pence={summary.incomePence} size="body" /></div>
        <div><p className="text-sm text-slate">Spent</p><Amount pence={summary.spentPence} size="body" /></div>
        <div><p className="text-sm text-slate">Saved</p><Amount pence={summary.savedPence} size="body" /></div>
      </section>

      <nav aria-label="Money sections" className="flex flex-wrap gap-4">
        <Link className="flex min-h-11 items-center text-pond" to="/money/budgets">Budgets</Link>
        <Link className="flex min-h-11 items-center text-pond" to="/money/recurring">Recurring</Link>
        <Link className="flex min-h-11 items-center text-pond" to="/money/goals">Goals</Link>
      </nav>

      {txs.length === 0 ? (
        <EmptyState message="No spending yet this month" action={{ label: 'Add expense', onClick: () => navigate('/money/add?kind=expense') }} />
      ) : (
        <section aria-label="Transactions">
          {days.map((d) => (
            <div key={d}>
              <h2 className="pt-3 text-sm text-slate">{new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              {txs.filter((t) => t.logDate === d).map((t) => {
                const name = t.merchant ?? (t.kind === 'income' ? 'Income' : 'Expense')
                return (
                  <ListRow
                    key={t.id} title={name} detail={t.kind === 'income' ? 'Income' : undefined}
                    trailing={
                      <>
                        <Amount pence={t.kind === 'income' ? t.amountPence : -t.amountPence} />
                        <Button
                          variant="quiet" aria-label={`Delete ${name}`}
                          onClick={async () => {
                            await deleteTransaction(db, t.id)
                            reload()
                            toast.show('Deleted', { undo: () => void restoreTransaction(db, t.id).then(reload) })
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    }
                  />
                )
              })}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export default function Money() {
  return (
    <Routes>
      <Route index element={<MoneyHome />} />
      <Route path="add" element={<AddTransaction />} />
      <Route path="budgets" element={<Budgets />} />
      <Route path="recurring" element={<Recurring />} />
      <Route path="goals" element={<Goals />} />
      <Route path="goals/new" element={<NewGoal />} />
      <Route path="goals/:id" element={<GoalDetail />} />
    </Routes>
  )
}
