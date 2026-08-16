// Today-tab card completion — one pure "is this card done" check per block,
// read against each block's OWN actual schema (not a generic "every visible
// field" rule). Shared by the card UI (Giant2SessionForm, CapabilityBlock) so
// the Done-button gate and the collapsed-card checkmark can never disagree —
// both call the same function instead of each re-deriving it.
import { GIANT2_HYPERTROPHY_SETS, GIANT2_WOD_ROUNDS } from './constants'
import { SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS, seedByKey } from './movements'
import type { Lift, SessionDraft, HypertrophyLog, OlyLog, WodLog } from './types'
import type { Movement } from './movements'

const filled = (v: unknown): boolean => v != null && String(v).trim() !== ''

// Primer is checkbox-style, not numeric log entries — the checklist itself is
// local UI state (never persisted item-by-item); primerDone IS the done signal.
export function isPrimerDone(draft: Pick<SessionDraft, 'primerDone'>): boolean {
  return !!draft.primerDone
}

// Cooldown — same shape as Primer (checkbox-style, no numeric fields).
// Optional: nothing gates session completion on it.
export function isCooldownDone(draft: Pick<SessionDraft, 'cooldownDone'>): boolean {
  return !!draft.cooldownDone
}

// Giant Block: the 4-set ladder is prescribed/computed, never user-entered —
// the real loggable fields are the top-set RPE + bar speed, plus (bench day,
// bodyweight-mode Pull-ups only) the final-round cluster.
export function isGiantDone(draft: Pick<SessionDraft, 'rpe' | 'barSpeed' | 'pullupCluster'>, needsCluster: boolean): boolean {
  if (!filled(draft.rpe) || !filled(draft.barSpeed)) return false
  if (needsCluster && !filled(draft.pullupCluster)) return false
  return true
}

// Volume Block: same shape as Giant — one aggregate RPE + bar speed for the
// whole 2-set block (volDone is a pre-ticked checkbox, not a fill-in field).
export function isVolumeDone(draft: Pick<SessionDraft, 'volRpe' | 'volSpeed'>): boolean {
  return filled(draft.volRpe) && filled(draft.volSpeed)
}

// Engine WOD (C3): skipped needs only a reason; otherwise every round needs
// its machine calories (the round's whole point) — carry RPE is optional,
// same as Hypertrophy's per-set RPE is out of its own Done check.
export function isWodDone(draft: Pick<SessionDraft, 'wodSkipped' | 'wodSkipReason'>, logs: WodLog[]): boolean {
  if (draft.wodSkipped) return filled(draft.wodSkipReason)
  for (let round = 1; round <= GIANT2_WOD_ROUNDS; round++) {
    if (!filled(logs.find((l) => l.roundNumber === round)?.machineCalories)) return false
  }
  return true
}

// Hypertrophy (C1): reps + load for every SET (GIANT2_HYPERTROPHY_SETS) of
// every exercise — except a weight-optional movement (e.g. Hip/Back
// Extension), which only needs reps. RPE isn't part of this block's schema.
export function isHypertrophyDone(dayType: Lift, movements: Movement[], logs: HypertrophyLog[]): boolean {
  const keys = SEED_HYPERTROPHY_KEYS[dayType] || []
  for (const key of keys) {
    const seed = seedByKey(key)
    const movementId = movements.find((m) => m.key === key)?.id
    for (let setNumber = 1; setNumber <= GIANT2_HYPERTROPHY_SETS; setNumber++) {
      const log = movementId ? logs.find((l) => l.movementId === movementId && l.setNumber === setNumber) : undefined
      if (!filled(log?.repsDone)) return false
      if (!seed?.weightOptional && !filled(log?.weight)) return false
    }
  }
  return true
}

// Oly (C2): a quality mark (Q1/Q2/Q3) for every exercise — not RPE. Weight
// isn't required: several Oly primer entries are deliberately unloaded.
export function isOlyDone(dayType: Lift, movements: Movement[], logs: OlyLog[]): boolean {
  const keys = SEED_OLY_KEYS[dayType] || []
  for (const key of keys) {
    const movementId = movements.find((m) => m.key === key)?.id
    const log = movementId ? logs.find((l) => l.movementId === movementId) : undefined
    if (!filled(log?.quality)) return false
  }
  return true
}
