import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { realSeed } from '../../../test/realSeed'
import { freshDb, renderApp } from '../../../test/renderApp'
import { BENCH, MON, begin } from '../../../test/programmeHelpers'
import { activeProgramme } from '../../domain/programmes/catalog'
import { localDate } from '../../domain/dates'
import { nextWorkout, startProgrammeWorkout } from '../../domain/programmes/plan'
import { applyProgression } from '../../domain/programmes/progression'
import { seedAll } from '../../domain/seed'
import { finishWorkout } from '../../domain/training'
import { toKg } from '../../domain/units'
import Train from '../Train'

/** The chooser row whose title is exactly this name. */
const row = (name: string) => screen.getAllByRole('link').find((l) => l.querySelector('span')?.textContent === name)!

const app = () => (
  <Routes>
    <Route path="/train/*" element={<Train />} />
  </Routes>
)

async function setup(unit: 'kg' | 'lb' = 'kg') {
  const db = await freshDb({ onboarded: true, optionalPillars: ['train'], weightUnit: unit })
  await seedAll(db, realSeed())
  return db
}

describe('choose a programme', () => {
  it('lists five programmes with days a week and level, credits the authors and shows no web addresses', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/programmes')
    await screen.findByRole('link', { name: /GZCLP/ })
    for (const name of ['Push / Pull / Legs', 'Upper / Lower', 'Full body beginner', 'GZCLP', '5/3/1 for Beginners']) expect(row(name)).toBeTruthy()
    const ppl = screen.getByRole('link', { name: /Push \/ Pull \/ Legs/ })
    expect(ppl).toHaveTextContent('3 or 6 days a week')
    expect(ppl).toHaveTextContent('Beginner')
    expect(ppl).toHaveTextContent('Push day · Pull day · Legs day')
    expect(row('Upper / Lower')).toHaveTextContent('4 days a week')
    expect(row('Upper / Lower')).toHaveTextContent('Intermediate')
    for (const author of ['Brandon Campbell', 'Cody Lefever', 'Jim Wendler']) expect(screen.getAllByText(new RegExp(author)).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/https?:|www\./i)
  })
  it('lists the newer programmes too', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/programmes')
    await screen.findByRole('link', { name: /GZCLP/ })
    for (const name of ['Upper / Lower for beginners', 'Two-day full body', 'Dumbbell full body', 'Bodyweight at home']) expect(row(name)).toBeTruthy()
  })
  it('a bodyweight programme starts without asking for weights', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/bodyweight-home')
    expect(await screen.findByText(/No weights needed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I don't know, start light" })).toBeNull()
    expect(screen.getAllByText('Pushups 3× as many reps as you can')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Start this programme' }))
    expect(await screen.findByText('Next: Workout A')).toBeInTheDocument()
  })
  it('a programme page previews every day', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/programmes/ppl')
    expect(await screen.findByRole('heading', { name: 'Push / Pull / Legs' })).toBeInTheDocument()
    for (const d of ['Push day', 'Pull day', 'Legs day']) expect(screen.getByRole('heading', { name: d })).toBeInTheDocument()
    expect(screen.getByText(`${BENCH} 4×6–8`)).toBeInTheDocument()
    expect(screen.getByText('Standing Calf Raises 4×12–15')).toBeInTheDocument()
  })
  it('"I don\'t know" fills light empty-bar defaults, and Start creates the programme and shows Next', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    const start = await screen.findByRole('button', { name: 'Start this programme' })
    expect(start).toBeDisabled()
    await user.click(screen.getByRole('button', { name: "I don't know, start light" }))
    expect(screen.getByLabelText(BENCH)).toHaveValue('20')
    expect(start).toBeEnabled()
    await user.click(start)
    expect(await screen.findByText('Next: Push day')).toBeInTheDocument()
    expect((await activeProgramme(db))!.programme.key).toBe('ppl')
  })
  it('saves the weights typed in', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    await user.click(await screen.findByRole('button', { name: "I don't know, start light" }))
    const bench = screen.getByLabelText(BENCH)
    await user.clear(bench)
    await user.type(bench, '62.5')
    await user.click(screen.getByRole('button', { name: 'Start this programme' }))
    await waitFor(async () => expect((await activeProgramme(db))!.progress.lifts[`${BENCH}|main`].weightKg).toBe(62.5))
  })
  it('5/3/1 asks for training maxes and explains them', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/programmes/531-beginners')
    expect(await screen.findByText(/90% of your one-rep max/)).toBeInTheDocument()
    expect(screen.getByLabelText('Barbell Squat training max')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })
  it('Push / Pull / Legs offers 3 or 6 days a week and saves the choice', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    await user.click(await screen.findByRole('button', { name: '6 days a week' }))
    await user.click(screen.getByRole('button', { name: "I don't know, start light" }))
    await user.click(screen.getByRole('button', { name: 'Start this programme' }))
    await waitFor(async () => expect((await activeProgramme(db))!.progress.daysPerWeek).toBe(6))
  })
  it('programmes with one option do not ask about days', async () => {
    const db = await setup()
    renderApp(app(), db, '/train/programmes/gzclp')
    await screen.findByRole('heading', { name: 'GZCLP' })
    expect(screen.queryByRole('button', { name: /days a week/ })).toBeNull()
  })
  it('pound users enter and see pounds', async () => {
    const db = await setup('lb')
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    await user.click(await screen.findByRole('button', { name: "I don't know, start light" }))
    const bench = screen.getByLabelText(BENCH)
    expect(bench).toHaveValue('45') // 20 kg bar
    await user.clear(bench)
    await user.type(bench, '135')
    await user.click(screen.getByRole('button', { name: 'Start this programme' }))
    await waitFor(async () => expect((await activeProgramme(db))!.progress.lifts[`${BENCH}|main`].weightKg).toBeCloseTo(toKg(135, 'lb'), 6))
  })
  it('explains a bad weight and keeps Start disabled', async () => {
    const db = await setup()
    const user = userEvent.setup()
    renderApp(app(), db, '/train/programmes/ppl')
    await user.click(await screen.findByRole('button', { name: "I don't know, start light" }))
    const bench = screen.getByLabelText(BENCH)
    await user.clear(bench)
    await user.type(bench, 'heavy')
    await user.tab()
    expect(await screen.findByText(/Use numbers like 60 or 62\.5/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start this programme' })).toBeDisabled()
  })
})

