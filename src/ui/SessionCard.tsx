// The Today-tab card shell: one block (Primer/Giant/Volume/Capability) as an
// expand/collapse unit. Purely presentational — status and expanded/collapsed
// are computed by the caller (Giant2SessionForm); this component only renders
// the two visual states and the click-to-peek affordance on a done card.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, TransitionEvent } from 'react'
import { C, HEADING, cardStyle } from './theme'
import { Card } from './components'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export type CardStatus = 'locked' | 'pending' | 'active' | 'done'

// Matches the app's existing "panel reveal" convention (gp-drawer-in/
// gp-drawer-up, global.css) — 200ms, plain ease — rather than introducing a
// new duration/easing pairing.
const DURATION_MS = 200

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

// Animates `show` transitioning either way — height (via grid-template-rows,
// the CSS-only way to animate to/from an unknown "auto" height, no JS
// measurement needed) and opacity easing together, never an abrupt cut.
// Genuinely unmounts its content once a hide finishes (same lifecycle as a
// plain conditional render — a collapsed block's internal form state resets
// exactly as it always did, this only adds the animated exit/entry around
// it) rather than keeping it invisibly mounted, which would leave it
// keyboard-focusable and change every block's remount-on-reopen behavior.
function AnimatedSwap({ show, children }: { show: boolean; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion()
  const [mounted, setMounted] = useState(show)
  const [visible, setVisible] = useState(show)
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (show) {
      setMounted(true)
      if (reducedMotion) {
        setVisible(true)
        return
      }
      // Paint the "hidden" start state for one frame before flipping to
      // visible — flipping both in the same tick as mounting would start
      // already at the end state, and the transition would never run.
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
    if (reducedMotion) {
      setMounted(false) // no transition to wait for — unmount immediately
      return
    }
    // Safety net alongside onTransitionEnd below: a transitionend can fail
    // to fire in rare cases (e.g. an ancestor's display/visibility change
    // mid-transition) — a stuck-mounted, invisible card would stay
    // keyboard-focusable. Cleared if the real event beats it.
    const timeout = setTimeout(() => setMounted(false), DURATION_MS + 100)
    return () => clearTimeout(timeout)
  }, [show, reducedMotion])

  function handleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== nodeRef.current || e.propertyName !== 'opacity') return
    if (!show) setMounted(false)
  }

  if (!mounted) return null
  return (
    <div
      ref={nodeRef}
      onTransitionEnd={handleTransitionEnd}
      style={{
        display: 'grid',
        gridTemplateRows: visible ? '1fr' : '0fr',
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? 'none' : `grid-template-rows ${DURATION_MS}ms ease, opacity ${DURATION_MS}ms ease`,
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  )
}

export function SessionCard({ letter, title, context, tag, status, expanded, onHeaderClick, children }: SessionCardProps) {
  // Clickability is caller-decided (a handler being present IS "clickable")
  // — Today's sequential flow only wires one up for a done card (peek-and-
  // fix); Calendar's free-toggle mode wires one up for every card.
  const clickable = !!onHeaderClick

  return (
    <>
      <AnimatedSwap show={!expanded}>
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
      </AnimatedSwap>

      {/* Expanded header — matches controls.tsx's blockTitle exactly, but
          (unlike that shared helper) becomes a real toggle when the caller
          wired one up: free mode (Calendar) passes a handler for every card
          so an already-open one can still be tapped shut; sequential mode
          (Today) only passes one for a peeked done card, so its
          active/locked header stays inert. */}
      <AnimatedSwap show={expanded}>
        <Card style={status === 'locked' ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-expanded={true}
            onClick={clickable ? onHeaderClick : undefined}
            onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onHeaderClick?.() : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: `1px solid ${C.border}`,
              cursor: clickable ? 'pointer' : undefined,
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
      </AnimatedSwap>
    </>
  )
}
