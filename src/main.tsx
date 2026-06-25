import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/global.css'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { initMonitoring } from './monitoring'

initMonitoring() // no-op unless VITE_SENTRY_DSN is set

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}

// Fade out the instant splash now that React has mounted.
const splash = document.getElementById('splash')
if (splash) {
  requestAnimationFrame(() => {
    splash.style.opacity = '0'
  })
  setTimeout(() => splash.remove(), 350)
}
