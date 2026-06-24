import React from 'react'
import { createRoot } from 'react-dom/client'
import './ui/global.css'
import { App } from './ui/App.jsx'
import { ErrorBoundary } from './ui/ErrorBoundary.jsx'
import { initMonitoring } from './monitoring.js'

initMonitoring() // no-op unless VITE_SENTRY_DSN is set

createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(ErrorBoundary, null, React.createElement(App)))
)

// Fade out the instant splash now that React has mounted.
const splash = document.getElementById('splash')
if (splash) {
  requestAnimationFrame(() => {
    splash.style.opacity = '0'
  })
  setTimeout(() => splash.remove(), 350)
}
