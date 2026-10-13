import { useState } from 'react'
import { SubScreen, SwitchRow } from '../../components/settings/SettingsUi'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { useSettings } from '../../state/SettingsProvider'

export default function SectionSettings() {
  const { settings, update } = useSettings()
  const [consentOpen, setConsentOpen] = useState(false)
  const [ticked, setTicked] = useState(false)
  const on = (p: 'food' | 'train') => settings.optionalPillars.includes(p)
  const set = (p: 'food' | 'train', value: boolean) => {
    if (p === 'food' && value && !settings.healthConsent) return setConsentOpen(true)
    const cur = settings.optionalPillars.filter((x) => x !== p)
    return update({ optionalPillars: value ? [...cur, p] : cur })
  }
  return (
    <SubScreen title="Sections">
      <p className="text-slate">Money is always on. Turn on the extras you want.</p>
      <div className="border-t border-fog">
        <SwitchRow label="Food" hint="Log meals, protein and barcodes." checked={on('food')} onChange={(v) => set('food', v)} />
        <SwitchRow label="Training" hint="Log workouts, sets and personal bests." checked={on('train')} onChange={(v) => set('train', v)} />
      </div>
      <Sheet open={consentOpen} onClose={() => setConsentOpen(false)} title="Your health data">
        <div className="flex flex-col gap-3">
          <p>To use Food, Tally stores your food logs and body weight on this device. Nothing is sent anywhere.</p>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-6" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            I agree Tally can store this health data on my device
          </label>
          <Button
            disabled={!ticked}
            onClick={async () => {
              await update({ healthConsent: true, optionalPillars: on('food') ? settings.optionalPillars : [...settings.optionalPillars, 'food'] })
              setConsentOpen(false)
            }}
          >
            I agree
          </Button>
        </div>
      </Sheet>
    </SubScreen>
  )
}
