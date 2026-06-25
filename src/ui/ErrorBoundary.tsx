import React from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { C, HEADING, BODY } from './theme'
import { captureError } from '../monitoring'

interface ErrorBoundaryState {
  error: Error | null
}

// Catches render errors anywhere below it so a single bad render shows a branded
// recovery screen instead of a blank page. (Does not catch async/event-handler
// errors — those are handled with try/catch at the call site.)
export class ErrorBoundary extends React.Component<{ children?: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children?: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error boundary caught:', error, info)
    captureError(error, info) // -> Sentry when a DSN is configured; no-op otherwise
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.dark,
          color: C.white,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: BODY,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: HEADING, fontSize: 32, color: C.gold, letterSpacing: '0.04em' }}>SOMETHING WENT WRONG</div>
          <div style={{ fontSize: 13, color: C.muted, margin: '12px 0 20px', lineHeight: 1.5 }}>
            The app hit an unexpected error. Your saved data is safe — reloading usually fixes it.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: C.gold,
              color: C.dark,
              border: 'none',
              borderRadius: 2,
              padding: '12px 20px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {this.state.error?.message && (
            <div style={{ marginTop: 16, fontSize: 11, color: C.muted, fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {String(this.state.error.message)}
            </div>
          )}
        </div>
      </div>
    )
  }
}
