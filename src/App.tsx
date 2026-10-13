import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { InstallPrompt } from './components/InstallPrompt'
import { QuickLogSheet } from './components/QuickLogSheet'
import { StorageBanner } from './components/StorageBanner'
import { ToastProvider } from './components/ui/Toast'
import { localDate } from './domain/dates'
import { postDueRecurring } from './domain/money'
import { loadSeed, seedIfEmpty } from './domain/seed'
import Food from './routes/Food'
import Money from './routes/Money'
import More from './routes/More'
import Today from './routes/Today'
import Train from './routes/Train'
import OnboardingFlow from './routes/onboarding/OnboardingFlow'
import Styleguide from './routes/dev/Styleguide'
import { DbProvider, useDb, useStorageStatus } from './state/DbProvider'
import { SettingsProvider, useSettings } from './state/SettingsProvider'

function Shell() {
  const { settings } = useSettings()
  const db = useDb()
  const { persistent } = useStorageStatus()
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
    if (wantsSeed) void loadSeed().then((data) => seedIfEmpty(db, data)).catch((e) => console.warn('Seed failed', e))
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

function Theme() {
  const { settings } = useSettings()
  useEffect(() => {
    if (settings.theme) document.documentElement.dataset.theme = settings.theme
    else delete document.documentElement.dataset.theme
  }, [settings.theme])
  return null
}

export default function App() {
  return (
    <DbProvider>
      <SettingsProvider>
        <ToastProvider>
          <Theme />
          <BrowserRouter>
            <Routes>
              <Route path="/onboarding/*" element={<OnboardingFlow />} />
              {import.meta.env.DEV ? <Route path="/dev/styleguide" element={<Styleguide />} /> : null}
              <Route element={<Shell />}>
                <Route index element={<Today />} />
                <Route path="money/*" element={<Money />} />
                <Route path="food/*" element={<Food />} />
                <Route path="train/*" element={<Train />} />
                <Route path="more" element={<More />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </SettingsProvider>
    </DbProvider>
  )
}
