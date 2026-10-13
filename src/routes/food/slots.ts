import type { Slot } from '../../db/types'

export const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' }, { slot: 'lunch', label: 'Lunch' }, { slot: 'dinner', label: 'Dinner' }, { slot: 'snack', label: 'Snacks' },
]

export function slotFor(d: Date): Slot {
  const h = d.getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}
