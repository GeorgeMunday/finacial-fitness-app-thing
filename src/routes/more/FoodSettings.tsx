import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChoiceList, SubScreen, SwitchRow } from '../../components/settings/SettingsUi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { Sex } from '../../db/types'
import { clampTarget, KCAL_FLOOR } from '../../domain/safety'
import { useSettings } from '../../state/SettingsProvider'

const input = 'min-h-11 rounded-xl border border-fog bg-surface px-3'

export default function FoodSettings() {
  const { settings, update } = useSettings()
  const toast = useToast()
  const [kcal, setKcal] = useState(settings.kcalTarget ? String(settings.kcalTarget) : '')
  const [protein, setProtein] = useState(settings.proteinTarget ? String(settings.proteinTarget) : '')
  const [fibre, setFibre] = useState(settings.fibreTarget ? String(settings.fibreTarget) : '')
  const [carbs, setCarbs] = useState(settings.carbsTarget ? String(settings.carbsTarget) : '')
  const [fat, setFat] = useState(settings.fatTarget ? String(settings.fatTarget) : '')
  const grams = (s: string) => (s.trim() === '' ? null : Number(s))
  const gramsOk = (s: string) => s.trim() === '' || (Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) < 2000)
  const [clampNote, setClampNote] = useState<string | null>(null)
  const kcalN = kcal.trim() === '' ? null : Number(kcal)
  const proteinN = protein.trim() === '' ? null : Number(protein)
  const valid = (kcalN === null || (Number.isFinite(kcalN) && kcalN > 0 && kcalN < 10000)) && (proteinN === null || (Number.isFinite(proteinN) && proteinN >= 0 && proteinN < 1000)) && [fibre, carbs, fat].every(gramsOk)

  async function saveTargets() {
    let kcalTarget: number | undefined
    if (kcalN !== null) {
      const c = clampTarget(kcalN, settings.sex)
      kcalTarget = c.kcal
      setKcal(String(c.kcal))
      setClampNote(c.clamped ? `Tally doesn't set targets below ${KCAL_FLOOR[settings.sex].toLocaleString('en-GB')} kcal, so your target is ${c.kcal.toLocaleString('en-GB')} kcal.` : null)
    }
    const round = (s: string) => { const v = grams(s); return v === null ? undefined : Math.round(v) }
    await update({ kcalTarget, proteinTarget: proteinN === null ? undefined : Math.round(proteinN), fibreTarget: round(fibre), carbsTarget: round(carbs), fatTarget: round(fat) })
    toast.show('Targets saved')
  }

  return (
    <SubScreen title="Food">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Targets</h2>
        <Link to="/you/food/targets" className="flex min-h-11 items-center self-start rounded-xl border border-fog bg-surface px-4">Work out my targets</Link>
        <p className="text-sm text-slate">Or set them yourself:</p>
        <label className="flex flex-col gap-1">
          Daily calorie target
          <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Daily protein target (g)
          <input inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Daily fibre target (g)
          <input inputMode="numeric" value={fibre} onChange={(e) => setFibre(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Daily carbs target (g)
          <input inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Daily fat target (g)
          <input inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} className={input} />
        </label>
        <Button disabled={!valid} className="self-start" onClick={saveTargets}>Save targets</Button>
        {clampNote ? <p className="text-sm">{clampNote}</p> : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Calorie guidance is based on</h2>
        <ChoiceList<Sex>
          label="Sex for calorie guidance" value={settings.sex} onChange={(sex) => update({ sex })}
          options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'unspecified', label: 'Prefer not to say' }]}
        />
      </section>
      <div className="border-t border-fog">
        <SwitchRow
          label="Hide calorie numbers" hint="Calories disappear from food screens, Today and your progress."
          checked={settings.hideCalories} onChange={(hideCalories) => update({ hideCalories })}
        />
      </div>
    </SubScreen>
  )
}
