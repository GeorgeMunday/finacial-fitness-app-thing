import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useDb } from './DbProvider'
import { getSettings, updateSettings, type Settings } from './settings'

type Value = { settings: Settings; update: (patch: Partial<Settings>) => Promise<Settings> }
const Ctx = createContext<Value | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const db = useDb()
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void getSettings(db).then(setSettings)
  }, [db])
  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = await updateSettings(db, patch)
      setSettings(next)
      return next
    },
    [db],
  )
  const value = useMemo(() => (settings ? { settings, update } : null), [settings, update])
  if (!value) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): Value {
  const v = useContext(Ctx)
  if (!v) throw new Error('SettingsProvider missing')
  return v
}
