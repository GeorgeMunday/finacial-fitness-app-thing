import { formatDate } from '../domain/dates'
import { useSettings } from '../state/SettingsProvider'

/** Formats a YYYY-MM-DD date in the user's chosen style. */
export function useFormatDate(): (logDate: string) => string {
  const { settings } = useSettings()
  return (d) => formatDate(d.slice(0, 10), settings.dateFormat)
}
