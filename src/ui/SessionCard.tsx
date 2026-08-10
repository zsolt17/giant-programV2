// The Today-tab card shell: one block (Primer/Giant/Volume/Capability) as an
// expand/collapse unit. Purely presentational — status and expanded/collapsed
// are computed by the caller (Giant2SessionForm); this component only renders
// the two visual states and the click-to-peek affordance on a done card.
import type { ReactNode } from 'react'
import { C, HEADING, cardStyle } from './theme'
import { Card } from './components'

export type CardStatus = 'locked' | 'pending' | 'active' | 'done'

interface SessionCardProps {
  letter: string
  title: string
  context?: string | null // shown only in the collapsed summary row
  tag?: string // shown only in the expanded header (matches blockTitle's tag)
  status: CardStatus
  expanded: boolean
  onHeaderClick?: () => void
  children: ReactNode
}

export function SessionCard({ letter, title, context, tag, status, expanded, onHeaderClick, children }: SessionCardProps) {
  if (!expanded) {
    // Clickability is caller-decided (a handler being present IS "clickable")
    // — Today's sequential flow only wires one up for a done card (peek-and-
    // fix); Calendar's free-toggle mode wires one up for every card.
    const clickable = !!onHeaderClick
    return (
      <div
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-expanded={false}
        onClick={clickable ? onHeaderClick : undefined}
        onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onHeaderClick?.() : undefined}
        style={{
          ...cardStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: clickable ? 'pointer' : 'default',
          opacity: status === 'pending' ? 0.55 : 1,
        }}
      >
        <div style={{ fontSize: 13, color: status === 'done' ? C.off : C.muted, fontWeight: status === 'done' ? 600 : 400 }}>
          {letter}. {title}
          {context ? <span style={{ color: C.muted, fontWeight: 400 }}> — {context}</span> : null}
        </div>
        {status === 'done' && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Done</span>}
      </div>
    )
  }

  // Expanded header — matches controls.tsx's blockTitle exactly, but (unlike
  // that shared helper) becomes a real toggle when the caller wired one up:
  // free mode (Calendar) passes a handler for every card so an already-open
  // one can still be tapped shut; sequential mode (Today) only passes one for
  // a peeked done card, so its active/locked header stays inert.
  const clickableExpanded = !!onHeaderClick
  return (
    <Card style={status === 'locked' ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <div
        role={clickableExpanded ? 'button' : undefined}
        tabIndex={clickableExpanded ? 0 : undefined}
        aria-expanded={true}
        onClick={clickableExpanded ? onHeaderClick : undefined}
        onKeyDown={clickableExpanded ? (e) => (e.key === 'Enter' || e.key === ' ') && onHeaderClick?.() : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: `1px solid ${C.border}`,
          cursor: clickableExpanded ? 'pointer' : undefined,
        }}
      >
        <div style={{ fontFamily: HEADING, fontSize: 20, letterSpacing: '0.08em', color: C.gold }}>
          {letter}. {title}
        </div>
        {tag && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{tag}</span>
        )}
      </div>
      {children}
    </Card>
  )
}
