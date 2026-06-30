import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { C, HEADING } from './theme'
import { Card, BlockTitle } from './components'
import { errMsg } from './controls'
import { useWakeLock } from './useWakeLock'
import { todayISO } from '../engine/date-engine'
import { protocolDay, suggestedPhase, effectivePhase } from '../engine/recovery'
import { RECOVERY_CONTENT, PHASE_DOSE } from '../engine/recovery-content'
import type { Joint, Phase, TendonExercise } from '../engine/recovery-content'
import type { RecoveryProtocol, RecoveryLogMap } from '../engine/types'

const JOINTS: Joint[] = ['wrist', 'elbow', 'shoulder', 'knee', 'ankle']
const PHASES: Phase[] = ['acute', 'build', 'maintenance']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// iOS native date input keeps an intrinsic width; -webkit-appearance:none fixes it (see Setup).
const DATE_INPUT: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 2,
  color: C.white,
  fontSize: 14,
  padding: '8px 10px',
  WebkitAppearance: 'none',
  appearance: 'none',
  display: 'block',
}

interface RecoveryProps {
  protocol: RecoveryProtocol | null
  logs: RecoveryLogMap
  onStartProtocol: (joint: Joint, startISO: string) => Promise<void>
  onSetPhaseOverride: (phase: Phase | null) => Promise<void>
  onCloseProtocol: () => Promise<void>
  onToggleTendonLog: (tendonKey: string, on: boolean) => Promise<void>
}

export function Recovery({ protocol, logs, onStartProtocol, onSetPhaseOverride, onCloseProtocol, onToggleTendonLog }: RecoveryProps) {
  if (!protocol) return <JointPicker onStart={onStartProtocol} />
  return (
    <ProtocolView
      protocol={protocol}
      logs={logs}
      onSetPhaseOverride={onSetPhaseOverride}
      onCloseProtocol={onCloseProtocol}
      onToggleTendonLog={onToggleTendonLog}
    />
  )
}

