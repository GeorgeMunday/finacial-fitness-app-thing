import type { SqlExecutor } from '../db/executor'
import { newId, nowIso } from '../db/ids'
import type { CategoryKind, Transaction, TxKind } from '../db/types'
import { addDays, addMonths, localDate, monthRange, weekStart } from './dates'

const MAX_PENCE = 100_000_000 // £1,000,000

/** Parses UK-style money input ("4.5", "£4.50", "4,50", "1,250.00") to pence, or null. */
export function parsePence(input: string): number | null {
  let s = input.replace(/£/g, '').replace(/\s+/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',')) {
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '')
    else return null
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  const pence = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
  if (pence <= 0 || pence > MAX_PENCE) return null
  return pence
}

export function formatPence(p: number): string {
  const abs = Math.abs(p)
  const pounds = Math.floor(abs / 100).toLocaleString('en-GB')
  const text = `£${pounds}.${String(abs % 100).padStart(2, '0')}`
  return p < 0 ? `−${text}` : text
}

type TxRow = {
  id: string; created_at: string; updated_at: string; deleted_at: string | null; kind: TxKind; log_date: string
  amount_pence: number; currency: string; merchant: string | null; category_id: string; note: string | null; source: string | null
}
const toTx = (r: TxRow): Transaction => ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at, kind: r.kind,
  logDate: r.log_date, amountPence: r.amount_pence, currency: r.currency, merchant: r.merchant,
  categoryId: r.category_id, note: r.note, source: r.source,
})

export type NewTransaction = {
  kind: TxKind; amountPence: number; categoryId: string; logDate?: string; merchant?: string; note?: string; source?: string
}

export async function addTransaction(db: SqlExecutor, t: NewTransaction): Promise<string> {
  if (!Number.isInteger(t.amountPence) || t.amountPence <= 0) throw new Error('Amount must be a positive whole number of pence')
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO transactions (id, created_at, updated_at, kind, log_date, amount_pence, merchant, category_id, note, source)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, now, now, t.kind, t.logDate ?? localDate(), t.amountPence, t.merchant ?? null, t.categoryId, t.note ?? null, t.source ?? null],
  )
  return id
}

export const addExpense = (db: SqlExecutor, e: Omit<NewTransaction, 'kind'>) => addTransaction(db, { ...e, kind: 'expense' })

export function addIncome(db: SqlExecutor, i: { amountPence: number; logDate?: string; note?: string }) {
  return addTransaction(db, { ...i, kind: 'income', categoryId: 'cat-income' })
}

export async function deleteTransaction(db: SqlExecutor, id: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function restoreTransaction(db: SqlExecutor, id: string): Promise<void> {
  await db.run('UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id])
}

export async function listTransactions(db: SqlExecutor, from: string, to: string): Promise<Transaction[]> {
  const rows = await db.all<TxRow>(
    `SELECT * FROM transactions WHERE deleted_at IS NULL AND log_date BETWEEN ? AND ?
     ORDER BY log_date DESC, created_at DESC, rowid DESC`,
    [from, to],
  )
  return rows.map(toTx)
}

export async function setBudget(db: SqlExecutor, categoryId: string, period: 'week' | 'month', limitPence: number): Promise<void> {
  const now = nowIso()
  const existing = await db.all<{ id: string }>(
    'SELECT id FROM budgets WHERE category_id = ? AND period = ? AND deleted_at IS NULL',
    [categoryId, period],
  )
  if (existing[0]) {
    await db.run('UPDATE budgets SET limit_pence = ?, updated_at = ? WHERE id = ?', [limitPence, now, existing[0].id])
  } else {
    await db.run('INSERT INTO budgets (id, created_at, updated_at, category_id, period, limit_pence) VALUES (?,?,?,?,?,?)', [
      newId(), now, now, categoryId, period, limitPence,
    ])
  }
}

function periodWindow(period: 'week' | 'month', onDate: string): { from: string; to: string } {
  if (period === 'week') {
    const from = weekStart(onDate)
    return { from, to: addDays(from, 6) }
  }
  return monthRange(onDate)
}

/** Budget remaining: limits and spend both cover the budgeted categories only. Expenses only. */
export async function leftToSpend(db: SqlExecutor, period: 'week' | 'month', onDate: string) {
  const { from, to } = periodWindow(period, onDate)
  const [lim] = await db.all<{ total: number | null }>(
    'SELECT SUM(limit_pence) AS total FROM budgets WHERE period = ? AND deleted_at IS NULL',
    [period],
  )
  const [sp] = await db.all<{ total: number | null }>(
    `SELECT SUM(t.amount_pence) AS total FROM transactions t
     WHERE t.deleted_at IS NULL AND t.kind = 'expense' AND t.log_date BETWEEN ? AND ?
       AND t.category_id IN (SELECT category_id FROM budgets WHERE period = ? AND deleted_at IS NULL)`,
    [from, to, period],
  )
  const limitPence = lim?.total ?? 0
  const spentPence = sp?.total ?? 0
  return { limitPence, spentPence, leftPence: limitPence - spentPence }
}

export async function spendByCategory(db: SqlExecutor, from: string, to: string) {
  const rows = await db.all<{ category_id: string; name: string; kind: CategoryKind; spent: number }>(
    `SELECT c.id AS category_id, c.name, c.kind, SUM(t.amount_pence) AS spent
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.deleted_at IS NULL AND t.kind = 'expense' AND t.log_date BETWEEN ? AND ?
     GROUP BY c.id ORDER BY spent DESC`,
    [from, to],
  )
  return rows.map((r) => ({ categoryId: r.category_id, name: r.name, kind: r.kind, spentPence: r.spent }))
}

const ALL_KINDS: CategoryKind[] = [
  'groceries', 'eating_out', 'takeaway', 'fitness', 'supplements', 'bills', 'transport', 'shopping', 'income', 'other',
]

export async function spendByKind(db: SqlExecutor, from: string, to: string): Promise<Record<CategoryKind, number>> {
  const out = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<CategoryKind, number>
  for (const r of await spendByCategory(db, from, to)) out[r.kind] += r.spentPence
  return out
}

export async function recentCategories(db: SqlExecutor, limit = 6): Promise<{ id: string; name: string }[]> {
  return db.all<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id AND t.kind = 'expense'
     WHERE c.deleted_at IS NULL AND c.kind <> 'income'
     GROUP BY c.id ORDER BY MAX(t.rowid) DESC, c.rowid ASC LIMIT ?`,
    [limit],
  )
}

export type Cadence = 'weekly' | 'monthly' | 'yearly'

export async function addRecurringRule(
  db: SqlExecutor,
  r: { kind: TxKind; name: string; amountPence: number; categoryId: string; cadence: Cadence; nextDate: string },
): Promise<string> {
  const id = newId()
  const now = nowIso()
  await db.run(
    `INSERT INTO recurring_rules (id, created_at, updated_at, kind, name, amount_pence, category_id, cadence, next_date)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, now, now, r.kind, r.name, r.amountPence, r.categoryId, r.cadence, r.nextDate],
  )
  return id
}

