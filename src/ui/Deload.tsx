import { C } from './theme'
import { Card } from './components'
import { blockTitle, Row } from './controls'
import { SIGNALS } from '../engine/constants'
import { computeWeekSignals } from '../engine/deload-rule'
import { daysSinceStart } from '../engine/recovery'
import type { Session, DeloadMap } from '../engine/types'

export function Deload({ sessions, deloads, macroNumber, startISO }: { sessions: Session[]; deloads: DeloadMap; macroNumber: number; startISO: string }) {
  const weeks: Record<string, Session[]> = {}
  const labels: Record<string, string> = {}
  const isTesting: Record<string, boolean> = {}
  sessions.forEach((s) => {
    let k: string
    if (s.weekType === 'testing') {
      // Test sessions (companion rows) have no cycle/week — bucket by the
      // macro-relative week (13/14) derived from the start date (local math).
      // 'W' sorts after 'C', so these land first after the reverse() below.
      const w = Math.floor(daysSinceStart(startISO, s.date) / 7) + 1
      k = `M${macroNumber}W${w}`
      labels[k] = `W${w} · Testing`
      isTesting[k] = true
    } else if (s.cycle && s.week) {
      k = `M${macroNumber}C${s.cycle}W${s.week}`
      labels[k] = `C${s.cycle} · W${s.week}`
    } else return
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
          // Testing weeks: signals stay visible as data, but the trigger label is
          // suppressed — the scheduled W15 deload is already next; the reactive
          // recommendation never fires here.
          const testing = !!isTesting[k]
          return (
            <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
                  {labels[k]}
                  {confirmed && <span style={{ fontSize: 10, color: C.gold, marginLeft: 8, letterSpacing: '0.08em' }}>DELOAD APPLIED</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sig.fired && !testing ? C.red : sig.occurrences > 0 ? C.gold : C.green }}>
                  {sig.fired && !testing
                    ? 'DELOAD TRIGGERED'
                    : `${sig.occurrences} occ · ${sig.sessionCount} day${sig.sessionCount === 1 ? '' : 's'}`}
                </span>
              </div>
              {testing && sig.fired && (
                <div style={{ fontSize: 11, color: C.gold, marginTop: 4 }}>
                  Signal threshold met — no reactive deload during testing (scheduled W15 deload is next).
                </div>
              )}
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
