import React from 'react'
import { C } from './theme.js'
import { Card } from './components.jsx'
import { blockTitle, Row } from './controls.jsx'
import { SIGNALS } from '../engine/constants'
import { computeWeekSignals } from '../engine/deload-rule'

export function Deload({ sessions, deloads, macroNumber }) {
  const weeks = {}
  sessions.forEach((s) => {
    if (!s.cycle || !s.week) return // skip testing/deload-week sessions
    const k = `M${macroNumber}C${s.cycle}W${s.week}`
    weeks[k] = weeks[k] || []
    weeks[k].push(s)
  })
  const keys = Object.keys(weeks).sort().reverse()

  return (
    <div>
      <Card>
        {blockTitle('Reactive Deload Signals', 'per week')}
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Fires when there are 3+ signal occurrences across at least 2 different sessions in a week. One bad day alone never
          triggers it.
        </div>
        {keys.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No data yet.</div>}
        {keys.map((k) => {
          const sig = computeWeekSignals(weeks[k])
          const confirmed = deloads && deloads[k]
          const label = k.replace(/^M\d+/, '').replace('C', 'C').replace('W', ' · W')
          return (
            <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
                  {label}
                  {confirmed && <span style={{ fontSize: 10, color: C.gold, marginLeft: 8, letterSpacing: '0.08em' }}>DELOAD APPLIED</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sig.fired ? C.red : sig.occurrences > 0 ? C.gold : C.green }}>
                  {sig.fired ? 'DELOAD TRIGGERED' : `${sig.occurrences} occ · ${sig.sessionCount} day${sig.sessionCount === 1 ? '' : 's'}`}
                </span>
              </div>
              {sig.occurrences > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  {[...sig.types].map((id) => SIGNALS.find((x) => x.id === id)?.label).join(' · ')}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card>
        {blockTitle('The Signals', 'reference')}
        {SIGNALS.map((s) => (
          <Row key={s.id} a={s.id} b={s.label} c="" />
        ))}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: 'italic' }}>
          S4 (Set 1 &gt; R7) stays a notebook-only check — not auto-detected here, since the logger captures the top set, not
          every set.
        </div>
      </Card>
    </div>
  )
}
