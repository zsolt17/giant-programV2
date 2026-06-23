import React from 'react'
import { C, HEADING, cardStyle, inp, lbl, pillColor } from './theme.js'
import { ROTATION, LIFT_LABEL, PULLUP } from '../engine/constants.js'

export function speedArrow(s) {
  return s === 'up' ? '↑' : s === 'down' ? '↓' : '→'
}

export function antagDesc(type, diff) {
  if (type === 'hold') return 'max hold, sub-maximal'
  if (type === 'hold20') return '20 sec'
  if (type === 'pullup') return `${PULLUP[diff]} reps/round (clusters ok)`
  if (type === 'ringrow') return 'sub-maximal, scale by angle'
  return ''
}

export function blockTitle(title, tag) {
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

export function Row({ a, b, c, cls }) {
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

export function SpeedPick({ value, onChange }) {
  const opts = [
    ['up', '↑'],
    ['normal', '→'],
    ['down', '↓'],
  ]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map(([k, s]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
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
          {s}
        </button>
      ))}
    </div>
  )
}

export function LogRpe({ label, rpe, speed, onRpe, onSpeed }) {
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
          <SpeedPick value={speed} onChange={onSpeed} />
        </div>
      )}
    </div>
  )
}

// Position header for Today. Optional difficulty "peek" lets you preview another
// difficulty's prescription on a session day without changing your real position.
export function PositionHeader({ computed, viewDiff, setViewDiff, label }) {
  const shownDiff = viewDiff || computed.difficulty
  const isPeeking = viewDiff && viewDiff !== computed.difficulty
  const shownLift = computed.weekType === 'training' && computed.week ? ROTATION[computed.week - 1][shownDiff] : null
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>
          M{computed.macro}
          {computed.meso ? ` · C${computed.meso}` : ''}
          {computed.week ? ` · W${computed.week}` : ''} · wk {computed.displayWeekGlobal}/15
        </div>
        <div style={{ fontFamily: HEADING, fontSize: 26, letterSpacing: '0.05em' }}>
          {label ? label : shownLift ? LIFT_LABEL[shownLift] : '—'}
          {shownLift && <span style={{ color: pillColor(shownDiff) }}> · {shownDiff.toUpperCase()}</span>}
          {isPeeking && (
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 8, fontFamily: 'inherit', letterSpacing: 0 }}>(preview)</span>
          )}
        </div>
      </div>
      {computed.weekType === 'training' && computed.isSessionDay && setViewDiff && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['hard', 'medium', 'light'].map((d) => (
            <button
              key={d}
              onClick={() => setViewDiff(d === computed.difficulty ? null : d)}
              style={{
                background: shownDiff === d ? pillColor(d) : 'transparent',
                color: shownDiff === d ? C.dark : C.muted,
                border: `1px solid ${pillColor(d)}`,
                borderRadius: 2,
                fontSize: 10,
                fontWeight: 600,
                padding: '4px 7px',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {d[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
