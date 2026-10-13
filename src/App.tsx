import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './AppRoutes'
import { ToastProvider } from './components/ui/Toast'
import { DbProvider } from './state/DbProvider'
import { SettingsProvider, useSettings } from './state/SettingsProvider'

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
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </SettingsProvider>
    </DbProvider>
  )
}
