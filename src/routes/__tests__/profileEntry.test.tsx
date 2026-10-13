import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import AppRoutes from '../../AppRoutes'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname}</p>
}
const app = () => (
  <>
    <AppRoutes />
    <Where />
  </>
)
const at = () => screen.getByTestId('where').textContent
const avatar = () => screen.findByRole('button', { name: /^Your profile and settings/ })

describe('profile entry on Today', () => {
  it('shows the avatar button, named for screen readers, with no dot when nothing needs attention', async () => {
    const db = await freshDb({ onboarded: true, lastBackupAt: new Date().toISOString() })
    renderApp(app(), db, '/')
    const b = await avatar()
    expect(b).toHaveAccessibleName('Your profile and settings')
    expect(b.querySelector('[data-attention-dot]')).toBeNull()
  })
  it('tapping it opens the profile, and Back returns to Today with the nav still visible', async () => {
    const db = await freshDb({ onboarded: true, lastBackupAt: new Date().toISOString() })
    const user = userEvent.setup()
    renderApp(app(), db, '/')
    await user.click(await avatar())
    expect(await screen.findByRole('heading', { name: 'You' })).toBeInTheDocument()
    expect(at()).toBe('/you')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to Today' }))
    await waitFor(() => expect(at()).toBe('/'))
    expect(await avatar()).toBeInTheDocument()
  })
  it('shows a dot and says why when a backup is due', async () => {
    const db = await freshDb({ onboarded: true, onboardedAt: '2026-01-01T00:00:00.000Z', lastBackupAt: '2026-01-02T00:00:00.000Z' })
    renderApp(app(), db, '/')
    const b = await avatar()
    expect(b).toHaveAccessibleName('Your profile and settings, backup due')
    expect(b.querySelector('[data-attention-dot]')).not.toBeNull()
  })
  it('shows a dot and says why when storage is not persistent', async () => {
    const db = await freshDb({ onboarded: true, lastBackupAt: new Date().toISOString() })
    renderApp(app(), db, '/', { persistent: false })
    const b = await avatar()
    expect(b).toHaveAccessibleName("Your profile and settings, data can't be saved in this browser")
    expect(b.querySelector('[data-attention-dot]')).not.toBeNull()
  })
  it('names both reasons when both apply', async () => {
    const db = await freshDb({ onboarded: true, onboardedAt: '2026-01-01T00:00:00.000Z' })
    renderApp(app(), db, '/', { persistent: false })
    expect(await avatar()).toHaveAccessibleName("Your profile and settings, backup due and data can't be saved in this browser")
  })
  it('wears the chosen avatar', async () => {
    const db = await freshDb({ onboarded: true, avatarIcon: 'bike', avatarColour: 'marigold', lastBackupAt: new Date().toISOString() })
    renderApp(app(), db, '/')
    const b = await avatar()
    const circle = b.querySelector('span[style]') as HTMLElement
    expect(circle.style.width).toBe('40px')
    expect(circle.style.height).toBe('40px')
    expect(circle.style.background).not.toBe('')
  })
})

describe('profile routes', () => {
  it('/you and /more both work, and deep links to settings screens keep working', async () => {
    const db = await freshDb({ onboarded: true })
    renderApp(app(), db, '/more')
    expect(await screen.findByRole('heading', { name: 'You' })).toBeInTheDocument()
    expect(at()).toBe('/you')
  })
  it.each([
    ['/more/profile', '/you/profile', 'Profile'],
    ['/more/data', '/you/data', 'Your data'],
    ['/you/dates', '/you/dates', 'Dates'],
  ])('%s opens %s', async (from, to, title) => {
    const db = await freshDb({ onboarded: true })
    renderApp(app(), db, from)
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(at()).toBe(to)
  })
  it('settings screens go back to the profile', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/you/dates')
    await user.click(await screen.findByRole('link', { name: 'Back to profile' }))
    expect(await screen.findByRole('heading', { name: 'You' })).toBeInTheDocument()
    expect(at()).toBe('/you')
  })
})
