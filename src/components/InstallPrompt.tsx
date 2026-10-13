import { isIos } from '../state/storage'
import { useStorageStatus } from '../state/DbProvider'

export function InstallPrompt() {
  const { standalone } = useStorageStatus()
  if (standalone || !isIos()) return null
  return (
    <div className="border-b border-fog bg-surface px-4 py-2 text-sm">
      Add Tally to your Home Screen to keep your data safe. Safari may clear data for sites not used for 7 days.
    </div>
  )
}
