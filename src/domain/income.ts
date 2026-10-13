import type { SqlExecutor } from '../db/executor'
import { nowIso } from '../db/ids'
import { updateSettings } from '../state/settings'
import { addDays, nextMonthlyOccurrence } from './dates'
import { addRecurringRule, deleteRecurring } from './money'

/** The recurring income rule created by onboarding and edited from More. */
export const MONTHLY_INCOME_NAME = 'Monthly income'

type Rule = { id: string; amount_pence: number; anchor_day: number | null; next_date: string }

async function findRule(db: SqlExecutor): Promise<Rule | null> {
  const [r] = await db.all<Rule>(
    `SELECT id, amount_pence, anchor_day, next_date FROM recurring_rules
     WHERE deleted_at IS NULL AND kind = 'income' AND cadence = 'monthly' AND name = ? ORDER BY rowid LIMIT 1`,
    [MONTHLY_INCOME_NAME],
  )
  return r ?? null
}

export async function getMonthlyIncome(db: SqlExecutor): Promise<{ amountPence: number; payDay: number } | null> {
  const r = await findRule(db)
  return r ? { amountPence: r.amount_pence, payDay: r.anchor_day ?? Number(r.next_date.slice(8, 10)) } : null
}

/**
 * Creates or updates the monthly income rule. A new rule starts on the next pay day on or after today.
 * Changing only the amount keeps the next date; changing the pay day moves it to the next one *after* today,
 * so a pay already posted today is never posted twice.
 */
export async function saveMonthlyIncome(db: SqlExecutor, i: { amountPence: number; payDay: number; today: string }): Promise<void> {
  const existing = await findRule(db)
  if (!existing) {
    await addRecurringRule(db, {
      kind: 'income', name: MONTHLY_INCOME_NAME, amountPence: i.amountPence, categoryId: 'cat-income', cadence: 'monthly',
      nextDate: nextMonthlyOccurrence(i.today, i.payDay), anchorDay: i.payDay,
    })
  } else {
    const oldDay = existing.anchor_day ?? Number(existing.next_date.slice(8, 10))
    const nextDate = oldDay === i.payDay ? existing.next_date : nextMonthlyOccurrence(addDays(i.today, 1), i.payDay)
    await db.run('UPDATE recurring_rules SET amount_pence = ?, anchor_day = ?, next_date = ?, updated_at = ? WHERE id = ?', [
      i.amountPence, i.payDay, nextDate, nowIso(), existing.id,
    ])
  }
  await updateSettings(db, { monthlyIncomePence: i.amountPence })
}

export async function stopMonthlyIncome(db: SqlExecutor): Promise<void> {
  const existing = await findRule(db)
  if (existing) await deleteRecurring(db, existing.id)
  await updateSettings(db, { monthlyIncomePence: undefined })
}
