import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BENCH, SQUAT } from '../../../test/programmeHelpers'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { listRoutines, routineExercises } from '../../domain/training'
import { seedAll } from '../../domain/seed'
import Train from '../Train'

const app = () => (
  <Routes>
    <Route path="/train/*" element={<Train />} />
  </Routes>
)
async function setup() {
  const db = await freshDb({ onboarded: true, optionalPillars: ['train'] })
  await seedAll(db, realSeed())
  return db
}

describe('copy and edit', () => {
  it('Copy and edit on a programme page makes routines and opens the first one for editing', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    await user.click(await screen.findByRole('button', { name: 'Copy and edit' }))
    expect(await screen.findByRole('heading', { name: 'Edit routine' })).toBeInTheDocument()
    expect(screen.getByLabelText('Routine name')).toHaveValue('Push / Pull / Legs – Push day')
    expect(screen.getByText(BENCH)).toBeInTheDocument()
    expect(await listRoutines(db)).toHaveLength(3)
  })
  it('editing sets and reps and saving updates the routine', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/full-body-beginner')
    await user.click(await screen.findByRole('button', { name: 'Copy and edit' }))
    await screen.findByRole('heading', { name: 'Edit routine' })
    const sets = screen.getAllByLabelText('Sets')[0]
    fireEvent.change(sets, { target: { value: '5' } })
    await user.click(screen.getByRole('button', { name: 'Save routine' }))
    await waitFor(async () => {
      const r = (await listRoutines(db)).find((x) => x.name.endsWith('Workout A'))!
      expect((await routineExercises(db, r.id))[0]).toMatchObject({ name: SQUAT, targetSets: 5 })
    })
    expect(await listRoutines(db)).toHaveLength(2)
  })
  it('Delete routine offers Undo', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/gzclp')
    await user.click(await screen.findByRole('button', { name: 'Copy and edit' }))
    await screen.findByRole('heading', { name: 'Edit routine' })
    await user.click(screen.getByRole('button', { name: 'Delete routine' }))
    expect(await screen.findByText('Routine deleted')).toBeInTheDocument()
    expect(await listRoutines(db)).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await listRoutines(db)).toHaveLength(4))
  })
  it('routines on the Train screen open for editing', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/gzclp')
    await user.click(await screen.findByRole('button', { name: 'Copy and edit' }))
    await screen.findByRole('heading', { name: 'Edit routine' })
    await user.click(screen.getByRole('button', { name: 'Save routine' }))
    await user.click(await screen.findByRole('link', { name: 'GZCLP – Day 2' }))
    expect(await screen.findByLabelText('Routine name')).toHaveValue('GZCLP – Day 2')
  })
  it('a new routine still works', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/routine/new')
    expect(await screen.findByRole('heading', { name: 'New routine' })).toBeInTheDocument()
  })
})
