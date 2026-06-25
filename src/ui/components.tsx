import type { CSSProperties, ReactNode } from 'react'
import { C, HEADING, cardStyle } from './theme'

export type TabKey = 'today' | 'calendar' | 'history' | 'deload' | 'setup'

export function Spinner() {
  return <span className="spin" />
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

export function Shell({ children, onSignOut }: { children?: ReactNode; onSignOut?: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.white }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 18px 80px' }}>
        <header style={{ marginBottom: 22 }}>
          {/* Sign out sits in its own right-aligned row so it never overlaps the title. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 26, marginBottom: 6 }}>
            {onSignOut && (
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
            )}
          </div>
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

const TABS: [TabKey, string][] = [
  ['today', 'Today'],
  ['calendar', 'Calendar'],
  ['history', 'History'],
  ['deload', 'Deload'],
  ['setup', 'Setup'],
]

export function Tabs({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  // Sticky: the nav pins to the top of the viewport on scroll so it's always
  // reachable. The wrapper carries the page background so content scrolls cleanly
  // underneath it.
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: C.dark,
        paddingTop: 10,
        paddingBottom: 10,
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden' }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              background: tab === k ? C.gold : 'transparent',
              border: 'none',
              color: tab === k ? C.dark : C.muted,
              fontSize: 12,
              fontWeight: 600,
              padding: '12px 4px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
