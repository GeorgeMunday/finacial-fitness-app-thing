import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../src/components/ui/Toast'
import type { SqlExecutor } from '../src/db/executor'
import { migrate } from '../src/db/migrations'
import { DbContext } from '../src/state/DbProvider'
import { SettingsProvider } from '../src/state/SettingsProvider'
import { updateSettings, type Settings } from '../src/state/settings'
import { memoryExecutor } from './memoryExecutor'

export async function freshDb(settings: Partial<Settings> = { onboarded: true }): Promise<SqlExecutor> {
  const db = memoryExecutor()
  await migrate(db)
  await updateSettings(db, settings)
  return db
}

export function renderApp(ui: ReactElement, db: SqlExecutor, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <DbContext.Provider value={{ db, persistent: true }}>
        <SettingsProvider>
          <ToastProvider>{ui}</ToastProvider>
        </SettingsProvider>
      </DbContext.Provider>
    </MemoryRouter>,
  )
}
