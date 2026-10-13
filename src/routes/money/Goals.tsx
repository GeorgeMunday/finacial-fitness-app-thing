import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoalRow } from '../../components/GoalRow'
import { SaveToGoalSheet } from '../../components/SaveToGoalSheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { Amount } from '../../components/ui/Amount'
import { useAsync } from '../../hooks/useAsync'
import { localDate } from '../../domain/dates'
import { listGoals, yearlySummary } from '../../domain/savings'
import { useDb } from '../../state/DbProvider'

export default function Goals() {
  const db = useDb()
  const navigate = useNavigate()
  const today = localDate()
  const year = Number(today.slice(0, 4))
  const { data: goals, reload } = useAsync(() => listGoals(db, today), [db, today])
  const { data: summary, reload: reloadSummary } = useAsync(() => yearlySummary(db, year), [db, year])
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  if (!goals) return null
  const max = Math.max(1, ...(summary?.byMonth.map((m) => Math.max(0, m.savedPence)) ?? [1]))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Savings goals</h1>
        <Link to="/money/goals/new" className="flex min-h-11 items-center px-2 text-pond">New goal</Link>
      </div>
      {goals.length === 0 ? (
        <EmptyState message="No savings goals yet" action={{ label: 'New goal', onClick: () => navigate('/money/goals/new') }} />
      ) : (
        goals.map((p) => <GoalRow key={p.goal.id} progress={p} onSave={() => setTarget({ id: p.goal.id, name: p.goal.name })} />)
      )}
      {summary ? (
        <section aria-label={`Saved each month in ${year}`}>
          <h2 className="mb-2 flex items-baseline justify-between font-semibold">
            Saved in {year} <Amount pence={summary.savedPence} />
          </h2>
          <div className="flex h-24 items-end gap-1" aria-hidden="true">
            {summary.byMonth.map((m) => (
              <div key={m.month} className="flex-1 rounded-t bg-marigold" style={{ height: `${Math.max(2, (Math.max(0, m.savedPence) / max) * 100)}%` }} />
            ))}
          </div>
          <div className="mt-1 flex text-[0.7rem] text-slate" aria-hidden="true">
            {'JFMAMJJASOND'.split('').map((c, i) => <span key={i} className="flex-1 text-center">{c}</span>)}
          </div>
        </section>
      ) : null}
      <SaveToGoalSheet goal={target} onClose={() => setTarget(null)} onDone={() => { reload(); reloadSummary() }} />
    </div>
  )
}
