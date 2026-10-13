import { ChoiceList, SubScreen } from '../../components/settings/SettingsUi'
import { useSettings } from '../../state/SettingsProvider'

export default function TrainingSettings() {
  const { settings, update } = useSettings()
  return (
    <SubScreen title="Training">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Weight unit</h2>
        <ChoiceList
          label="Weight unit" value={settings.weightUnit} onChange={(weightUnit) => update({ weightUnit })}
          options={[{ value: 'kg', label: 'Kilograms (kg)' }, { value: 'lb', label: 'Pounds (lb)' }]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Rest timer</h2>
        <ChoiceList
          label="Rest timer length" value={settings.restSeconds} onChange={(restSeconds) => update({ restSeconds })}
          options={[60, 90, 120, 180].map((s) => ({ value: s, label: `${s} s` }))}
        />
      </section>
    </SubScreen>
  )
}
