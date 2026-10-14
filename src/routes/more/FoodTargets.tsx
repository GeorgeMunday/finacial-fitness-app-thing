import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChoiceList, SubScreen } from '../../components/settings/SettingsUi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { useAsync } from '../../hooks/useAsync'
import { localDate } from '../../domain/dates'
import { KCAL_FLOOR, SUPPORT_MESSAGE } from '../../domain/safety'
import { ACTIVITY, latestWeight, logWeight, suggestTargets, type Activity, type WeightGoal } from '../../domain/targets'
import { fromKg, toKg } from '../../domain/units'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'

const input = 'min-h-11 rounded-xl border border-fog bg-surface px-3'
const num = (s: string) => {
  const v = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(v) ? v : null
}
const GOALS: { value: WeightGoal; label: string; hint: string }[] = [
  { value: 'lose', label: 'Lose weight', hint: 'Slowly: never more than 1% of your weight a week' },
  { value: 'maintain', label: 'Stay the same', hint: 'Eat about what you use' },
  { value: 'gain', label: 'Gain weight or build muscle', hint: 'A small surplus' },
]

/** "Work out my targets": Mifflin–St Jeor and simple rules, shown before anything is saved. */
export default function FoodTargets() {
  const db = useDb()
  const navigate = useNavigate()
  const toast = useToast()
  const { settings, update } = useSettings()
  const unit = settings.weightUnit
  const { data: lastKg } = useAsync(() => latestWeight(db), [db])
  const [year, setYear] = useState(settings.birthYear ? String(settings.birthYear) : '')
  const [height, setHeight] = useState(settings.heightCm ? String(settings.heightCm) : '')
  const [weight, setWeight] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity | ''>(settings.activity ?? '')
  const [goal, setGoal] = useState<WeightGoal | ''>(settings.weightGoal ?? '')
  const weightText = weight ?? (lastKg ? String(fromKg(lastKg, unit)) : '')

  const thisYear = new Date().getFullYear()
  const y = num(year), h = num(height), w = num(weightText)
  const age = y === null ? null : thisYear - y
  const weightKg = w === null ? null : toKg(w, unit)
  const errors = {
    year: year && (age === null || age < 18 || age > 100 || !Number.isInteger(y)) ? 'Enter the year you were born, like 1990.' : null,
    height: height && (h === null || h < 120 || h > 230) ? 'Enter your height in centimetres, like 175.' : null,
    weight: weightText && (weightKg === null || weightKg < 35 || weightKg > 300) ? `Enter your weight in ${unit}.` : null,
  }
  const ready = age !== null && h !== null && weightKg !== null && activity && goal && !errors.year && !errors.height && !errors.weight
  const t = ready
    ? suggestTargets({ sex: settings.sex, age, heightCm: h, weightKg, activity, goal, training: settings.optionalPillars.includes('train') })
    : null
  const hide = settings.hideCalories

  return (
    <SubScreen title="Work out my targets">
      <p className="text-slate">
        Tally estimates what you use in a day from your age, height, weight and how active you are, then suggests daily targets.
        Nothing is saved until you choose to use them.
      </p>
      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Year you were born
          <input className={input} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        {errors.year ? <p className="text-amber-ink">{errors.year}</p> : null}
        <label className="flex flex-col gap-1">
          Height (cm)
          <input className={input} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
        {errors.height ? <p className="text-amber-ink">{errors.height}</p> : null}
        <label className="flex flex-col gap-1">
          {`Weight (${unit})`}
          <input className={input} inputMode="decimal" value={weightText} onChange={(e) => setWeight(e.target.value)} />
        </label>
        {errors.weight ? <p className="text-amber-ink">{errors.weight}</p> : null}
        <p className="text-sm text-slate">
          {`The estimate uses the sex in your food settings (${settings.sex === 'unspecified' ? 'prefer not to say' : settings.sex}).`}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">How active is a normal day?</h2>
        <ChoiceList<Activity | ''>
          label="How active is a normal day?" value={activity} onChange={setActivity}
          options={(Object.keys(ACTIVITY) as Activity[]).map((a) => ({ value: a, label: ACTIVITY[a].label, hint: ACTIVITY[a].hint }))}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">What would you like to do?</h2>
        <ChoiceList<WeightGoal | ''> label="What would you like to do?" value={goal} onChange={setGoal} options={GOALS} />
      </section>
      {t ? (
        <section aria-label="Your suggested targets" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">Your suggested targets</h2>
          {t.loseRefused ? <p>{`Your weight is already on the low side for your height, so Tally won't plan a loss. These targets keep you where you are. ${SUPPORT_MESSAGE}`}</p> : null}
          <ul className="flex flex-col gap-1">
            {hide ? null : <li>{`${t.kcal.toLocaleString('en-GB')} kcal a day`}</li>}
            <li>{`${t.proteinG} g protein`}</li>
            <li>{`${t.fibreG} g fibre`}</li>
            <li>{`About ${t.carbsG} g carbs and ${t.fatG} g fat`}</li>
          </ul>
          {!hide && t.kcalClamped ? <p className="text-sm">{`Tally doesn't set targets below ${KCAL_FLOOR[settings.sex].toLocaleString('en-GB')} kcal, so this is the lowest it suggests.`}</p> : null}
          <p className="text-sm text-slate">
            These are estimates for healthy adults, not medical advice. If you're pregnant, have a health condition or are recovering from an
            eating disorder, ask your GP or a dietitian first.
          </p>
          <Button
            onClick={async () => {
              await logWeight(db, Math.round(weightKg! * 10) / 10, localDate())
              await update({
                kcalTarget: t.kcal, proteinTarget: t.proteinG, fibreTarget: t.fibreG, carbsTarget: t.carbsG, fatTarget: t.fatG,
                birthYear: y!, heightCm: h!, activity: activity as Activity, weightGoal: goal as WeightGoal,
              })
              toast.show('Targets saved')
              navigate('/food')
            }}
          >
            Use these targets
          </Button>
        </section>
      ) : null}
    </SubScreen>
  )
}
