import type { CSSProperties } from 'react'
import type { Difficulty } from '../engine/types'

// Design tokens — the established navy/gold brand. Keep consistent.
export const C = {
  navy: '#2E4057',
  dark: '#1a2535',
  gold: '#C9A84C',
  white: '#fff',
  off: '#f0f3f7',
  muted: '#8A9BB0',
  blue: '#7eb8f7',
  green: '#8ddcb0',
  red: '#e88888',
  // "Chart alt series" from the brand guide — the one non-semantic secondary
  // accent. Green/red/blue are reserved meanings (difficulty, state) per the
  // guide's own rule ("use them the same way... and nowhere else"); purple is
  // the deliberate escape hatch for "a second group, not good/bad/a state".
  purple: '#B39DDB',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(201,168,76,0.18)',
}

// hex -> rgba(...) at the given alpha. Generic so any accent (not just gold)
// can produce its own translucent variant for borders/fills.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Superset group identity color, keyed by the group's index among THAT DAY'S
// superset pairs specifically (not all groups — a standalone exercise never
// consumes a slot in this sequence). Index-based and open-ended so a 3rd
// pair (if content ever adds one) cycles rather than needing a new branch.
export const SUPERSET_ACCENTS = [C.gold, C.purple]
export function supersetAccent(index: number): string {
  return SUPERSET_ACCENTS[index % SUPERSET_ACCENTS.length]
}

export const HEADING = "'Bebas Neue', sans-serif"
export const BODY = "'DM Sans', system-ui, sans-serif"

export const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 2,
  padding: 16,
  marginBottom: 14,
}

export const btnPrimary: CSSProperties = {
  background: C.gold,
  color: C.dark,
  border: 'none',
  borderRadius: 2,
  padding: '12px 16px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontSize: 13,
  cursor: 'pointer',
}

export const inp: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 2,
  color: C.white,
  fontSize: 14,
  padding: '8px 10px',
  width: '100%',
  // minWidth:0 + maxWidth let inputs (esp. iOS native date inputs, which keep an
  // intrinsic width) shrink to their grid/flex track instead of overflowing.
  minWidth: 0,
  maxWidth: '100%',
  // No inline `outline: none` — a global :focus-visible rule (global.css) draws a
  // gold keyboard-focus ring; inline none would override it for keyboard users.
  boxSizing: 'border-box',
}

export const lbl: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.gold,
  display: 'block',
  marginBottom: 6,
}

export function pillColor(d: Difficulty | null | undefined): string {
  return d === 'hard' ? C.red : d === 'medium' ? C.gold : C.green
}
