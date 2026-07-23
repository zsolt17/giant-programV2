// GiantFit capacity block — static content + config helpers.
// Two fixed circuit variants (A/B), 8 movements each, performed for 3 or 4
// rounds. The definitions here (names, order, which movements are loaded,
// default rep targets) are app content and never persisted; the user's editable
// numbers (rep target, weight, rounds) live in capacity_config /
// capacity_settings and are merged over these defaults on read.
import type { CapacityVariant, CapacityConfig, CapacityMovementConfig, CapacityMovementsConfig, CapacityLog, Session } from './types'

export interface CapacityMovementDef {
  key: string // stable id — capacity_config.movement_key
  name: string
  reps: number // default rep target (or seconds for timed movements)
  repUnit?: string // display suffix: '/leg', 'sec', … (plain reps when absent)
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
    { key: 'db_snatch', name: 'DB Snatch', reps: 8, note: '4/side', loaded: true },
    { key: 'pullups', name: 'Pull-ups', reps: 6 },
    { key: 'dips', name: 'Dips', reps: 8 },
    { key: 'reverse_lunges', name: 'Reverse Lunges', reps: 8, repUnit: '/leg', loaded: true, loadOptional: true },
    { key: 'ghd', name: 'GHD', reps: 10 },
    { key: 'goblet_curl', name: 'Goblet Curl', reps: 10, loaded: true },
    { key: 'single_unders', name: 'Single Unders', reps: 40 },
    { key: 'box_over_burpees', name: 'Box-over Burpees', reps: 8 },
  ],
  B: [
    { key: 'bb_clean', name: 'BB Clean', reps: 6, loaded: true },
    { key: 'chinups', name: 'Chin-ups', reps: 6 },
    { key: 'pushups', name: 'Push-ups', reps: 12 },
    { key: 'walking_lunges', name: 'Walking Lunges', reps: 10, repUnit: '/leg', loaded: true, loadOptional: true },
    { key: 'toes_to_bar', name: 'Toes-to-Bar', reps: 8 },
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

// ---- capacity time trend (shared series: the S6 deload signal now; the
// ---- Trends capacity view consumes the same points in Phase 5) --------------

// S6: a capacity session is SLOW when its per-round time exceeds the rolling
// same-variant average by this factor. Named for easy tuning.
export const S6_THRESHOLD = 1.15
// The rolling average window: the last N completed same-variant sessions.
export const CAPACITY_ROLLING_N = 3

// One completed capacity session as a trend point, ordered by session date.
export interface CapacityPoint {
  sessionId: string
  date: string
  variant: CapacityVariant
  perRoundS: number // total_time_seconds / rounds_completed — normalizes short sessions
  // Per-round time > rolling same-variant avg × S6_THRESHOLD. Always false while
  // the variant lacks a full baseline (cold start: no evaluation until a variant
  // has CAPACITY_ROLLING_N completed sessions before this one).
  slow: boolean
}

// Per-round seconds for one log; null unless time + rounds are both usable.
// Fewer-than-target rounds still count — per-round time normalizes for rounds.
export function perRoundSeconds(log: CapacityLog): number | null {
  if (log.totalTimeSeconds == null || log.roundsCompleted == null || log.roundsCompleted <= 0) return null
  return log.totalTimeSeconds / log.roundsCompleted
}

// Rolling average of the last N same-variant points strictly BEFORE index i.
// Null until that variant has N prior points (the cold-start rule).
export function rollingVariantAvg(points: { variant: CapacityVariant; perRoundS: number }[], i: number, n: number = CAPACITY_ROLLING_N): number | null {
  const prior = points.slice(0, i).filter((p) => p.variant === points[i].variant)
  if (prior.length < n) return null
  const window = prior.slice(-n)
  return window.reduce((sum, p) => sum + p.perRoundS, 0) / window.length
}

// THE shared capacity series: join logs to their sessions, drop incomplete logs
// and excluded sessions (deload weeks — pass a predicate), order by session
// date, and stamp each point's slow flag against its own variant's rolling
// average. Excluded sessions contribute NOTHING — not to evaluation, not to
// the averages — so a deload gap is skipped cleanly.
export function buildCapacityPoints(logs: CapacityLog[], sessions: Session[], isExcluded?: (s: Session) => boolean): CapacityPoint[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const base = (logs || [])
    .map((log) => {
      const s = byId.get(log.sessionId)
      const perRoundS = perRoundSeconds(log)
      if (!s || perRoundS == null || (isExcluded && isExcluded(s))) return null
      return { sessionId: log.sessionId, date: s.date, variant: log.variant, perRoundS }
    })
    .filter((p): p is Omit<CapacityPoint, 'slow'> => p != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sessionId < b.sessionId ? -1 : 1))
  return base.map((p, i) => {
    const avg = rollingVariantAvg(base, i)
    return { ...p, slow: avg != null && p.perRoundS > avg * S6_THRESHOLD }
  })
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
