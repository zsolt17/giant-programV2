// The movement library — program CONTENT as data.
//
// Every exercise the program can prescribe lives here as a movement with two
// capabilities: how it is LOADED and how it is COUNTED. Slots (engine/program.ts)
// declare a contract; a movement either satisfies it or it doesn't. This is what
// lets an exercise change from the UI instead of from code.
//
// THE INVARIANT this serves: a slot is keyed by its POSITION, never by its
// occupant (the carry-key rule — `carry_<day>` — generalised). So `db_row` names
// a lane, not a movement; `sessions.day_type` names a lane, not a lift. Anything
// needing a NAME reads it off the movement; anything needing IDENTITY reads the key.
//
// Pure module: no imports from data/ or ui/.
import type { CapacityVariant } from './types'

export const LOAD_TYPES = ['anchored', 'recorded', 'bodyweight', 'none'] as const
export type LoadType = (typeof LOAD_TYPES)[number]

export const COUNT_TYPES = ['reps', 'reps_per_side', 'time_seconds', 'calories', 'distance'] as const
export type CountType = (typeof COUNT_TYPES)[number]

export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  anchored: 'Anchored (per-cycle Hard top)',
  recorded: 'Recorded weight',
  bodyweight: 'Bodyweight',
  none: 'No load',
}
export const COUNT_TYPE_LABEL: Record<CountType, string> = {
  reps: 'Reps',
  reps_per_side: 'Reps per side',
  time_seconds: 'Time (seconds)',
  calories: 'Calories',
  distance: 'Distance',
}

// One movement in the library. `key` is the stable identity (immutable once
// created); `name` is display only and freely editable.
export interface Movement {
  id?: string
  key: string
  name: string
  loadType: LoadType
  countType: CountType
  defaultReps: number | null
  repUnit: string | null
  note: string | null
  archived: boolean
}

// The code-side seed: what a fresh user's library starts as. Derived 1:1 from
// today's hardcoded content so the seeded program reproduces it exactly.
export type MovementSeed = Omit<Movement, 'id' | 'archived'> & { archived?: boolean }

// ---- display -----------------------------------------------------------------

// THE existing display join rule, unchanged: '/'-prefixed units join tight
// ("4/side", "8/leg"), word units keep a single space ("30 sec"), no unit = the
// bare count. Stored units may or may not carry a leading space — both normalise
// to exactly one, so output is character-for-character what the app renders today.
export function formatCount(reps: number | null | undefined, m: Pick<Movement, 'repUnit'>): string {
  if (reps == null || !Number.isFinite(reps)) return '—'
  const unit = (m.repUnit || '').trim()
  if (!unit) return String(reps)
  return unit.startsWith('/') ? `${reps}${unit}` : `${reps} ${unit}`
}

// ---- slot contracts ----------------------------------------------------------

// What a slot will accept. The registry that maps slot keys to contracts is
// code and lands in engine/program.ts; this is the shape it uses.
export interface SlotContract {
  label: string
  loadTypes: LoadType[] // allowed load capabilities
  countTypes?: CountType[] // allowed count capabilities (omitted = any)
  nullable?: boolean // the slot may be deliberately empty
  variable?: boolean // a group: rows carry an order_index, freely added/reordered
}

// null = the movement satisfies the contract; otherwise a human-readable reason.
export function validateOccupant(contract: SlotContract, movement: Movement | null | undefined): string | null {
  if (!movement) return contract.nullable ? null : `${contract.label} needs a movement`
  if (movement.archived) return `${movement.name} is archived`
  if (!contract.loadTypes.includes(movement.loadType)) {
    const allowed = contract.loadTypes.map((l) => LOAD_TYPE_LABEL[l]).join(' or ')
    return `${contract.label} needs ${allowed} — ${movement.name} is ${LOAD_TYPE_LABEL[movement.loadType]}`
  }
  if (contract.countTypes && !contract.countTypes.includes(movement.countType)) {
    const allowed = contract.countTypes.map((c) => COUNT_TYPE_LABEL[c]).join(' or ')
    return `${contract.label} is counted in ${allowed} — ${movement.name} is counted in ${COUNT_TYPE_LABEL[movement.countType]}`
  }
  return null
}

