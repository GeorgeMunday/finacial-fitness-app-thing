import { ChoiceList, SubScreen } from '../../components/settings/SettingsUi'
import { formatDate } from '../../domain/dates'
import { useSettings } from '../../state/SettingsProvider'

export default function DateSettings() {
  const { settings, update } = useSettings()
  return (
    <SubScreen title="Dates">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Date format</h2>
        <ChoiceList
          label="Date format" value={settings.dateFormat} onChange={(dateFormat) => update({ dateFormat })}
          options={[
            { value: 'long', label: formatDate('2026-10-12', 'long') },
            { value: 'numeric', label: formatDate('2026-10-12', 'numeric') },
          ]}
        />
      </section>
      <p className="text-sm text-slate">Weeks start on Monday.</p>
    </SubScreen>
  )
}
