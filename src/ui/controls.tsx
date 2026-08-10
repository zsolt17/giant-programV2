import { useState } from 'react'
import type { ReactNode } from 'react'
import { C, HEADING, cardStyle, inp, lbl, pillColor } from './theme'
import { LIFT_LABEL } from '../engine/constants'
import type { Position } from '../engine/types'

// Parse a min:sec duration typed on an iOS decimal keypad (no colon), so all
// these forms work: "42.30" / "42,30" / "4230" = 42:30, bare "42" = 42 whole
// minutes. Returns whole seconds, or null when unparseable.
function parseClock(text: string | null | undefined): number | null {
  const t = (text || '').trim().replace(/[.,]/g, ':')
  if (!t) return null
  if (/^\d+$/.test(t)) {
    if (t.length <= 2) return Number(t) * 60 // bare minutes
    const sec = Number(t.slice(-2))
    if (sec > 59) return null
    const rest = t.slice(0, -2)
    if (rest.length <= 2) return Number(rest) * 60 + sec
    const min = Number(rest.slice(-2))
    if (min > 59) return null
    return Number(rest.slice(0, -2)) * 3600 + min * 60 + sec
  }
  if (!/^\d+(:[0-5]?\d){1,2}$/.test(t)) return null
  const parts = t.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

export function speedArrow(s: string): string {
  return s === 'up' ? '↑' : s === 'down' ? '↓' : '→'
}

// Duration editor as min:sec text — shared by the session-timer edit (Today +
// SessionModal). The iOS decimal keypad has no colon, so parseClock's forms all
// work: "42.30" / "42,30" / "4230" = 42:30, bare "42" = 42 whole minutes.
// Holds local text while typing (a valid keystroke commits parsed SECONDS up),
// and snaps back to the canonical m:ss on blur.
export function DurationEdit({ valueMs, onCommit }: { valueMs: number | null; onCommit: (seconds: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null)
  return (
    <input
      style={inp}
      type="text"
      inputMode="decimal"
      aria-label="Edit duration (minutes and seconds)"
      value={txt ?? (valueMs != null ? fmtClock(valueMs) : '')}
      onChange={(e) => {
        setTxt(e.target.value)
        const s = parseClock(e.target.value)
        if (s != null) onCommit(s)
      }}
      onBlur={() => setTxt(null)}
    />
  )
}

// Extract a human-readable message from an unknown thrown value (mirrors the
// previous `String(e?.message || e)` shape used at every save call site).
export function errMsg(e: unknown): string {
  return String((e as { message?: unknown } | null)?.message || e)
}

// ms -> "m:ss" (minutes uncapped, e.g. 73:20). Shared by the session timer (Today)
// and the calendar modal's duration editor. Null/undefined renders as 0:00.
export function fmtClock(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function blockTitle(title: ReactNode, tag?: string) {
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
      <div style={{ fontFamily: HEADING, fontSize: 20, letterSpacing: '0.08em', color: C.gold }}>{title}</div>
      {tag && (
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {tag}
        </span>
      )}
    </div>
  )
}

export function Row({ a, b, c, cls }: { a?: ReactNode; b?: ReactNode; c?: ReactNode; cls?: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{ fontSize: 12, color: C.muted }}>{a}</span>
      <span style={{ fontSize: 13, color: C.off }}>{b}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', color: cls || C.off, fontVariantNumeric: 'tabular-nums' }}>
        {c}
      </span>
    </div>
  )
}

export function SpeedPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // [value, glyph, accessible name] — the arrow glyph alone is icon-only.
  const opts: [string, string, string][] = [
    ['up', '↑', 'Faster'],
    ['normal', '→', 'Same speed'],
    ['down', '↓', 'Slower'],
  ]
  return (
    <div role="group" aria-label="Bar speed" style={{ display: 'flex', gap: 4 }}>
      {opts.map(([k, s, name]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          aria-label={name}
          aria-pressed={value === k}
          title={name}
          style={{
            flex: 1,
            background: value === k ? C.gold : 'rgba(255,255,255,0.06)',
            color: value === k ? C.dark : C.off,
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 2,
            fontSize: 16,
            padding: '6px',
            cursor: 'pointer',
          }}
        >
          <span aria-hidden="true">{s}</span>
        </button>
      ))}
    </div>
  )
}

export function LogRpe({
  label,
  rpe,
  speed,
  onRpe,
  onSpeed,
}: {
  label: string
  rpe: string
  speed?: string | null
  onRpe: (v: string) => void
  onSpeed?: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}>
        <label style={lbl}>{label} RPE</label>
        <select style={inp} value={rpe} onChange={(e) => onRpe(e.target.value)}>
          <option value="">—</option>
          {['R6', 'R7', 'R8', 'R8.5', 'R9', 'R9.5', 'R10'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {onSpeed && (
        <div style={{ flex: 1 }}>
          <label style={lbl}>Bar speed</label>
          <SpeedPick value={speed ?? ''} onChange={onSpeed} />
        </div>
      )}
    </div>
  )
}

// Position header for Today.
export function PositionHeader({ computed, label }: { computed: Position; label?: string }) {
  const diff = computed.difficulty
  const lift = computed.weekType === 'training' && computed.week ? computed.dayType ?? null : null
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>
          M{computed.macro}
          {computed.meso ? ` · C${computed.meso}` : ''}
          {computed.week ? ` · W${computed.week}` : ''} · wk {computed.displayWeekGlobal}/{computed.totalWeeks}
        </div>
        <div style={{ fontFamily: HEADING, fontSize: 26, letterSpacing: '0.05em' }}>
          {label ? label : lift ? LIFT_LABEL[lift] : '—'}
          {lift && <span style={{ color: pillColor(diff) }}> · {diff?.toUpperCase()}</span>}
        </div>
      </div>
    </div>
  )
}

// Giant Block adherence control (drives deload signal S7). One tap says "as
// prescribed"; unticking reveals the categorical reason. The reason is what
// the deload rule reads — attribution is the athlete's, captured at log
// time, never inferred. `options[0]` is the default fail reason.
export function CompletionPick({
  label,
  options,
  value,
  onChange,
  dataAttr,
  id,
}: {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
  dataAttr?: string
  id?: string
}) {
  const completed = value === 'completed' || value === ''
  const selectId = id || 'completion-reason'
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: completed ? C.green : C.off }}>
        <input type="checkbox" checked={completed} onChange={(e) => onChange(e.target.checked ? 'completed' : options[0].id)} />
        {label}
      </label>
      {!completed && (
        <div style={{ marginTop: 8 }}>
          <label style={lbl} htmlFor={selectId}>
            What happened?
          </label>
          <select
            id={selectId}
            {...(dataAttr ? { [dataAttr]: '1' } : {})}
            style={inp}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
