// Pure formatting of a logged Session into the plain-text summary tuned for
// pasting into a coaching conversation (NOT for in-app display). Framework-agnostic
// and unit-tested. Captures the complete session picture: the Giant Block set
// ladder comes from the SAME loading-engine computation Today renders (giantSets/
// volumeWeight), never re-derived. Non-applicable / unlogged lines are omitted.
import { LIFT_SHORT, SCHEMES, DAY_META, BLOCK_COMPLETION, GIANT2_SECONDARY, GB_ACCESSORY, SECONDARY_LANE, SECONDARY_REPS, PULLUP } from './constants'
import { giantSets, volumeWeight, liftMode, fmt } from './loading'
import { capabilityProgramFor } from './date-engine'
import type { Session, Lift, AccessoryByCycle, WeightsByCycle, GiantAccessoryReps } from './types'

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

// Derived duration in whole minutes, or null when either timestamp is missing.
function durationMin(s: Session): number | null {
  if (!s.startedAt || !s.endedAt) return null
  const ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.round(ms / 60000)
}

// Join present segments with " | " (drops blanks so unlogged RPE/speed leave no residue).
const seg = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(' | ')

// `accessory` = the per-cycle grid for the SESSION'S macro (cycle -> item -> weight);
// resolves the carry weight. `weights` = the same macro's working-weight grid —
// resolves the secondary's ladder + the weighted pull-up ladder.
export function sessionSummary(
  s: Session,
  macroNumber: number,
  accessory?: AccessoryByCycle,
  weights?: WeightsByCycle,
  deloadWeek?: boolean,
  giantAccessory?: GiantAccessoryReps
): string {
  const lines: string[] = []
  const meta = s.dayType ? DAY_META[s.dayType] : null

  // Header: "Session — M2C1W1 — Squat Hard — 22.06.2026" ("Deload — …" on a
  // reactive-deload week).
  const pos = s.cycle != null && s.week != null ? `M${macroNumber}C${s.cycle}W${s.week}` : `M${macroNumber} · Deload`
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  lines.push(`${deloadWeek ? 'Deload' : 'Session'} — ${pos} — ${liftLabel(s.dayType)}${diff} — ${fmtDate(s.date)}`)

  // ---- Giant Block ----------------------------------------------------------
  lines.push('Giant Block:')
  if (deloadWeek) lines.push('  (reactive deload week — loads ~70%)')
  const top = s.topWeight != null && s.topReps != null ? `${kg(s.topWeight)}×${s.topReps}` : '—'
  lines.push(`  Top set: ${seg(top, rpeStr(s.rpe), arrow(s.barSpeed))}`)

  // Full computed set ladder for the day (same engine call Today renders).
  if (s.topWeight != null && s.topWeight > 0 && s.difficulty) {
    const sets = giantSets(s.topWeight, s.difficulty)
    lines.push(`  Sets: ${sets.map((g) => `${g.reps}@${kg(g.weight)}`).join(' · ')}`)
  }

  // Adherence (legacy null was mapped to 'completed' by the data layer).
  const completion =
    !s.blockCompletion || s.blockCompletion === 'completed'
      ? 'Completed as prescribed ✓'
      : BLOCK_COMPLETION.find((o) => o.id === s.blockCompletion)?.label || s.blockCompletion
  lines.push(`  Completion: ${completion}`)

  // Secondary (the db_row/pendlay_row lane — BB Row on OHP day, Pull-ups on
  // bench day, two-mode).
  const laneKey = s.dayType ? SECONDARY_LANE[s.dayType] : undefined
  const secondary = s.dayType ? GIANT2_SECONDARY[s.dayType] : undefined
  const laneCell = laneKey && s.cycle != null ? weights?.[s.cycle]?.[laneKey] : undefined
  if (secondary && laneKey) {
    const weighted = secondary.key !== 'pullup' || liftMode(laneCell?.hard) === 'weighted'
    const laneTop = weighted && s.difficulty ? laneCell?.[s.difficulty] ?? null : null
    if (weighted) {
      const reps = s.difficulty ? SECONDARY_REPS[s.difficulty] : null
      const ladder =
        laneTop != null && s.difficulty
          ? giantSets(laneTop, s.difficulty)
              .map((g) => `${reps}@${kg(g.weight)}`)
              .join(' · ')
          : reps != null
            ? `${reps} reps/round`
            : ''
      lines.push(`  ${secondary.name}: ${ladder}`)
    } else if (s.pullupCluster) {
      lines.push(`  ${secondary.name}: ${s.pullupCluster}`)
    } else {
      lines.push(`  ${secondary.name}: ${PULLUP[s.difficulty || 'hard']} reps/round (clusters ok)`)
    }
  }
  // The day's bodyweight accessory (rep-only; Setup target over the default).
  const gbAcc = s.dayType ? GB_ACCESSORY[s.dayType] : undefined
  if (gbAcc) lines.push(`  ${gbAcc.name}: ${giantAccessory?.[gbAcc.key] ?? gbAcc.reps} reps (BW)`)

  const cardio = s.cardioCals && s.cardioCals.some((c) => c != null) ? s.cardioCals.map((c) => (c == null ? '–' : String(c))).join('/') : ''
  if (cardio) lines.push(`  Cardio: ${cardio}`)

  // ---- Volume Block -----------------------------------------------------------
  // An INDEPENDENT difficulty from the Giant block's (s.volumeDifficulty, not
  // s.difficulty) — null means no Volume block that session (C3 week 4, or deload).
  if (s.volumeDifficulty) {
    const scheme = SCHEMES[s.volumeDifficulty]
    const rx = `2×${scheme.vol}${s.topWeight != null ? ` @ ${kg(volumeWeight(s.topWeight))}` : ''}`
    lines.push(`Volume Block: ${seg(rx, rpeStr(s.volRpe), arrow(s.volSpeed), s.volDone === false ? 'incomplete' : '')}`)
    // The secondary shares the Volume block (80% of ITS day top, off the Volume difficulty).
    const volLaneTop = laneKey && s.cycle != null ? weights?.[s.cycle]?.[laneKey]?.[s.volumeDifficulty] ?? null : null
    if (laneKey && secondary) {
      lines.push(`  ${secondary.name}: 2×${scheme.vol}${volLaneTop != null ? ` @ ${kg(volumeWeight(volLaneTop))}` : ''}`)
    }
  } else if (s.weekType === 'training') {
    lines.push('Volume Block: none this week (C3 week 4)')
  }

  // ---- Carry ------------------------------------------------------------------
  if (meta && s.dayType) {
    const w = accessory?.[s.cycle ?? -1]?.[`carry_${s.dayType}`]
    const load = w != null ? `${fmt(w)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load
    if (s.carrySkipped) {
      lines.push(`Carry: ${meta.carry.name} — skipped${s.carrySkipReason ? ` (${s.carrySkipReason})` : ''}`)
    } else if (s.carryRounds != null || s.carryDistance != null || s.carryRpe) {
      const rounds = s.carryRounds ?? '—'
      const dist = s.carryDistance != null ? `${s.carryDistance}m` : '—'
      lines.push(`Carry: ${seg(`${meta.carry.name} ${load}`, `${rounds}×${dist}`, rpeStr(s.carryRpe))}`)
    }
  }

  // Capability block (Hypertrophy C1 / Oly C2): logged in separate tables
  // (hypertrophy_logs / oly_logs, one row per movement) this function doesn't
  // have access to — flagged rather than silently left out. Carries (C3) are
  // fully covered above (same session-level fields as always), so no note there.
  if (s.weekType === 'training' && s.cycle != null) {
    const program = capabilityProgramFor(s.cycle)
    if (program === 'hypertrophy' || program === 'oly') {
      lines.push(`${program === 'hypertrophy' ? 'Hypertrophy' : 'Oly'}: not included in this summary — see the app`)
    }
  }

  // Duration (omitted when untimed).
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)

  // Notes (omitted when empty).
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)

  return lines.join('\n')
}