describe('Train home', () => {
  it('offers Choose a programme when none is active', async () => {
    const db = await setup()
    renderApp(app(), db, '/train')
    expect(await screen.findByRole('link', { name: /Choose a programme/ })).toBeInTheDocument()
    expect(screen.queryByText(/^Next:/)).toBeNull()
  })
  it('shows the next workout and starts it', async () => {
    const db = await setup()
    await begin(db, 'ppl')
    const user = userEvent.setup()
    renderApp(app(), db, '/train')
    expect(await screen.findByText('Next: Push day')).toBeInTheDocument()
    expect(screen.getByText('Day 1 of 3 · 0 of 3 done this week')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start Push day' }))
    await waitFor(async () => expect(await db.all('SELECT programme_day_id FROM workouts WHERE programme_day_id IS NOT NULL')).toHaveLength(1))
  })
  it('after finishing the day the card moves on to Pull day', async () => {
    const db = await setup()
    await begin(db, 'ppl')
    const n = (await nextWorkout(db, MON))!
    const w = await startProgrammeWorkout(db, n.dayId, localDate())
    await finishWorkout(db, w)
    await applyProgression(db, w)
    renderApp(app(), db, '/train')
    expect(await screen.findByText('Next: Pull day')).toBeInTheDocument()
    expect(screen.getByText('Day 2 of 3 · 1 of 3 done this week')).toBeInTheDocument()
    expect(within(document.body).getByText(/Done today/)).toBeInTheDocument()
  })
  it('says Continue when the day is already open, and shows the week for 5/3/1', async () => {
    const db = await setup()
    await begin(db, '531-beginners')
    const n = (await nextWorkout(db, MON))!
    await startProgrammeWorkout(db, n.dayId, localDate())
    renderApp(app(), db, '/train')
    expect(await screen.findByRole('button', { name: 'Continue Day 1' })).toBeInTheDocument()
    expect(screen.getByText('Day 1 of 3 · 0 of 3 done this week · Week 1 of 3')).toBeInTheDocument()
  })
})
