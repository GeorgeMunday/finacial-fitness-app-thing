import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SqlExecutor } from '../db/executor'
import { openAppDb } from '../db/openDb'
import { acquireSingleTab } from '../db/singleTab'
import { isStandalone, requestPersistence } from './storage'

export type DbValue = { db: SqlExecutor; persistent: boolean }
export const DbContext = createContext<DbValue | null>(null)

function useDbValue(): DbValue {
  const v = useContext(DbContext)
  if (!v) throw new Error('DbProvider missing')
  return v
}
export const useDb = (): SqlExecutor => useDbValue().db

export type StorageStatus = { persistent: boolean; persisted: boolean | null; standalone: boolean }
export function useStorageStatus(): StorageStatus {
  const { persistent } = useDbValue()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void requestPersistence().then(setPersisted)
  }, [])
  return { persistent, persisted, standalone: isStandalone() }
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'busy' } | { kind: 'error'; message: string } | { kind: 'ready'; value: DbValue }>({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (!(await acquireSingleTab())) return !cancelled && setState({ kind: 'busy' })
        const value = await openAppDb()
        if (!cancelled) setState({ kind: 'ready', value })
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  if (state.kind === 'busy') return <p className="p-4">Tally is open in another tab.</p>
  if (state.kind === 'error') return <p className="p-4">Tally couldn't open its database: {state.message}</p>
  if (state.kind === 'loading') return null
  return <DbContext.Provider value={state.value}>{children}</DbContext.Provider>
}
