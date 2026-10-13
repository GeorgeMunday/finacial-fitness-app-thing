import { DataSection } from '../../components/DataSection'
import { SubScreen } from '../../components/settings/SettingsUi'
import { useStorageStatus } from '../../state/DbProvider'

const yesNo = (v: boolean | null) => (v === null ? 'Not supported' : v ? 'Yes' : 'No')

export default function DataSettings() {
  const storage = useStorageStatus()
  return (
    <SubScreen title="Your data">
      <dl className="border-t border-fog">
        {[
          ['Saved in this browser', storage.persistent ? 'Yes' : 'No'],
          ['Protected from clean-up', yesNo(storage.persisted)],
          ['Installed to Home Screen', storage.standalone ? 'Yes' : 'No'],
        ].map(([k, v]) => (
          <div key={k} className="flex min-h-14 items-center justify-between border-b border-fog py-3">
            <dt>{k}</dt>
            <dd className="text-slate">{v}</dd>
          </div>
        ))}
      </dl>
      <DataSection />
    </SubScreen>
  )
}
