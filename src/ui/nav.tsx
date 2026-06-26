import { useRef } from 'react'
import type { ReactNode } from 'react'
import { C, HEADING } from './theme'
import { useFocusTrap } from './useFocusTrap'
import type { TabKey } from './components'

// --- inline line icons (stroke = currentColor; the parent sets the colour) ---
const ICONS: Record<string, ReactNode> = {
  // dumbbell (two plates each side + bar) — the training session
  today: (
    <>
      <line x1="5" y1="8" x2="5" y2="16" />
      <line x1="8" y1="9.5" x2="8" y2="14.5" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="16" y1="9.5" x2="16" y2="14.5" />
      <line x1="19" y1="8" x2="19" y2="16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  menu: (
    <>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </>
  ),
  deload: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="6 13 12 19 18 13" />
    </>
  ),
  trends: (
    <>
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </>
  ),
  setup: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="18" r="2" />
    </>
  ),
  signout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
}

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// --- bottom navigation (fixed) ----------------------------------------------
const PRIMARY: { key: TabKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'trends', label: 'Trends', icon: 'trends' },
]

function navItemStyle(active: boolean) {
  return {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 3,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: active ? C.gold : C.muted,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    padding: '10px 0',
  }
}

export function BottomNav({ tab, setTab, onOpenMenu, menuOpen }: { tab: TabKey; setTab: (t: TabKey) => void; onOpenMenu: () => void; menuOpen: boolean }) {
  // Menu reads as active while a drawer destination (deload/setup) is showing, or
  // while the drawer is open.
  const menuActive = menuOpen || tab === 'deload' || tab === 'history' || tab === 'setup'
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        background: C.navy,
        borderTop: `1px solid ${C.border}`,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.30)',
        paddingTop: 8,
        // Lift the tap rows clear of the curved bottom corners (iPhone 16 etc.):
        // extra space on top of the home-indicator safe-area inset.
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
      }}
    >
      {PRIMARY.map(({ key, label, icon }) => {
        const active = tab === key
        return (
          <button key={key} onClick={() => setTab(key)} aria-current={active ? 'page' : undefined} style={navItemStyle(active)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        )
      })}
      <button onClick={onOpenMenu} aria-haspopup="dialog" aria-expanded={menuOpen} style={navItemStyle(menuActive)}>
        <Icon name="menu" />
        <span>Menu</span>
      </button>
    </nav>
  )
}

// --- slide-in menu drawer (secondary destinations) --------------------------
// Add future entries here (e.g. Progress, Account) — they appear automatically.
const MENU_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'deload', label: 'Deload', icon: 'deload' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'setup', label: 'Setup', icon: 'setup' },
]

// Mounted only while open (so the focus trap's mount/restore lifecycle is correct).
export function MenuDrawer({ tab, onSelect, onSignOut, onClose }: { tab: TabKey; onSelect: (t: TabKey) => void; onSignOut: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useFocusTrap(ref, onClose)

  const rowStyle = (active: boolean) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
    border: 'none',
    borderRadius: 2,
    color: active ? C.gold : C.off,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.04em',
    padding: '12px',
    cursor: 'pointer',
    textAlign: 'left' as const,
  })

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60, animation: 'gp-fade-in 0.15s ease' }} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          right: 0,
          zIndex: 61,
          width: 'min(280px, 80vw)',
          display: 'flex',
          flexDirection: 'column',
          background: C.navy,
          borderLeft: `1px solid ${C.border}`,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.40)',
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          paddingRight: 'env(safe-area-inset-right)',
          animation: 'gp-drawer-in 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: HEADING, fontSize: 20, letterSpacing: '0.08em', color: C.gold }}>MENU</span>
          <button onClick={onClose} aria-label="Close menu" style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 6 }}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div style={{ flex: 1, padding: 8 }}>
          {MENU_ITEMS.map((it) => {
            const active = tab === it.key
            return (
              <button
                key={it.key}
                onClick={() => {
                  onSelect(it.key)
                  onClose()
                }}
                aria-current={active ? 'page' : undefined}
                style={rowStyle(active)}
              >
                {/* icon always gold (brand accent); the label keeps the row colour */}
                <span style={{ color: C.gold, display: 'inline-flex' }}>
                  <Icon name={it.icon} size={20} />
                </span>
                <span>{it.label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '8px 8px 0', borderTop: `1px solid ${C.border}` }}>
          <button onClick={onSignOut} style={{ ...rowStyle(false), color: C.muted }}>
            <Icon name="signout" size={20} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </>
  )
}
