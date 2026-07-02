// Pure formatting of a logged Session into the plain-text summary tuned for
// pasting into a coaching conversation (NOT for in-app display). Framework-agnostic
// and unit-tested. Captures the complete session picture: the Giant Block set
// ladder comes from the SAME loading-engine computation Today renders (giantSets/
// volumeWeight), never re-derived. Non-applicable / unlogged lines are omitted.
import { LIFT_SHORT, SCHEMES, DAY_META, SECONDARY_ITEM, BLOCK_COMPLETION } from './constants'
import { giantSets, volumeWeight, fmt } from './loading'
import type { Session, Lift, AccessoryByCycle } from './types'
import type { DayMeta } from './types'

// 'up' -> ↑, 'down' -> ↓, 'normal' -> →; blank -> '' (no stray arrow when unlogged).
function arrow(speed: string): string {
  return speed === 'up' ? '↑' : speed === 'down' ? '↓' : speed === 'normal' ? '→' : ''
}

// Stored RPE already carries the leading "R" (e.g. "R9.5"); keep it as-is, but
// guard blanks (return '' so the segment is dropped, not "R").
function rpeStr(rpe: string): string {
  return rpe ? (rpe.startsWith('R') ? rpe : `R${rpe}`) : ''
}

// "2026-06-22" -> "22.06.2026". Pass-through for anything unexpected.
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

const liftLabel = (l: Lift | null): string => (l ? LIFT_SHORT[l] : '—')
const kg = (n: number): string => (n % 1 === 0 ? String(n) : n.toFixed(1))
// Reps text for the weighted secondaries (mirrors controls.secondaryDesc).
const SECONDARY_REPS: Partial<Record<DayMeta['secondaryType'], string>> = { rdl: '8/leg', lunge: '8/leg', dbrow: '10/arm' }

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

// Join present segments with " | " (drops blanks so unlogged RPE/speed leave no residue).
const seg = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(' | ')

// `accessory` = the per-cycle grid for the SESSION'S macro (cycle -> item -> weight);
// resolves the recorded secondary + carry weights. Optional — lines degrade gracefully.
export function sessionSummary(s: Session, macroNumber: number, accessory?: AccessoryByCycle): string {
  const lines: string[] = []
  const meta = s.dayType ? DAY_META[s.dayType] : null
  const acc = s.cycle != null ? accessory?.[s.cycle] : undefined

  // Header: "Session — M2C1W1 — Squat Hard — 22.06.2026". Training weeks carry
  // cycle+week; testing/deload weeks (null cycle/week) degrade to the week type.
  const pos =
    s.cycle != null && s.week != null
      ? `M${macroNumber}C${s.cycle}W${s.week}`
      : `M${macroNumber} · ${s.weekType.charAt(0).toUpperCase() + s.weekType.slice(1)}`
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  lines.push(`Session — ${pos} — ${liftLabel(s.dayType)}${diff} — ${fmtDate(s.date)}`)

  // ---- Giant Block ----------------------------------------------------------
  lines.push('Giant Block:')
  const top = s.topWeight != null && s.topReps != null ? `${kg(s.topWeight)}×${s.topReps}` : '—'
  lines.push(`  Top set: ${seg(top, rpeStr(s.rpe), arrow(s.barSpeed))}`)

  // Full computed set ladder for the day (same engine call Today renders).
  if (s.topWeight != null && s.difficulty) {
    const sets = giantSets(s.topWeight, s.difficulty)
    lines.push(`  Sets: ${sets.map((g) => `${g.reps}@${kg(g.weight)}`).join(' · ')}`)
  }

  // Adherence (legacy null was mapped to 'completed' by the data layer).
  const completion =
    !s.blockCompletion || s.blockCompletion === 'completed'
      ? 'Completed as prescribed ✓'
      : BLOCK_COMPLETION.find((o) => o.id === s.blockCompletion)?.label || s.blockCompletion
  lines.push(`  Completion: ${completion}`)

  // Weighted secondary (lunge/row/RDL days) with its recorded per-cycle weight;
  // dips day is bodyweight pull-ups — the cluster line below covers it.
  if (meta && s.dayType) {
    const reps = SECONDARY_REPS[meta.secondaryType]
    if (reps) {
      const item = SECONDARY_ITEM[s.dayType]
      const w = item ? acc?.[item] : null
      lines.push(`  Secondary: ${meta.secondary}${w != null ? ` ${kg(w)}kg` : ''} × ${reps}`)
    }
  }

  // Pull-ups (dips day only — the dips-day Giant Block secondary).
  if (s.dayType === 'dips' && s.pullupCluster) lines.push(`  Pull-ups: ${s.pullupCluster}`)

  const cardio = cardioStr(s.cardioCals)
  if (cardio) lines.push(`  Cardio: ${cardio}`)

  // ---- Volume Block -----------------------------------------------------------
  if (s.difficulty) {
    const scheme = SCHEMES[s.difficulty]
    const rx =
      s.dayType === 'dips'
        ? `Push-ups 2×${scheme.vol} (BW)`
        : `2×${scheme.vol}${s.topWeight != null ? ` @ ${kg(volumeWeight(s.topWeight))}` : ''}`
    lines.push(`Volume Block: ${seg(rx, rpeStr(s.volRpe), arrow(s.volSpeed), s.volDone === false ? 'incomplete' : '')}`)
  }

  // ---- Carry ------------------------------------------------------------------
  if (meta && s.dayType) {
    const w = acc?.[`carry_${s.dayType}`]
    const load = w != null ? `${fmt(w)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load
    if (s.carrySkipped) {
      lines.push(`Carry: ${meta.carry.name} — skipped${s.carrySkipReason ? ` (${s.carrySkipReason})` : ''}`)
    } else if (s.carryRounds != null || s.carryDistance != null || s.carryRpe) {
      const rounds = s.carryRounds ?? '—'
      const dist = s.carryDistance != null ? `${s.carryDistance}m` : '—'
      lines.push(`Carry: ${seg(`${meta.carry.name} ${load}`, `${rounds}×${dist}`, rpeStr(s.carryRpe))}`)
    }
  }

  // Duration (omitted when untimed).
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)

  // Notes (omitted when empty).
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)

  return lines.join('\n')
}
