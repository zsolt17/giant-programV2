// Pure formatting of a logged Session into the plain-text summary tuned for
// pasting into a coaching conversation (NOT for in-app display). Framework-agnostic
// and unit-tested. Captures the complete session picture: the Giant Block set
// ladder comes from the SAME loading-engine computation Today renders (giantSets/
// volumeWeight), never re-derived. Non-applicable / unlogged lines are omitted.
import { LIFT_SHORT, SCHEMES, BLOCK_COMPLETION, GIANT2_SECONDARY, GB_ACCESSORY, SECONDARY_LANE, SECONDARY_REPS, PULLUP } from './constants'
import { giantSets, volumeWeight, liftMode } from './loading'
import { capabilityRecordFor } from './capability-record'
import type { CapabilityLogs, HypertrophyExerciseRecord, HypertrophySetRecord, OlyExerciseRecord } from './capability-record'
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

// "12@20kg R8"; weight-optional sets left unlogged drop the "@—" entirely
// (that's an expected empty, not a missing one) rather than reading as unset.
function hypertrophySetStr(set: HypertrophySetRecord, weightOptional: boolean): string {
  const reps = set.reps != null ? String(set.reps) : '—'
  const rpe = set.rpe ? ` ${rpeStr(set.rpe)}` : ''
  if (weightOptional && set.weight == null) return `${reps}${rpe}`
  return `${reps}@${set.weight != null ? `${kg(set.weight)}kg` : '—'}${rpe}`
}

function hypertrophyExerciseLine(ex: HypertrophyExerciseRecord, superset: boolean): string {
  const tags = [ex.note, superset ? 'superset' : null].filter(Boolean).join(', ')
  const label = tags ? `${ex.name} (${tags})` : ex.name
  return `  ${label}: ${ex.sets.map((set) => hypertrophySetStr(set, ex.weightOptional)).join(' · ')}`
}

function olyExerciseLine(ex: OlyExerciseRecord): string {
  const label = ex.note ? `${ex.name} — ${ex.note}` : ex.name
  const weight = ex.weight != null ? `${kg(ex.weight)}kg` : '—'
  return `  ${label}: ${weight} ${ex.quality || '—'}`
}

// `accessory` = the per-cycle grid for the SESSION'S macro (cycle -> item -> weight);
// resolves the carry weight. `weights` = the same macro's working-weight grid —
// resolves the secondary's ladder + the weighted pull-up ladder. `capability` =
// this session's Hypertrophy/Oly log tables + the athlete's movement library —
// omitted (e.g. minimal test fixtures), Hypertrophy/Oly still render full
// exercise structure with "—" placeholders for anything not logged (see
// capabilityRecordFor); Carries needs none of it, it reads straight off `s`.
export function sessionSummary(
  s: Session,
  macroNumber: number,
  accessory?: AccessoryByCycle,
  weights?: WeightsByCycle,
  deloadWeek?: boolean,
  giantAccessory?: GiantAccessoryReps,
  capability?: CapabilityLogs
): string {
  const lines: string[] = []

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
  // The main lift's weight comes off ITS OWN day-top at the volume difficulty
  // (the `weights` grid — same source Today reads), never off s.topWeight
  // (that's the GIANT block's day-top, at a potentially different difficulty).
  if (s.volumeDifficulty) {
    const scheme = SCHEMES[s.volumeDifficulty]
    const volMainTop = s.dayType && s.cycle != null ? weights?.[s.cycle]?.[s.dayType]?.[s.volumeDifficulty] ?? null : null
    const rx = `2×${scheme.vol}${volMainTop != null ? ` @ ${kg(volumeWeight(volMainTop))}` : ''}`
    lines.push(`Volume Block: ${seg(rx, rpeStr(s.volRpe), arrow(s.volSpeed), s.volDone === false ? 'incomplete' : '')}`)
    // The secondary shares the Volume block (80% of ITS day top, off the Volume difficulty).
    const volLaneTop = laneKey && s.cycle != null ? weights?.[s.cycle]?.[laneKey]?.[s.volumeDifficulty] ?? null : null
    if (laneKey && secondary) {
      lines.push(`  ${secondary.name}: 2×${scheme.vol}${volLaneTop != null ? ` @ ${kg(volumeWeight(volLaneTop))}` : ''}`)
    }
  } else if (s.weekType === 'training') {
    lines.push('Volume Block: none this week (C3 week 4)')
  }

  // ---- Capability block — content dispatched by the ACTIVE CYCLE's program,
  // read from the single source of truth (capabilityRecordFor), never
  // re-decided here. Exactly one program renders per training-week session;
  // a session with no real cycle (the scheduled deload, cycle null) gets
  // none of these — matching the live app, which never renders a Capability
  // block there either.
  const capRecord = capabilityRecordFor(s, capability, accessory)
  if (capRecord?.program === 'hypertrophy') {
    lines.push('Hypertrophy:')
    for (const group of capRecord.groups) {
      const superset = group.length > 1
      for (const ex of group) lines.push(hypertrophyExerciseLine(ex, superset))
    }
  } else if (capRecord?.program === 'oly') {
    lines.push(`Oly:${capRecord.positionGuidance ? ` ${capRecord.positionGuidance}` : ''}`)
    for (const ex of capRecord.exercises) lines.push(olyExerciseLine(ex))
  } else if (capRecord?.program === 'carries') {
    if (capRecord.skipped) {
      lines.push(`Carry: ${capRecord.name} — skipped${capRecord.skipReason ? ` (${capRecord.skipReason})` : ''}`)
    } else if (capRecord.rounds != null || capRecord.distance != null || capRecord.rpe) {
      const rounds = capRecord.rounds ?? '—'
      const dist = capRecord.distance != null ? `${capRecord.distance}m` : '—'
      lines.push(`Carry: ${seg(`${capRecord.name} ${capRecord.load}`, `${rounds}×${dist}`, rpeStr(capRecord.rpe))}`)
    }
  }

  // Duration (omitted when untimed).
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)

  // Notes (omitted when empty).
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)

  return lines.join('\n')
}
