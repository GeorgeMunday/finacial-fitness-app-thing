import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { BottomNav } from '../BottomNav'

const render = async (pillars: ('food' | 'train')[]) => {
  const db = await freshDb({ onboarded: true, optionalPillars: pillars, healthConsent: pillars.includes('food') })
  renderApp(<BottomNav onAdd={() => {}} />, db)
  return screen.findByRole('navigation', { name: 'Main' })
}
const links = (nav: HTMLElement) => within(nav).getAllByRole('link')
/** The bar's controls in reading order, so we can see where Add sits. */
const controls = (nav: HTMLElement) =>
  [...links(nav), within(nav).getByRole('button', { name: 'Add' })]
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((el) => (el.tagName === 'BUTTON' ? 'Add' : el.textContent))

describe('bottom nav', () => {
  it('is Today, Money, Add, Food, Train with both pillars on, and no profile tab', async () => {
    const nav = await render(['food', 'train'])
    expect(controls(nav)).toEqual(['Today', 'Money', 'Add', 'Food', 'Train'])
    expect(links(nav)).toHaveLength(4)
    expect(within(nav).queryByRole('link', { name: /more|you|profile/i })).toBeNull()
  })
  it('keeps Add in the middle when Train is off', async () => {
    const nav = await render(['food'])
    expect(controls(nav)).toEqual(['Today', 'Money', 'Add', 'Food'])
  })
  it('keeps Add in the middle when Food is off', async () => {
    const nav = await render(['train'])
    expect(controls(nav)).toEqual(['Today', 'Money', 'Add', 'Train'])
  })
  it('puts Add between the two remaining items when both are off', async () => {
    const nav = await render([])
    expect(controls(nav)).toEqual(['Today', 'Add', 'Money'])
  })
})
