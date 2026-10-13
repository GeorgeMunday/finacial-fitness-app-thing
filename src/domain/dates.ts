const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

const parse = (logDate: string): { y: number; m: number; d: number } => {
  const [y, m, d] = logDate.split('-').map(Number)
  return { y, m, d }
}

/** Device-local date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const toUtc = (logDate: string) => {
  const { y, m, d } = parse(logDate)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number) => {
  const dt = new Date(ms)
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function addDays(logDate: string, n: number): string {
  return fromUtc(toUtc(logDate) + n * 86_400_000)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Adds calendar months, clamping the day to the target month's length. */
export function addMonths(logDate: string, n: number): string {
  const { y, m, d } = parse(logDate)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** Monday of the week containing logDate. */
export function weekStart(logDate: string): string {
  const dow = new Date(toUtc(logDate)).getUTCDay() // 0 = Sunday
  return addDays(logDate, -((dow + 6) % 7))
}

export function monthRange(logDate: string): { from: string; to: string } {
  const { y, m } = parse(logDate)
  return { from: fmt(y, m, 1), to: fmt(y, m, daysInMonth(y, m)) }
}

export function yearRange(logDate: string): { from: string; to: string } {
  const { y } = parse(logDate)
  return { from: fmt(y, 1, 1), to: fmt(y, 12, 31) }
}

/** Adds calendar months and puts the day back to `anchorDay`, clamped to the target month's length. */
export function addMonthsAnchored(logDate: string, n: number, anchorDay: number): string {
  const moved = addMonths(`${logDate.slice(0, 8)}01`, n)
  const { y, m } = parse(moved)
  return fmt(y, m, Math.min(anchorDay, daysInMonth(y, m)))
}

/** The next date on or after `today` that falls on `day` of the month (clamped to short months). */
export function nextMonthlyOccurrence(today: string, day: number): string {
  const thisMonth = addMonthsAnchored(today, 0, day)
  return thisMonth >= today ? thisMonth : addMonthsAnchored(today, 1, day)
}

export type DateFormat = 'long' | 'numeric'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Oct 2026" (long) or "12/10/2026" (numeric, UK day-first). */
export function formatDate(logDate: string, format: DateFormat): string {
  const { y, m, d } = parse(logDate)
  return format === 'numeric' ? `${pad(d)}/${pad(m)}/${y}` : `${d} ${MONTHS[m - 1]} ${y}`
}

/** "Oct" for "2026-10". */
export function monthLabel(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1]
}
