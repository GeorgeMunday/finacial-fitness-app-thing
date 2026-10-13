import { Chip } from '../components/ui/Chip'
import { useStorageStatus } from '../state/DbProvider'
import { useSettings } from '../state/SettingsProvider'
import { formatPence, parsePence } from '../domain/money'
import { useState } from 'react'

const yesNo = (v: boolean | null) => (v === null ? 'Not supported' : v ? 'Yes' : 'No')

export default function More() {
  const { settings, update } = useSettings()
  const storage = useStorageStatus()
  const [income, setIncome] = useState(settings.monthlyIncomePence ? (settings.monthlyIncomePence / 100).toFixed(2) : '')
  const incomePence = parsePence(income)
  const togglePillar = (p: 'food' | 'train') => {
    const cur = settings.optionalPillars
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
      <section aria-labelledby="storage" className="flex flex-col gap-1">
        <h2 id="storage" className="font-semibold">Storage</h2>
        <p>Saved in this browser: {storage.persistent ? 'Yes' : 'No'}</p>
        <p>Protected from clean-up: {yesNo(storage.persisted)}</p>
        <p>Installed to Home Screen: {storage.standalone ? 'Yes' : 'No'}</p>
      </section>
    </div>
  )
}