const advance = (date: string, c: Cadence) =>
  c === 'weekly' ? addDays(date, 7) : c === 'monthly' ? addMonths(date, 1) : addMonths(date, 12)

/** Posts a transaction for every occurrence due on or before today. Returns how many were posted. */
export async function postDueRecurring(db: SqlExecutor, today: string): Promise<number> {
  let count = 0
  await db.transaction(async (tx) => {
    // Read inside the transaction so a concurrent run (app start + tab refocus) sees the advanced dates.
    const rules = await tx.all<{
      id: string; kind: TxKind; name: string; amount_pence: number; category_id: string; cadence: Cadence; next_date: string
    }>('SELECT * FROM recurring_rules WHERE deleted_at IS NULL AND next_date <= ?', [today])
    for (const r of rules) {
      let next = r.next_date
      while (next <= today) {
        await addTransaction(tx, {
          kind: r.kind, amountPence: r.amount_pence, categoryId: r.category_id, logDate: next, merchant: r.name, source: 'recurring',
        })
        next = advance(next, r.cadence)
        count += 1
      }
      await tx.run('UPDATE recurring_rules SET next_date = ?, updated_at = ? WHERE id = ?', [next, nowIso(), r.id])
    }
  })
  return count
}

export async function listBudgets(db: SqlExecutor): Promise<{ categoryId: string; period: 'week' | 'month'; limitPence: number }[]> {
  const rows = await db.all<{ category_id: string; period: 'week' | 'month'; limit_pence: number }>(
    'SELECT category_id, period, limit_pence FROM budgets WHERE deleted_at IS NULL',
  )
  return rows.map((r) => ({ categoryId: r.category_id, period: r.period, limitPence: r.limit_pence }))
}

export type RecurringRule = { id: string; kind: TxKind; name: string; amountPence: number; categoryId: string; cadence: Cadence; nextDate: string }

export async function listRecurring(db: SqlExecutor): Promise<RecurringRule[]> {
  const rows = await db.all<{ id: string; kind: TxKind; name: string; amount_pence: number; category_id: string; cadence: Cadence; next_date: string }>(
    'SELECT * FROM recurring_rules WHERE deleted_at IS NULL ORDER BY next_date, rowid',
  )
  return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, amountPence: r.amount_pence, categoryId: r.category_id, cadence: r.cadence, nextDate: r.next_date }))
}

export async function deleteRecurring(db: SqlExecutor, id: string): Promise<void> {
  const now = nowIso()
  await db.run('UPDATE recurring_rules SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
}

export async function listCategories(db: SqlExecutor): Promise<{ id: string; name: string; kind: CategoryKind }[]> {
  return db.all('SELECT id, name, kind FROM categories WHERE deleted_at IS NULL ORDER BY rowid')
}
