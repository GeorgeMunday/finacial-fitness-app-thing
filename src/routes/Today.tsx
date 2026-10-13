import { useFormatDate } from '../hooks/useFormatDate'
import { Link, useNavigate } from 'react-router-dom'
import { ProfileButton } from '../components/profile/ProfileButton'
import { TodayCard } from '../components/TodayCard'
import { Amount } from '../components/ui/Amount'
import { Button } from '../components/ui/Button'
import { TallyMarks } from '../components/ui/TallyMarks'
import { useAsync } from '../hooks/useAsync'
import { localDate } from '../domain/dates'
import { formatPence } from '../domain/money'
import { SUPPORT_MESSAGE } from '../domain/safety'
import { todaySummary, weeklyFoodSpend } from '../domain/today'
import { useDb } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'

export default function Today() {
  const db = useDb()
  const fmt = useFormatDate()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const today = localDate()
  const { data } = useAsync(async () => ({ s: await todaySummary(db, today), w: await weeklyFoodSpend(db, today) }), [db, today, settings])
  if (!data) return null
  const { s, w } = data
  const m = s.money
  const g = m.topGoal
  const over = m.weekLimitPence > 0 && m.leftThisWeekPence < 0
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-slate">{new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        <ProfileButton />
      </header>

      <section aria-label="Money" className="flex flex-col gap-4">
        {m.weekLimitPence > 0 ? (
          <div>
            <Amount pence={Math.abs(m.leftThisWeekPence)} size="hero" />
            <p className={over ? 'text-amber-ink' : 'text-slate'}>{over ? 'over budget this week' : 'left to spend this week'}</p>
          </div>
        ) : (
          <div>
            <Amount pence={m.spentThisWeekPence} size="hero" />
            <p className="text-slate">spent this week. <Link to="/money/budgets" className="text-pond underline">Set a budget</Link></p>
          </div>
        )}
        <p>Spent today {formatPence(m.spentTodayPence)}</p>
        {g ? (
          <Link to={`/money/goals/${g.id}`} className="flex flex-col gap-1 py-1">
            <span className="flex items-center gap-3">
              <span className="font-semibold">{g.name}</span>
              <TallyMarks percent={g.percent} seed={g.id} label={`${g.name}, ${g.percent}% saved, ${formatPence(g.remainingPence)} to go`} />
            </span>
            <span className={g.onTrack ? 'text-slate' : 'text-amber-ink'}>
              {g.remainingPence === 0 ? 'Goal met' : `${formatPence(g.remainingPence)} to go, ${g.onTrack ? 'on track' : 'behind'}`}
            </span>
          </Link>
        ) : (
          <Link to="/money/goals/new" className="text-pond">Set a savings goal</Link>
        )}
        <Button className="mt-2 min-h-14 text-lg" onClick={() => navigate('/money/add?kind=expense')}>Add expense</Button>
      </section>

      {s.backupDue ? (
        <TodayCard title="Back up your data" to="/you/data">
          <p className="text-slate">It's been over 30 days. Your data only lives in this browser, so download a backup from your profile.</p>
        </TodayCard>
      ) : null}

      {s.food ? (
        <TodayCard title="Food" to="/food">
          <p>
            {s.food.kcalLeft !== undefined ? `${s.food.kcalLeft.toLocaleString('en-GB')} kcal left, ` : settings.hideCalories ? '' : `${s.food.kcal.toLocaleString('en-GB')} kcal, `}
            {s.food.proteinLeft !== undefined ? `${s.food.proteinLeft} g protein to go` : `${s.food.proteinG} g protein`}
          </p>
        </TodayCard>
      ) : null}
      {s.showSupport ? <p className="rounded-xl bg-surface p-3">{SUPPORT_MESSAGE}</p> : null}

      {s.train ? (
        <TodayCard title="Train" to="/train">
          <p>{s.train.workoutToday ? 'Workout logged today' : s.train.lastWorkoutDate ? `Last workout ${fmt(s.train.lastWorkoutDate)}` : 'No workouts yet'}</p>
        </TodayCard>
      ) : null}

      <TodayCard title="Food spending this week">
        <p>Groceries {formatPence(w.groceriesPence)}, eating out {formatPence(w.eatingOutPence)}, takeaway {formatPence(w.takeawayPence)}</p>
        {w.avgProteinG !== undefined ? (
          <p className="text-slate">
            Daily average {settings.hideCalories ? '' : `${w.avgKcal?.toLocaleString('en-GB')} kcal, `}{w.avgProteinG} g protein
          </p>
        ) : null}
      </TodayCard>

      <TodayCard title="Your progress" to="/progress">
        <p className="text-slate">See how your spending{s.food ? ', food' : ''}{s.train ? ' and training' : ''} have gone over time.</p>
      </TodayCard>

      <p className="text-sm text-slate">You logged something on {s.loggedDaysLast7} of the last 7 days.</p>
    </div>
  )
}
