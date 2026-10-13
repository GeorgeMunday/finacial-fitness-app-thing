import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navigate, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { exportAll } from '../../domain/backup'
import { addExpense } from '../../domain/money'
import { useSettings } from '../../state/SettingsProvider'
import { getSettings } from '../../state/settings'
import More from '../More'
import OnboardingFlow from '../onboarding/OnboardingFlow'

async function backupFile() {
  const source = await freshDb({ onboarded: true, onboardedAt: '2026-01-01T00:00:00.000Z' })
  await addExpense(source, { amountPence: 4321, categoryId: 'cat-groceries', merchant: 'Restored shop', logDate: '2026-10-01' })
  return new File([JSON.stringify(await exportAll(source))], 'tally-backup.json', { type: 'application/json' })
}

function Home() {
  const { settings } = useSettings()
  return settings.onboarded ? <p>Home after restore</p> : <Navigate to="/onboarding" replace />
}

const app = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/more" element={<More />} />
    <Route path="/onboarding/*" element={<OnboardingFlow />} />
  </Routes>
)

describe('restore without reloading the page', () => {
  it('restores from More in place, so a non-persistent database keeps the data', async () => {
    const db = await freshDb({ onboarded: true })
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() })
    try {
      const user = userEvent.setup()
      renderApp(app(), db, '/more')
      fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [await backupFile()] } })
      await user.click(await screen.findByRole('button', { name: 'Replace my data' }))
      expect(await screen.findByText('Home after restore')).toBeInTheDocument()
      expect(reload).not.toHaveBeenCalled()
      expect(await db.all("SELECT * FROM transactions WHERE merchant = 'Restored shop'")).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('offers restore on the first onboarding screen, for when browser storage was cleared', async () => {
    const db = await freshDb({ onboarded: false })
    const user = userEvent.setup()
    renderApp(app(), db, '/onboarding')
    await user.click(await screen.findByRole('button', { name: 'Restore from a backup' }))
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [await backupFile()] } })
    await user.click(await screen.findByRole('button', { name: 'Replace my data' }))
    expect(await screen.findByText('Home after restore')).toBeInTheDocument()
    await waitFor(async () => expect((await getSettings(db)).onboarded).toBe(true))
  })
})
