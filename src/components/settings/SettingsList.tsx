import { formatDate } from '../../domain/dates'
import { getMonthlyIncome } from '../../domain/income'
import { formatPence } from '../../domain/money'
import { useAsync } from '../../hooks/useAsync'
import { useDb } from '../../state/DbProvider'
import { useSettings } from '../../state/SettingsProvider'
import { Group, RowLink } from './SettingsUi'

export function SettingsList() {
  const db = useDb()
  const { settings } = useSettings()
  const { data: income } = useAsync(() => getMonthlyIncome(db), [db])
  const food = settings.optionalPillars.includes('food')
  const train = settings.optionalPillars.includes('train')
  const theme = settings.theme === 'dark' ? 'Dark' : settings.theme === 'light' ? 'Light' : 'Match device'
  return (
    <nav aria-label="Settings" className="flex flex-col gap-6">
      <Group title="Profile">
        <RowLink to="/more/profile" label="Name and avatar" value={settings.displayName?.trim() || 'You'} />
      </Group>
      <Group title="Money">
        <RowLink to="/more/income" label="Monthly income" value={income ? `${formatPence(income.amountPence)}, day ${income.payDay}` : 'Not set'} />
        <RowLink to="/money/budgets" label="Budgets" />
        <RowLink to="/money/recurring" label="Recurring payments" />
        <RowLink to="/money/goals" label="Savings goals" />
      </Group>
      {food ? (
        <Group title="Food">
          <RowLink
            to="/more/food" label="Targets and calories"
            value={settings.hideCalories ? 'Calories hidden' : settings.kcalTarget ? `${settings.kcalTarget.toLocaleString('en-GB')} kcal` : 'No target'}
          />
        </Group>
      ) : null}
      {train ? (
        <Group title="Training">
          <RowLink to="/more/training" label="Units and rest timer" value={`${settings.weightUnit}, ${settings.restSeconds} s`} />
        </Group>
      ) : null}
      <Group title="Dates">
        <RowLink to="/more/dates" label="Date format" value={formatDate('2026-10-12', settings.dateFormat)} />
      </Group>
      <Group title="Appearance">
        <RowLink to="/more/appearance" label="Theme" value={theme} />
      </Group>
      <Group title="Sections">
        <RowLink to="/more/sections" label="Food and training" value={[food && 'Food', train && 'Training'].filter(Boolean).join(', ') || 'Money only'} />
      </Group>
      <Group title="Your data">
        <RowLink
          to="/more/data" label="Backup and storage"
          value={settings.lastBackupAt ? `Backed up ${formatDate(settings.lastBackupAt.slice(0, 10), settings.dateFormat)}` : 'No backup yet'}
        />
      </Group>
    </nav>
  )
}
