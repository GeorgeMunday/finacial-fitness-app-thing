import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import { ProfileHeader } from '../../components/profile/ProfileHeader'
import { getSettings } from '../../state/settings'

describe('profile header', () => {
  it('shows the default name and when tracking started', async () => {
    const db = await freshDb({ onboarded: true, onboardedAt: '2026-01-05T09:00:00.000Z' })
    renderApp(<ProfileHeader />, db)
    expect(await screen.findByRole('heading', { name: 'You' })).toBeInTheDocument()
    expect(screen.getByText('Tracking since 5 Jan 2026')).toBeInTheDocument()
  })
  it('uses the display name and chosen date format', async () => {
    const db = await freshDb({ onboarded: true, onboardedAt: '2026-01-05T09:00:00.000Z', displayName: 'Sam', dateFormat: 'numeric' })
    renderApp(<ProfileHeader />, db)
    expect(await screen.findByRole('heading', { name: 'Sam' })).toBeInTheDocument()
    expect(screen.getByText('Tracking since 05/01/2026')).toBeInTheDocument()
  })
  it('choosing an icon or colour saves at once, with Undo', async () => {
    const db = await freshDb({ onboarded: true })
    const user = userEvent.setup()
    renderApp(<ProfileHeader />, db)
    await user.click(await screen.findByRole('button', { name: 'Change avatar' }))
    const sheet = screen.getByRole('dialog', { name: 'Your avatar' })
    await user.click(within(sheet).getByRole('radio', { name: 'Dumbbell' }))
    await waitFor(async () => expect((await getSettings(db)).avatarIcon).toBe('dumbbell'))
    expect(await screen.findByText('Avatar updated')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('radio', { name: 'Marigold' }))
    await waitFor(async () => expect((await getSettings(db)).avatarColour).toBe('marigold'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await getSettings(db)).avatarColour).toBe('pond'))
    expect((await getSettings(db)).avatarIcon).toBe('dumbbell')
  })
  it('the avatar describes itself for screen readers', async () => {
    const db = await freshDb({ onboarded: true, avatarIcon: 'bike' })
    renderApp(<ProfileHeader />, db)
    expect(await screen.findByRole('button', { name: 'Change avatar' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Avatar: bike on pond' })).toBeInTheDocument()
  })
})
