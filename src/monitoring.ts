// Error monitoring (Sentry). Inert until VITE_SENTRY_DSN is set, and the SDK is
// lazy-loaded so it adds nothing to the main bundle while monitoring is off.
// Once a DSN is configured, Sentry's default integrations also capture unhandled
// errors and promise rejections automatically; the ErrorBoundary forwards React
// render crashes via captureError().
type SentryModule = typeof import('@sentry/react')

let _sentry: SentryModule | null = null
const dsn = import.meta.env?.VITE_SENTRY_DSN

export async function initMonitoring(): Promise<void> {
  if (!dsn || _sentry) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn,
      tracesSampleRate: 0, // errors only — no performance tracing
      environment: import.meta.env?.MODE || 'production',
    })
    _sentry = Sentry
  } catch {
    // never let monitoring setup break the app
  }
}

export function captureError(error: unknown, info?: unknown): void {
  if (_sentry) _sentry.captureException(error, info ? { extra: info as Record<string, unknown> } : undefined)
}
