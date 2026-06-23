import React from 'react'
import { createRoot } from 'react-dom/client'
import './ui/global.css'
import { App } from './ui/App.jsx'

createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null, React.createElement(App))
)
