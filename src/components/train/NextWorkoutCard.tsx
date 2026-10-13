import { Button } from '../ui/Button'
import { localDate } from '../../domain/dates'
import { nextWorkout } from '../../domain/programmes/plan'
import type { NextWorkout } from '../../domain/programmes/types'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'

/** "Next: Pull day" with where you are in the week, and the button that starts it. Renders nothing without an active programme. */
export function NextWorkoutCard({ onStart }: { onStart: (next: NextWorkout) => void | Promise<void> }) {
  const db = useDb()
  const { data: next } = useAsync(() => nextWorkout(db, localDate()), [db])
  if (!next) return null
  const progress = [
    `Day ${next.dayNumber} of ${next.daysInRotation}`,
    `${next.doneThisWeek} of ${next.plannedPerWeek} done this week`,
    next.cycleWeek ? `Week ${next.cycleWeek} of 3` : null,
  ].filter(Boolean).join(' · ')
  return (
    <section aria-label="Next workout" className="flex flex-col gap-2 border-b border-fog pb-5">
      <p className="text-sm text-slate">{next.programmeName}</p>
      <h2 className="font-display text-xl font-semibold">Next: {next.dayName}</h2>
      <p className="text-slate">{progress}</p>
      {next.doneToday ? <p className="text-slate">Done today</p> : null}
      <Button className="mt-1 self-start" onClick={() => onStart(next)}>
        {next.openWorkoutId ? `Continue ${next.dayName}` : `Start ${next.dayName}`}
      </Button>
    </section>
  )
}
