import { Chip } from '../components/ui/Chip'
import { Sheet } from '../components/ui/Sheet'
import { DataSection } from '../components/DataSection'
import { useStorageStatus } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { formatPence, parsePence } from '../domain/money'
import { useState } from 'react'
import { clampTarget, KCAL_FLOOR } from '../domain/safety'
import type { Sex } from '../db/types'

const yesNo = (v: boolean | null) => (v === null ? 'Not supported' : v ? 'Yes' : 'No')

export default function More() {
  const { settings, update } = useSettings()
  const storage = useStorageStatus()
  const [income, setIncome] = useState(settings.monthlyIncomePence ? (settings.monthlyIncomePence / 100).toFixed(2) : '')
  const incomePence = parsePence(income)
  const [kcal, setKcal] = useState(settings.kcalTarget ? String(settings.kcalTarget) : '')
  const [protein, setProtein] = useState(settings.proteinTarget ? String(settings.proteinTarget) : '')
  const [clampNote, setClampNote] = useState<string | null>(null)
  const kcalN = kcal.trim() === '' ? null : Number(kcal)
  const proteinN = protein.trim() === '' ? null : Number(protein)
  const targetsValid = (kcalN === null || (Number.isFinite(kcalN) && kcalN > 0 && kcalN < 10000)) && (proteinN === null || (Number.isFinite(proteinN) && proteinN >= 0 && proteinN < 1000))
  async function saveTargets() {
    let kcalTarget: number | undefined
    if (kcalN !== null) {
      const c = clampTarget(kcalN, settings.sex)
      kcalTarget = c.kcal
      setKcal(String(c.kcal))
      setClampNote(c.clamped ? `Tally doesn't set targets below ${KCAL_FLOOR[settings.sex].toLocaleString('en-GB')} kcal, so your target is ${c.kcal.toLocaleString('en-GB')} kcal.` : null)
    }
    await update({ kcalTarget, proteinTarget: proteinN === null ? undefined : Math.round(proteinN) })
  }
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentTicked, setConsentTicked] = useState(false)
  const togglePillar = (p: 'food' | 'train') => {
    const cur = settings.optionalPillars
    if (p === 'food' && !cur.includes('food') && !settings.healthConsent) {
      setConsentOpen(true)
      return
    }
    return update({ optionalPillars: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] })
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-semibold">More</h1>
      <section aria-labelledby="pillars" className="flex flex-col gap-2">
        <h2 id="pillars" className="font-semibold">Optional sections</h2>
        <div className="flex gap-2">
          <Chip selected={settings.optionalPillars.includes('food')} onClick={() => togglePillar('food')}>Food</Chip>
          <Chip selected={settings.optionalPillars.includes('train')} onClick={() => togglePillar('train')}>Train</Chip>
        </div>
      </section>
      {settings.optionalPillars.includes('food') ? (
        <section aria-labelledby="targets" className="flex flex-col gap-2">
          <h2 id="targets" className="font-semibold">Food targets</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sex for calorie guidance">
            {([['female', 'Female'], ['male', 'Male'], ['unspecified', 'Prefer not to say']] as [Sex, string][]).map(([v, l]) => (
              <Chip key={v} selected={settings.sex === v} onClick={() => update({ sex: v })}>{l}</Chip>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            Daily calorie target
            <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className="min-h-11 rounded-xl border border-fog bg-surface px-3" />
          </label>
          <label className="flex flex-col gap-1">
            Daily protein target (g)
            <input inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className="min-h-11 rounded-xl border border-fog bg-surface px-3" />
          </label>
          <button disabled={!targetsValid} onClick={saveTargets} className="min-h-11 self-start rounded-xl bg-pond px-4 text-on-pond disabled:opacity-50">Save targets</button>
          {clampNote ? <p className="text-sm">{clampNote}</p> : null}
        </section>
      ) : null}
      <section aria-labelledby="income" className="flex flex-col gap-2">
        <h2 id="income" className="font-semibold">Monthly income</h2>
        <input
          aria-label="Monthly income" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)}
          className="min-h-11 rounded-xl border border-fog bg-surface px-3"
        />
        <button
          disabled={incomePence === null}
          className="min-h-11 self-start rounded-xl bg-pond px-4 text-on-pond disabled:opacity-50"
          onClick={() => incomePence !== null && update({ monthlyIncomePence: incomePence })}
        >
          Save income
        </button>
        {settings.monthlyIncomePence ? <p className="text-sm text-slate">Currently {formatPence(settings.monthlyIncomePence)}</p> : null}
      </section>
      <section aria-labelledby="prefs" className="flex flex-col gap-2">
        <h2 id="prefs" className="font-semibold">Preferences</h2>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked={settings.hideCalories} onChange={(e) => update({ hideCalories: e.target.checked })} />
          Hide calorie numbers
        </label>
        <div className="flex gap-2" role="group" aria-label="Weight unit">
          <Chip selected={settings.weightUnit === 'kg'} onClick={() => update({ weightUnit: 'kg' })}>kg</Chip>
          <Chip selected={settings.weightUnit === 'lb'} onClick={() => update({ weightUnit: 'lb' })}>lb</Chip>
        </div>
        <div className="flex gap-2" role="group" aria-label="Theme">
          <Chip selected={!settings.theme} onClick={() => update({ theme: undefined })}>Match device</Chip>
          <Chip selected={settings.theme === 'light'} onClick={() => update({ theme: 'light' })}>Light</Chip>
          <Chip selected={settings.theme === 'dark'} onClick={() => update({ theme: 'dark' })}>Dark</Chip>
        </div>
      </section>
      <Sheet open={consentOpen} onClose={() => setConsentOpen(false)} title="Your health data">
        <div className="flex flex-col gap-3">
          <p>To use Food, Tally stores your food logs and body weight on this device. Nothing is sent anywhere.</p>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-6" checked={consentTicked} onChange={(e) => setConsentTicked(e.target.checked)} />
            I agree Tally can store this health data on my device
          </label>
          <button
            disabled={!consentTicked}
            className="min-h-11 rounded-xl bg-pond px-4 text-on-pond disabled:opacity-50"
            onClick={async () => {
              await update({ healthConsent: true, optionalPillars: [...settings.optionalPillars, 'food'] })
              setConsentOpen(false)
            }}
          >
            I agree
          </button>
        </div>
      </Sheet>
      <DataSection />
      <section aria-labelledby="storage" className="flex flex-col gap-1">
        <h2 id="storage" className="font-semibold">Storage</h2>
        <p>Saved in this browser: {storage.persistent ? 'Yes' : 'No'}</p>
        <p>Protected from clean-up: {yesNo(storage.persisted)}</p>
        <p>Installed to Home Screen: {storage.standalone ? 'Yes' : 'No'}</p>
      </section>
    </div>
  )
}