// ─── joint picker (no active protocol) ───────────────────────────────────────
function JointPicker({ onStart }: { onStart: (joint: Joint, startISO: string) => Promise<void> }) {
  const [joint, setJoint] = useState<Joint | null>(null)
  const [startISO, setStartISO] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function start() {
    if (!joint) return
    setSaving(true)
    setErr('')
    try {
      await onStart(joint, startISO)
    } catch (e) {
      setErr(errMsg(e))
      setSaving(false)
    }
  }

  return (
    <Card>
      <BlockTitle tag="tendon health">Start a Protocol</BlockTitle>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
        Joint-specific isometric loading. Pick the joint to rehab — the protocol auto-phases from the start date
        (Acute → Build → Maintenance). One active protocol at a time.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 8, marginBottom: 16 }}>
        {JOINTS.map((j) => {
          const active = joint === j
          return (
            <button
              key={j}
              onClick={() => setJoint(j)}
              aria-pressed={active}
              style={{
                background: active ? C.gold : 'rgba(255,255,255,0.06)',
                color: active ? C.dark : C.off,
                border: `1px solid ${active ? C.gold : 'rgba(255,255,255,0.14)'}`,
                borderRadius: 2,
                padding: '12px 6px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              {cap(j)}
            </button>
          )
        })}
      </div>
      <label style={{ fontSize: 11, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Start date</label>
      <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} style={{ ...DATE_INPUT, marginBottom: 16, width: 180 }} />
      <button
        onClick={start}
        disabled={!joint || saving}
        style={{
          width: '100%',
          background: !joint ? 'rgba(201,168,76,0.3)' : C.gold,
          color: C.dark,
          border: 'none',
          borderRadius: 2,
          padding: 13,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: !joint || saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Starting…' : 'Start protocol'}
      </button>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't start — {err}.</div>}
    </Card>
  )
}

// ─── active protocol ─────────────────────────────────────────────────────────
function ProtocolView({
  protocol,
  logs,
  onSetPhaseOverride,
  onCloseProtocol,
  onToggleTendonLog,
}: {
  protocol: RecoveryProtocol
  logs: RecoveryLogMap
  onSetPhaseOverride: (phase: Phase | null) => Promise<void>
  onCloseProtocol: () => Promise<void>
  onToggleTendonLog: (tendonKey: string, on: boolean) => Promise<void>
}) {
  const [confirmClose, setConfirmClose] = useState(false)
  const day = protocolDay(protocol.startISO)
  const suggested = suggestedPhase(protocol.startISO)
  const phase = effectivePhase(protocol.startISO, protocol.phaseOverride)
  const overridden = !!protocol.phaseOverride
  const tendons = RECOVERY_CONTENT[protocol.joint]
  const dose = PHASE_DOSE[phase]

  // Tap the auto-suggested segment → back to auto; tap any other → override to it.
  const tapPhase = (p: Phase) => onSetPhaseOverride(p === suggested ? null : p)

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: HEADING, fontSize: 26, letterSpacing: '0.04em' }}>{cap(protocol.joint)}</div>
            <div style={{ fontSize: 12, color: C.muted }}>Day {day} of protocol</div>
          </div>
          {confirmClose ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={onCloseProtocol} style={{ background: C.red, color: C.dark, border: 'none', borderRadius: 2, fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer' }}>
                Confirm
              </button>
              <button onClick={() => setConfirmClose(false)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmClose(true)} style={{ background: 'transparent', color: C.muted, border: 'none', fontSize: 11, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
              Close protocol
            </button>
          )}
        </div>

        {/* Phase segmented control */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PHASES.map((p) => {
            const on = phase === p
            return (
              <button
                key={p}
                onClick={() => tapPhase(p)}
                aria-pressed={on}
                style={{
                  flex: 1,
                  background: on ? C.gold : 'rgba(255,255,255,0.06)',
                  color: on ? C.dark : C.muted,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 2,
                  padding: '8px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {cap(p)}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          {overridden ? `Overridden — auto-suggests ${cap(suggested)} on day ${day}` : 'Auto-suggested from start date'} · {dose}
        </div>
      </Card>

      {tendons.map((t) => (
        <TendonRow key={t.key} ex={t} dose={dose} done={!!logs[t.key]} onToggle={(on) => onToggleTendonLog(t.key, on)} />
      ))}
    </div>
  )
}

// ─── one tendon row, with the hold timer ─────────────────────────────────────
function TendonRow({ ex, dose, done, onToggle }: { ex: TendonExercise; dose: string; done: boolean; onToggle: (on: boolean) => void }) {
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(0) // seconds left in the current hold
  const [setsDone, setSetsDone] = useState(0) // completed 30s sets this session (0..3)
  useWakeLock(running) // keep the screen on during a hold

  // Count down while running.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(id)
  }, [running])

  // A hold finishes when the countdown reaches 0.
  useEffect(() => {
    if (running && remaining === 0) {
      setRunning(false)
      setSetsDone((n) => Math.min(3, n + 1))
    }
  }, [remaining, running])

  // Completing set 3 auto-checks "done today" (unless already logged).
  useEffect(() => {
    if (setsDone >= 3 && !done) onToggle(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setsDone])

  function startHold() {
    if (setsDone >= 3 || running) return
    setRemaining(30)
    setRunning(true)
  }

  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <Icon svg={ex.icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>{ex.tendonName}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{ex.exerciseName}</div>
        <div style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>{dose}</div>
      </div>
      <TimerControl running={running} remaining={remaining} setsDone={setsDone} onStart={startHold} />
      <label aria-label={`${ex.tendonName} done today`} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.gold }} />
      </label>
    </Card>
  )
}

// 56px inline-SVG box; resolves the content's CSS vars from the app's theme tokens.
function Icon({ svg }: { svg: string }) {
  // The static SVG strings reference --text-secondary / --border-strong; define them
  // here from the app's theme tokens (cast: CSSProperties doesn't type custom props).
  const box = {
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: 4,
    background: 'rgba(0,0,0,0.18)',
    border: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '--text-secondary': C.muted,
    '--border-strong': C.gold,
  } as CSSProperties
  return (
    <div aria-hidden="true" style={box}>
      <div style={{ width: 44, height: 44 }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}

// Idle (<3): play + "x/3". Active: 30s countdown ring. Done (3/3): check.
function TimerControl({ running, remaining, setsDone, onStart }: { running: boolean; remaining: number; setsDone: number; onStart: () => void }) {
  const R = 18
  const CIRC = 2 * Math.PI * R
  if (running) {
    return (
      <div style={{ width: 44, height: 44, position: 'relative', flexShrink: 0 }}>
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            stroke={C.gold}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - remaining / 30)}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.gold, fontVariantNumeric: 'tabular-nums' }}>{remaining}</span>
      </div>
    )
  }
  if (setsDone >= 3) {
    return (
      <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.green }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
        <span style={{ fontSize: 9, color: C.muted }}>3/3</span>
      </div>
    )
  }
  return (
    <button
      onClick={onStart}
      aria-label="Start 30 second hold"
      style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.gold, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>▶</span>
      <span style={{ fontSize: 9, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{setsDone}/3</span>
    </button>
  )
}