// Auto-slug for a new movement's key: lowercase, non-alphanumerics to '_'.
// Applied once on create — the key is the identity and never changes after.
export function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

// ---- the seed library --------------------------------------------------------
// Grouped by where each movement is used TODAY. Capabilities mirror current
// behaviour exactly; the Phase 2 slot seed places these into lanes.

// The six anchored lifts (ANCHOR_LIFTS / ANCHOR_LABEL / ANCHOR_NOTE).
const ANCHORED: MovementSeed[] = [
  { key: 'deadlift', name: 'Deadlift', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
  { key: 'ohp', name: 'Overhead Press', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
  { key: 'squat', name: 'Back Squat', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
  { key: 'bench', name: 'Bench Press', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
  // The anchored rows: reps are fixed per difficulty (GIANTFIT_ROW_REPS), so no
  // single default here. The DB Row's anchor is entered per hand (was ANCHOR_NOTE).
  { key: 'db_row', name: 'DB Row', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: 'per hand' },
  { key: 'pendlay_row', name: 'Pendlay Row', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
]

// The four carry implements (DAY_META[day].carry). Recorded per-cycle weight;
// the logged number is distance, so they count in distance.
const CARRIES: MovementSeed[] = [
  { key: 'carry_farmers', name: "Farmer's Carry", loadType: 'recorded', countType: 'distance', defaultReps: null, repUnit: null, note: 'per hand' },
  { key: 'carry_overhead', name: 'Overhead Carry', loadType: 'recorded', countType: 'distance', defaultReps: null, repUnit: null, note: 'per hand' },
  { key: 'carry_bearhug', name: 'Sandbag Bear Hug', loadType: 'recorded', countType: 'distance', defaultReps: null, repUnit: null, note: null },
  { key: 'carry_suitcase', name: 'Suitcase Carry', loadType: 'recorded', countType: 'distance', defaultReps: null, repUnit: null, note: 'per hand' },
]

// Giant Block bodyweight accessories (GIANTFIT_GB_ACCESSORY) — rep-only, default 10.
const GB_ACCESSORIES: MovementSeed[] = [
  { key: 'ab_rollout', name: 'Ab Rollout', loadType: 'bodyweight', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
  { key: 'toes_to_bar', name: 'Toes-to-Bar', loadType: 'bodyweight', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
  { key: 'ghd_abs', name: 'GHD Abs', loadType: 'bodyweight', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
  { key: 'ghd_back_ext', name: 'GHD Back Extension', loadType: 'bodyweight', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
]

// Capacity circuits (CAPACITY_MOVEMENTS). `loaded` movements → recorded; the
// rest → bodyweight. Count types and units are exactly as they render today.
// Double Unders is shared by BOTH variants — one library entry, two slots.
const CAPACITY: MovementSeed[] = [
  { key: 'db_snatch', name: 'DB Snatch', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 4, repUnit: '/side', note: null },
  { key: 'pullups', name: 'Pull-ups', loadType: 'bodyweight', countType: 'reps', defaultReps: 6, repUnit: null, note: null },
  { key: 'dips', name: 'Dips', loadType: 'bodyweight', countType: 'reps', defaultReps: 8, repUnit: null, note: null },
  { key: 'reverse_lunges', name: 'Reverse Lunges', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 8, repUnit: '/leg', note: 'weight optional' },
  { key: 'goblet_curl', name: 'Goblet Curl', loadType: 'recorded', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
  { key: 'double_unders', name: 'Double Unders', loadType: 'bodyweight', countType: 'reps', defaultReps: 20, repUnit: null, note: null },
  { key: 'box_over_burpees', name: 'Box-over Burpees', loadType: 'bodyweight', countType: 'reps', defaultReps: 8, repUnit: null, note: null },
  { key: 'hang_bb_snatch', name: 'Hang BB Snatch', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: null },
  { key: 'chinups', name: 'Chin-ups', loadType: 'bodyweight', countType: 'reps', defaultReps: 6, repUnit: null, note: null },
  { key: 'pushups', name: 'Push-ups', loadType: 'bodyweight', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'walking_lunges', name: 'Walking Lunges', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 10, repUnit: '/leg', note: 'weight optional' },
  { key: 'bb_curl', name: 'BB Curl', loadType: 'recorded', countType: 'reps', defaultReps: 10, repUnit: null, note: null },
  { key: 'bike', name: 'Bike', loadType: 'bodyweight', countType: 'calories', defaultReps: 30, repUnit: 'sec', note: 'for calories' },
]

// Warm-up activation (GIANTFIT_ACTIVATION). No load. Each dose COMPOSES from
// reps + unit at render time ("×" + formatCount), so no free-text is needed.
const ACTIVATION: MovementSeed[] = [
  { key: 'band_pull_aparts', name: 'Band pull-aparts', loadType: 'none', countType: 'reps', defaultReps: 20, repUnit: null, note: null },
  { key: 'face_pulls', name: 'Face pulls', loadType: 'none', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'hip_airplanes', name: 'Hip airplanes', loadType: 'none', countType: 'reps_per_side', defaultReps: 5, repUnit: '/side', note: null },
  { key: 'deep_squat_hold', name: 'Deep squat hold', loadType: 'none', countType: 'time_seconds', defaultReps: 30, repUnit: 'sec', note: null },
  { key: 'thoracic_rotations', name: 'Thoracic rotations', loadType: 'none', countType: 'reps_per_side', defaultReps: 5, repUnit: '/side', note: null },
]

// Post-run Bulletproof circuit (BULLETPROOF_ITEMS). No load. These doses are
// COMPOUND ("2×15 straight-knee + 1×12 bent-knee (off a step)") and cannot be
// composed from a single number — so the verbatim dose lives in `note` and
// defaultReps stays null. That's what keeps the rendered circuit byte-identical.
const BULLETPROOF: MovementSeed[] = [
  { key: 'calf_raises', name: 'Calf raises, slow 3-sec eccentric', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '2×15 straight-knee + 1×12 bent-knee (off a step)' },
  { key: 'tibialis_raises', name: 'Tibialis raises', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '2×20 (wall-supported)' },
  { key: 'single_leg_balance', name: 'Single-leg balance', loadType: 'none', countType: 'time_seconds', defaultReps: null, repUnit: null, note: '30–45s per side' },
  { key: 'seated_leg_raises', name: 'Seated leg raises over obstacle', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '2×12–15 per side' },
  { key: 'plantar_rolling', name: 'Plantar rolling', loadType: 'none', countType: 'time_seconds', defaultReps: null, repUnit: null, note: '30s per foot' },
]

// The complete library a fresh user is seeded with.
export const SEED_MOVEMENTS: MovementSeed[] = [...ANCHORED, ...CARRIES, ...GB_ACCESSORIES, ...CAPACITY, ...ACTIVATION, ...BULLETPROOF]

// Which seeded movement occupies each capacity variant's circuit, in order —
// consumed by the Phase 2 slot seed (kept here so the seed's shape lives with
// the seed itself).
export const SEED_CAPACITY_KEYS: Record<CapacityVariant, string[]> = {
  A: ['db_snatch', 'pullups', 'dips', 'reverse_lunges', 'goblet_curl', 'double_unders', 'box_over_burpees'],
  B: ['hang_bb_snatch', 'chinups', 'pushups', 'walking_lunges', 'bb_curl', 'double_unders', 'bike'],
}
export const SEED_ACTIVATION_KEYS: string[] = ACTIVATION.map((m) => m.key)
export const SEED_BULLETPROOF_KEYS: string[] = BULLETPROOF.map((m) => m.key)
// Bulletproof's optional tail (plantar rolling) — the only per-slot flag today.
export const SEED_BULLETPROOF_OPTIONAL: string[] = ['plantar_rolling']

export function seedByKey(key: string): MovementSeed | undefined {
  return SEED_MOVEMENTS.find((m) => m.key === key)
}
