import type { CSSProperties, ReactNode } from 'react'
import { C, HEADING, cardStyle } from './theme'

export type TabKey = 'today' | 'calendar' | 'history' | 'deload' | 'trends' | 'setup' | 'data'

// Heights reserved on the scroll content for the two fixed bars (see Shell):
// the always-present bottom nav (raised to clear curved corners), and the top
// session bar (only while running). These exclude the iOS safe-area inset, which
// Shell adds separately via env(safe-area-inset-*).
export const NAV_H = 82
export const SESSION_BAR_H = 84

export function Spinner() {
  return <span className="spin" />
}

// Mirrors the pre-React `#splash` (index.html) via the shared `.gp-splash` styles,
// so the splash can stay on screen through the first data load on a logged-in reopen
// (the real splash fades out on React mount; this identical one holds until data is
// ready, then the app fades in). index.html owns the `.gp-splash` CSS.
export function SplashScreen() {
  return (
    <div className="gp-splash">
      <img className="mark" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
      <div className="name">THE GIANT PROGRAM</div>
      <div className="bar" />
    </div>
  )
}

// Connectivity / offline-sync strip. Hidden when online with nothing pending.
export function SyncStatus({ online, pending }: { online: boolean; pending: number }) {
  if (online && !pending) return null
  const offline = !online
  const msg = offline
    ? pending > 0
      ? `Offline — ${pending} change${pending > 1 ? 's' : ''} saved on this device, will sync when you reconnect`
      : 'Offline — showing your last saved data; changes will save on this device'
    : `Syncing ${pending} change${pending > 1 ? 's' : ''}…`
  return (
    <div
      style={{
        marginBottom: 14,
        padding: '8px 12px',
        borderRadius: 2,
        fontSize: 12,
        textAlign: 'center',
        color: offline ? C.blue : C.gold,
        background: offline ? 'rgba(126,184,247,0.10)' : 'rgba(201,168,76,0.10)',
        border: `1px solid ${offline ? C.blue : C.gold}`,
      }}
    >
      {msg}
    </div>
  )
}

// Slim fixed top progress bar — a global signal during data loads/reloads that
// doesn't blank the screen.
export function TopLoadingBar() {
  return <div className="gp-loadbar" aria-hidden="true" />
}

export function Center({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: 40, textAlign: 'center', color: C.muted, ...style }}>{children}</div>
}

export function Card({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...cardStyle, ...style }}>{children}</div>
}

export function BlockTitle({ children, tag }: { children?: ReactNode; tag?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontFamily: HEADING, fontSize: 20, letterSpacing: '0.08em', color: C.gold }}>{children}</div>
      {tag && (
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {tag}
        </span>
      )}
    </div>
  )
}

// Page chrome. The scroll content is padded clear of the two fixed bars: always
// the bottom nav, and — only while a session is running — the top session bar.
// `onSignOut` renders a header button for the transient (loading/error) screens;
// the main app moves sign-out into the menu drawer instead.
export function Shell({ children, onSignOut, sessionRunning }: { children?: ReactNode; onSignOut?: () => void; sessionRunning?: boolean }) {
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.white }}>
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          paddingLeft: 18,
          paddingRight: 18,
          paddingTop: sessionRunning ? `calc(${SESSION_BAR_H}px + env(safe-area-inset-top))` : 28,
          paddingBottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))`,
        }}
      >
        <header style={{ marginBottom: 22 }}>
          {/* Sign out sits in its own right-aligned row so it never overlaps the title. */}
          {onSignOut && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 26, marginBottom: 6 }}>
              <button
                onClick={onSignOut}
                title="Sign out"
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.muted}`,
                  color: C.muted,
                  borderRadius: 2,
                  fontSize: 11,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.28em', color: C.gold, textTransform: 'uppercase', marginBottom: 6 }}>
              Training Log
            </div>
            <h1 style={{ fontFamily: HEADING, fontSize: 46, lineHeight: 0.9, letterSpacing: '0.03em', margin: 0 }}>
              THE <span style={{ color: C.gold }}>GIANT</span> PROGRAM
            </h1>
            <div style={{ width: 50, height: 2, background: C.gold, margin: '12px auto' }} />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

// Navigation moved to the bottom icon nav + menu drawer (see nav.tsx).
