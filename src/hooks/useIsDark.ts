import { useEffect, useState } from 'react'
import { useSettings } from '../state/SettingsProvider'

/** Whether the app is currently drawn dark: the manual choice in settings, else the device setting. */
export function useIsDark(): boolean {
  const { settings } = useSettings()
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const [systemDark, setSystemDark] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    query.addEventListener?.('change', on)
    return () => query.removeEventListener?.('change', on)
  }, [query])
  return settings.theme ? settings.theme === 'dark' : systemDark
}
