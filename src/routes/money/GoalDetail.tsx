import { useFormatDate } from '../../hooks/useFormatDate'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { periodLabel, goalLabel } from '../../components/GoalRow'
import { ProgressBar } from '../../components/ProgressBar'
import { SaveToGoalSheet } from '../../components/SaveToGoalSheet'
import { Amount } from '../../components/ui/Amount'
import { Button } from '../../components/ui/Button'
import { ListRow } from '../../components/ui/ListRow'
import { TallyMarks } from '../../components/ui/TallyMarks'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { localDate } from '../../domain/dates'
import { formatPence } from '../../domain/money'
import { archiveGoal, deleteContribution, goalProgress, listContributions, restoreContribution } from '../../domain/savings'
import { useDb } from '../../state/DbProvider'

export default function GoalDetail() {
  const { id = '' } = useParams()
  const db = useDb()
  const fmt = useFormatDate()
  const navigate = useNavigate()
  const toast = useToast()
  const today = localDate()
  const { data, reload } = useAsync(async () => ({ p: await goalProgress(db, id, today), items: await listContributions(db, id) }), [db, id, today])
  const [mode, setMode] = useState<'add' | 'withdraw' | null>(null)
  if (!data) return null
  const { p, items } = data
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold">{p.goal.name}</h1>
        <p className="text-slate">{periodLabel(p, fmt)}</p>
      </div>
      <TallyMarks percent={p.percent} seed={p.goal.id} label={goalLabel(p)} />
      <ProgressBar percent={p.percent} label={`${p.goal.name} progress`} />
      <p><Amount pence={p.savedPence} size="title" /> <span className="text-slate">of {formatPence(p.targetPence)}, {formatPence(p.remainingPence)} to go</span></p>
      <div className="flex gap-2">
        <Button onClick={() => setMode('add')}>Save to goal</Button>
        <Button variant="secondary" disabled={p.savedPence === 0} onClick={() => setMode('withdraw')}>Withdraw</Button>
      </div>
      <section>
        <h2 className="font-semibold">Contributions</h2>
        {items.length === 0 ? <p className="py-2 text-slate">Nothing saved to this goal yet.</p> : null}
        {items.map((c) => (
          <ListRow
            key={c.id} title={c.amountPence < 0 ? 'Withdrawal' : 'Saved'} detail={fmt(c.logDate)}
            trailing={
              <>
                <Amount pence={c.amountPence} />
                <Button
                  variant="quiet" aria-label={`Delete ${formatPence(c.amountPence)} on ${fmt(c.logDate)}`}
                  onClick={async () => {
                    await deleteContribution(db, c.id)
                    reload()
                    toast.show('Contribution deleted', { undo: () => void restoreContribution(db, c.id).then(reload) })
                  }}
                >
                  Delete
                </Button>
              </>
            }
          />
        ))}
      </section>
      <Button
        variant="quiet" className="self-start"
        onClick={async () => {
          await archiveGoal(db, id)
          toast.show('Goal archived')
          navigate('/money/goals', { replace: true })
        }}
      >
        Archive goal
      </Button>
      <SaveToGoalSheet goal={mode ? { id, name: p.goal.name } : null} mode={mode ?? 'add'} maxWithdrawPence={p.savedPence} onClose={() => setMode(null)} onDone={reload} />
    </div>
  )
}
