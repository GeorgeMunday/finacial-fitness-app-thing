import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { InstallPrompt } from './components/InstallPrompt'
import { QuickLogSheet } from './components/QuickLogSheet'
import { StorageBanner } from './components/StorageBanner'
import { localDate } from './domain/dates'
import { postDueRecurring } from './domain/money'
import { loadSeed, seedAll } from './domain/seed'
import Food from './routes/Food'
import Money from './routes/Money'
import Progress from './routes/Progress'
import More from './routes/More'
import Today from './routes/Today'
import Train from './routes/Train'
import OnboardingFlow from './routes/onboarding/OnboardingFlow'
import Styleguide from './routes/dev/Styleguide'
import { useDb, usePersistent } from './state/DbProvider'
import { useSettings } from './state/SettingsProvider'

function Shell() {
  const { settings } = useSettings()
  const db = useDb()
  const persistent = usePersistent()
  const [quick, setQuick] = useState(false)

  useEffect(() => {
    const post = () => void postDueRecurring(db, localDate())
    post()
    const onVis = () => document.visibilityState === 'visible' && post()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [db])

  const wantsSeed = settings.optionalPillars.length > 0
  useEffect(() => {
    // Food and exercise data are only fetched once an optional pillar is on, so money-only users never download them.
    if (wantsSeed) void loadSeed().then((data) => seedAll(db, data)).catch((e) => console.warn('Seed failed', e))
  }, [db, wantsSeed])

  if (!settings.onboarded) return <Navigate to="/onboarding" replace />
  return (
    <>
      <StorageBanner persistent={persistent} />
      <InstallPrompt />
      <div className="mx-auto max-w-lg px-5 pb-32 pt-8">
        <Outlet />
      </div>
      <BottomNav onAdd={() => setQuick(true)} />
      <QuickLogSheet open={quick} onClose={() => setQuick(false)} />
    </>
  )
}

/** Old links to /more and /more/<screen> land on the same screen under /you. */
function MoreRedirect() {
  const rest = useParams()['*']
  const { search } = useLocation()
  return <Navigate to={`/you${rest ? `/${rest}` : ''}${search}`} replace />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding/*" element={<OnboardingFlow />} />
      {import.meta.env.DEV ? <Route path="/dev/styleguide" element={<Styleguide />} /> : null}
      <Route element={<Shell />}>
        <Route index element={<Today />} />
        <Route path="money/*" element={<Money />} />
        <Route path="food/*" element={<Food />} />
        <Route path="train/*" element={<Train />} />
        <Route path="progress" element={<Progress />} />
        <Route path="you/*" element={<More />} />
        <Route path="more/*" element={<MoreRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
