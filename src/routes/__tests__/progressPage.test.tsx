import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { freshDb, renderApp } from '../../../test/renderApp'
import Progress from '../Progress'
import Today from '../Today'
import Train from '../Train'
import Food from '../Food'

const app = () => (
  <Routes>
    <Route path="/" element={<Today />} />
    <Route path="/progress" element={<Progress />} />
    <Route path="/train/*" element={<Train />} />
    <Route path="/food/*" element={<Food />} />
  </Routes>
)

describe('progress screen', () => {
  it('opens from Today', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food', 'train'], healthConsent: true })
    const user = userEvent.setup()
    renderApp(app(), db, '/')
    await user.click(within(await screen.findByRole('region', { name: 'Your progress' })).getByRole('link', { name: 'Open' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Your progress' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Today' })).toBeInTheDocument()
  })
  it('is linked from Train and Food', async () => {
    const db = await freshDb({ onboarded: true, optionalPillars: ['food', 'train'], healthConsent: true })
    const t = renderApp(app(), db, '/train')
    expect(await screen.findByRole('link', { name: 'Your progress' })).toHaveAttribute('href', '/progress')
    t.unmount()
    renderApp(app(), db, '/food')
    expect(await screen.findByRole('link', { name: 'Your progress' })).toHaveAttribute('href', '/progress')
  })
  it('has one top-level heading', async () => {
    const db = await freshDb({ onboarded: true })
    renderApp(app(), db, '/progress')
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
