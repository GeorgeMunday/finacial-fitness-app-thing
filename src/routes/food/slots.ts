import type { Slot } from '../../db/types'
import { localDate } from '../../domain/dates'

export const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' }, { slot: 'lunch', label: 'Lunch' }, { slot: 'dinner', label: 'Dinner' }, { slot: 'snack', label: 'Snacks' },
]

export function slotFor(d: Date): Slot {
  const h = d.getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** The day a food screen logs to: `?date=` when it's a real day that isn't in the future, otherwise today. */
export function logDateParam(params: URLSearchParams): string {
  const d = params.get('date')
  return d && ISO_DAY.test(d) && !Number.isNaN(Date.parse(d)) && d <= localDate() ? d : localDate()
}

/** Adds `date=` to a food path's query unless the day is today, so links from a past day keep logging to it. */
export function withDate(path: string, date: string, query: Record<string, string> = {}): string {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== ''))
  if (date !== localDate()) q.set('date', date)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** "Thursday 1 October" */
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
