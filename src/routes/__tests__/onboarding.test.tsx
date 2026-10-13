import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { memoryExecutor } from '../../../test/memoryExecutor'
import { ToastProvider } from '../../components/ui/Toast'
import type { SqlExecutor } from '../../db/executor'
import { migrate } from '../../db/migrations'
import { StorageBanner } from '../../components/StorageBanner'
import { DbContext } from '../../state/DbProvider'
import { getSettings } from '../../state/settings'
import { SettingsProvider } from '../../state/SettingsProvider'
import OnboardingFlow from '../onboarding/OnboardingFlow'
import { localDate, nextMonthlyOccurrence } from '../../domain/dates'

let db: SqlExecutor
beforeEach(async () => {
  db = memoryExecutor()
  await migrate(db)
})

const setup = () =>
  render(
    <MemoryRouter>
      <DbContext.Provider value={{ db, persistent: true }}>
        <SettingsProvider>
          <ToastProvider><OnboardingFlow /></ToastProvider>
        </SettingsProvider>
      </DbContext.Provider>
    </MemoryRouter>,
  )

describe('onboarding', () => {
  it('age gate disables Continue until ticked', async () => {
    const user = userEvent.setup()
    setup()
    const cont = await screen.findByRole('button', { name: 'Continue' })
    expect(cont).toBeDisabled()
    await user.click(screen.getByLabelText("I'm 18 or over"))
    expect(cont).toBeEnabled()
  })

  it('money-only path saves income, goal and finishes', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByLabelText("I'm 18 or over"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Money')).toBeChecked()
    expect(screen.getByLabelText('Money')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Monthly income'), '2000')
    expect(screen.getByLabelText('Day of the month you\'re paid')).toHaveValue('1')
    await user.selectOptions(screen.getByLabelText('Day of the month you\'re paid'), '15')
    await user.click(screen.getByRole('button', { name: 'Save income' }))
    await user.type(screen.getByLabelText('Goal name'), 'Holiday')
    await user.type(screen.getByLabelText('Target'), '1200')
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(screen.queryByText(/food logs, body weight and workouts/)).toBeNull()
    expect(screen.getByText(/stays on this device/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start using Tally' }))
    await waitFor(async () => expect((await getSettings(db)).onboarded).toBe(true))
    const s = await getSettings(db)
    expect(s.monthlyIncomePence).toBe(200000)
    const rules = await db.all<{ next_date: string; anchor_day: number; cadence: string }>('SELECT * FROM recurring_rules WHERE kind = ?', ['income'])
    expect(rules).toEqual([expect.objectContaining({ next_date: nextMonthlyOccurrence(localDate(), 15), anchor_day: 15, cadence: 'monthly' })])
    expect(await db.all('SELECT * FROM savings_goals')).toHaveLength(1)
  })

  it('skip saves nothing', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByLabelText("I'm 18 or over"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Start using Tally' }))
    await waitFor(async () => expect((await getSettings(db)).onboarded).toBe(true))
    expect((await getSettings(db)).monthlyIncomePence).toBeUndefined()
    expect(await db.all('SELECT * FROM savings_goals')).toHaveLength(0)
  })

  it('consent screen appears for Food and "Not now" removes it', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByLabelText("I'm 18 or over"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByLabelText('Food'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByText(/food logs, body weight and workouts/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    await user.click(screen.getByRole('button', { name: 'Start using Tally' }))
    await waitFor(async () => expect((await getSettings(db)).onboarded).toBe(true))
    expect((await getSettings(db)).optionalPillars).toEqual([])
  })

  it('consent must be ticked to keep Food', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByLabelText("I'm 18 or over"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByLabelText('Food'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    const agree = screen.getByRole('button', { name: 'I agree' })
    expect(agree).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(agree)
    await user.click(screen.getByRole('button', { name: 'Start using Tally' }))
    await waitFor(async () => expect((await getSettings(db)).onboarded).toBe(true))
    const s = await getSettings(db)
    expect(s.optionalPillars).toEqual(['food'])
    expect(s.healthConsent).toBe(true)
  })
})

describe('StorageBanner', () => {
  it('warns when data cannot be saved', () => {
    render(<StorageBanner persistent={false} />)
    expect(screen.getByText(/Your data can't be saved in this browser/)).toBeInTheDocument()
  })
  it('is silent when persistent', () => {
    const { container } = render(<StorageBanner persistent />)
    expect(container).toBeEmptyDOMElement()
  })
})
