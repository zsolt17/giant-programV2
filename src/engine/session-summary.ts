// Pure formatting of a logged Session into the plain-text summary tuned for
// pasting into a coaching conversation (NOT for in-app display). Framework-agnostic
// and unit-tested. Non-applicable lines are omitted (e.g. no Cleans line off dips
// day, no Pull-ups off OHP day, no Duration when untimed).
import { LIFT_SHORT } from './constants'
import type { Session, Lift } from './types'

// 'up' -> ↑, 'down' -> ↓, 'normal' -> →; blank -> '' (no stray arrow when unlogged).
function arrow(speed: string): string {
  return speed === 'up' ? '↑' : speed === 'down' ? '↓' : speed === 'normal' ? '→' : ''
}

// Stored RPE already carries the leading "R" (e.g. "R9.5"); strip it so the
// template's own "R" prefix doesn't double up ("RR9.5").
function rpeNum(rpe: string): string {
  return (rpe || '').replace(/^R/, '')
}

// "2026-06-22" -> "22.06.2026". Pass-through for anything unexpected.
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

const liftLabel = (l: Lift | null): string => (l ? LIFT_SHORT[l] : '—')

// Derived duration in whole minutes, or null when either timestamp is missing.
function durationMin(s: Session): number | null {
  if (!s.startedAt || !s.endedAt) return null
  const ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.round(ms / 60000)
}

// Per-round cardio cals as "15/14/–/15" (unfilled rounds → "–"); '' when none logged.
function cardioStr(cals: (number | null)[]): string {
  if (!cals || !cals.some((c) => c != null)) return ''
  return cals.map((c) => (c == null ? '–' : String(c))).join('/')
}

export function sessionSummary(s: Session, macroNumber: number): string {
  const lines: string[] = []

  // Header: "Session — M2C1W1 — Squat Hard — 22.06.2026". Training weeks carry
  // cycle+week; testing/deload weeks (null cycle/week) degrade to the week type.
  const pos =
    s.cycle != null && s.week != null
      ? `M${macroNumber}C${s.cycle}W${s.week}`
      : `M${macroNumber} · ${s.weekType.charAt(0).toUpperCase() + s.weekType.slice(1)}`
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  lines.push(`Session — ${pos} — ${liftLabel(s.dayType)}${diff} — ${fmtDate(s.date)}`)

  // Cleans (dips day only).
  if (s.dayType === 'dips' && (s.cleanLoad != null || s.cleanRounds != null)) {
    const rounds = s.cleanRounds ?? '—'
    const load = s.cleanLoad != null ? `${s.cleanLoad}` : '—'
    lines.push(`Cleans: ${rounds}×3 @ ${load} ${arrow(s.cleanSpeed)}`.trimEnd())
  }

  // Giant Block (the main lift top set + per-round cardio).
  const top = s.topWeight != null && s.topReps != null ? `${s.topWeight}×${s.topReps}` : '—'
  const cardio = cardioStr(s.cardioCals)
  lines.push(`Giant Block R${rpeNum(s.rpe)}${arrow(s.barSpeed)}: top ${top}${cardio ? `, cardio ${cardio}` : ''}`)

  // Volume block.
  lines.push(`Volume R${rpeNum(s.volRpe)}${arrow(s.volSpeed)}: ${s.volDone ? '2 sets done' : 'incomplete'}`)

  // Pull-ups (OHP day only).
  if (s.dayType === 'ohp' && s.pullupCluster) {
    lines.push(`Pull-ups: ${s.pullupCluster}`)
  }

  // Carry — skipped drops the rounds/distance/RPE detail.
  if (s.carrySkipped) {
    lines.push(`Carry: skipped${s.carrySkipReason ? ` (${s.carrySkipReason})` : ''}`)
  } else if (s.carryRounds != null || s.carryDistance != null) {
    const rounds = s.carryRounds ?? '—'
    const dist = s.carryDistance != null ? `${s.carryDistance}m` : '—'
    lines.push(`Carry R${rpeNum(s.carryRpe)}: ${rounds}×${dist}`)
  }

  // Duration (omitted when untimed).
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)

  // Notes (omitted when empty).
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)

  return lines.join('\n')
}
