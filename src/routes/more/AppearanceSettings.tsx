import { ChoiceList, SubScreen } from '../../components/settings/SettingsUi'
import { useSettings } from '../../state/SettingsProvider'

export default function AppearanceSettings() {
  const { settings, update } = useSettings()
  return (
    <SubScreen title="Appearance">
      <ChoiceList
        label="Theme" value={settings.theme ?? 'system'} onChange={(t) => update({ theme: t === 'system' ? undefined : t })}
        options={[{ value: 'system', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
      />
    </SubScreen>
  )
}
