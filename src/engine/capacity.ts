// GiantFit capacity block — static content + config helpers.
// Two fixed circuit variants (A/B), 8 movements each, performed for 3 or 4
// rounds. The definitions here (names, order, which movements are loaded,
// default rep targets) are app content and never persisted; the user's editable
// numbers (rep target, weight, rounds) live in capacity_config /
// capacity_settings and are merged over these defaults on read.
import type { CapacityVariant, CapacityConfig, CapacityMovementConfig, CapacityMovementsConfig } from './types'

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
