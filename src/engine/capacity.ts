// GiantFit capacity block — static content + config helpers.
// Two fixed circuit variants (A/B), 7 movements each, performed for 3 or 4
// rounds. The definitions here (names, order, which movements are loaded,
// default rep targets) are app content and never persisted; the user's editable
// numbers (rep target, weight, rounds) live in capacity_config /
// capacity_settings and are merged over these defaults on read.
// Content evolves: a retired movement is simply removed from the list below —
// its stored capacity_config rows stay in the DB and are IGNORED on read
// (mergeCapacityConfig drops unknown keys), and capacity_logs never reference a
// movement key at all, so every historical result keeps rendering unchanged.
import type { CapacityVariant, CapacityConfig, CapacityMovementConfig, CapacityMovementsConfig, CapacityLog, Session } from './types'

export interface CapacityMovementDef {
  key: string // stable id — capacity_config.movement_key
  name: string
  reps: number // default rep target (or seconds for timed movements)
  repUnit?: string // display suffix: '/leg', '/side', 'sec', … (plain reps when absent; '/'-prefixed units read as per-limb)
  note?: string // short prescription note shown with the name
  loaded?: boolean // has an editable weight (kg)
  loadOptional?: boolean // loaded, but bodyweight is a valid prescription
  calories?: boolean // timed cal effort (Bike) — feeds capacity_logs.calories
}

export const CAPACITY_ROUNDS_OPTIONS = [3, 4] as const
export const CAPACITY_ROUNDS_DEFAULT = 3
export const CAPACITY_VARIANTS: CapacityVariant[] = ['A', 'B']

// Ordered movement lists — the circuit is performed top to bottom.
export const CAPACITY_MOVEMENTS: Record<CapacityVariant, CapacityMovementDef[]> = {
  A: [
    { key: 'db_snatch', name: 'DB Snatch', reps: 4, repUnit: '/side', loaded: true },
    { key: 'pullups', name: 'Pull-ups', reps: 6 },
    { key: 'dips', name: 'Dips', reps: 8 },
    { key: 'reverse_lunges', name: 'Reverse Lunges', reps: 8, repUnit: '/leg', loaded: true, loadOptional: true },
    { key: 'goblet_curl', name: 'Goblet Curl', reps: 10, loaded: true },
    { key: 'double_unders', name: 'Double Unders', reps: 20 },
    { key: 'box_over_burpees', name: 'Box-over Burpees', reps: 8 },
  ],
  B: [
    { key: 'hang_bb_snatch', name: 'Hang BB Snatch', reps: 5, loaded: true },
    { key: 'chinups', name: 'Chin-ups', reps: 6 },
    { key: 'pushups', name: 'Push-ups', reps: 12 },
    { key: 'walking_lunges', name: 'Walking Lunges', reps: 10, repUnit: '/leg', loaded: true, loadOptional: true },
    { key: 'bb_curl', name: 'BB Curl', reps: 10, loaded: true },
    { key: 'double_unders', name: 'Double Unders', reps: 20 },
    { key: 'bike', name: 'Bike', reps: 30, repUnit: 'sec', note: 'for calories', calories: true },
  ],
}

export function movementDef(variant: CapacityVariant, key: string): CapacityMovementDef | undefined {
  return CAPACITY_MOVEMENTS[variant].find((m) => m.key === key)
}

// The all-defaults config (what a fresh user sees): every movement present with
// its default rep target and no weight set.
export function defaultCapacityConfig(): CapacityConfig {
  const movements = {} as CapacityMovementsConfig
  for (const v of CAPACITY_VARIANTS) {
    movements[v] = {}
    for (const m of CAPACITY_MOVEMENTS[v]) movements[v][m.key] = { reps: m.reps, weight: null }
  }
  return { rounds: CAPACITY_ROUNDS_DEFAULT, movements }
}

// ---- capacity time trend (Trends readout ONLY) ------------------------------
// This series is a chart, not a signal. The time-based S6 was retired
// (2026-07-31): per-round time in a 7-movement circuit with no time cap is
// dominated by transitions and equipment availability, so the old ×1.15
// threshold sat inside the noise floor, and the rolling same-variant baseline
// took ~3 weeks to earn and reset on any circuit edit. Fatigue attribution now
// comes from the athlete at log time (capacity_logs.completion — see the deload
// rule's S6). Good enough to look at; not good enough to fire a trigger.

// One completed capacity session as a trend point, ordered by session date.
export interface CapacityPoint {
  sessionId: string
  date: string
  variant: CapacityVariant
  perRoundS: number // total_time_seconds / rounds_completed — normalizes short sessions
}

// Per-round seconds for one log; null unless time + rounds are both usable.
// Fewer-than-target rounds still count — per-round time normalizes for rounds.
export function perRoundSeconds(log: CapacityLog): number | null {
  if (log.totalTimeSeconds == null || log.roundsCompleted == null || log.roundsCompleted <= 0) return null
  return log.totalTimeSeconds / log.roundsCompleted
}

// The capacity series: join logs to their sessions, drop incomplete logs (and
// anything an optional predicate excludes), order by session date. Deload weeks
// carry no capacity block at all (ARCHITECTURE §2.8), so there is nothing to
// exclude for signal purposes — the predicate stays only as a general filter.
export function buildCapacityPoints(logs: CapacityLog[], sessions: Session[], isExcluded?: (s: Session) => boolean): CapacityPoint[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  return (logs || [])
    .map((log) => {
      const s = byId.get(log.sessionId)
      const perRoundS = perRoundSeconds(log)
      if (!s || perRoundS == null || (isExcluded && isExcluded(s))) return null
      return { sessionId: log.sessionId, date: s.date, variant: log.variant, perRoundS }
    })
    .filter((p): p is CapacityPoint => p != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sessionId < b.sessionId ? -1 : 1))
}

// Merge stored per-movement values over the defaults. Unknown stored keys are
// ignored (content evolves app-side); a null stored rep target falls back to
// the movement's default.
export function mergeCapacityConfig(
  stored: Partial<Record<CapacityVariant, Record<string, CapacityMovementConfig>>>,
  rounds?: number | null
): CapacityConfig {
  const cfg = defaultCapacityConfig()
  if (rounds != null && (CAPACITY_ROUNDS_OPTIONS as readonly number[]).includes(rounds)) cfg.rounds = rounds
  for (const v of CAPACITY_VARIANTS) {
    for (const key of Object.keys(stored[v] || {})) {
      if (!cfg.movements[v][key]) continue
      const s = (stored[v] as Record<string, CapacityMovementConfig>)[key]
      if (s.reps != null) cfg.movements[v][key].reps = s.reps
      if (s.weight != null) cfg.movements[v][key].weight = s.weight
    }
  }
  return cfg
}
