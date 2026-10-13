import { Link } from 'react-router-dom'
import { formatPence } from '../domain/money'
import type { GoalProgress } from '../domain/savings'
import { ProgressBar } from './ProgressBar'
import { Button } from './ui/Button'
import { TallyMarks } from './ui/TallyMarks'

export const periodLabel = (p: GoalProgress) =>
  p.goal.period === 'month' ? 'This month' : p.goal.period === 'year' ? 'This year' : `By ${p.goal.targetDate}`

export function goalLabel(p: GoalProgress): string {
  return `${p.goal.name}, ${p.percent}% saved, ${formatPence(p.remainingPence)} to go`
}

export function GoalRow({ progress: p, onSave }: { progress: GoalProgress; onSave: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-b border-fog py-3">
      <div className="flex items-center justify-between gap-3">
        <Link to={`/money/goals/${p.goal.id}`} className="min-h-11 min-w-0 flex-1 py-2">
          <div className="truncate font-semibold">{p.goal.name}</div>
          <div className="text-sm text-slate">{periodLabel(p)}</div>
        </Link>
        <Button variant="secondary" aria-label={`Save to ${p.goal.name}`} onClick={onSave}>+ Save</Button>
      </div>
      <TallyMarks percent={p.percent} seed={p.goal.id} label={goalLabel(p)} />
      <ProgressBar percent={p.percent} label={`${p.goal.name} progress`} />
      <div className="flex justify-between text-sm">
        <span className="text-slate">{formatPence(p.savedPence)} of {formatPence(p.targetPence)}</span>
        <span className={p.onTrack ? 'text-slate' : 'text-amber-ink'}>
          {p.remainingPence === 0 ? 'Goal met' : p.onTrack ? `${formatPence(p.remainingPence)} to go, on track` : `${formatPence(p.perMonthNeededPence)} a month to catch up`}
        </span>
      </div>
    </div>
  )
}
