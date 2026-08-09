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
import type { CapacityVariant, Lift } from './types'

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

// ---- Giant 2.0 content (from GIANT2_START_DATE) -------------------------------
// Same seeded-per-user, code-side-list discipline as everything above. Ab-Roll
// reuses the existing `ab_rollout` GB_ACCESSORIES entry (same exercise) — no
// duplicate movement for it.

// Anchored: BB Row and Pull-ups occupy the existing db_row/pendlay_row LANES
// (see ANCHORED_LANES in engine/program.ts) — the lane persists, only the
// occupant changes. Pull-ups stays two-mode (engine/loading.ts liftMode):
// a zero/unset anchor renders as bodyweight cluster, any weight as the full
// weighted cascade — reactivated for real use, not just legacy rendering.
const GIANT2_ANCHORED: MovementSeed[] = [
  { key: 'bb_row', name: 'BB Row', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
  { key: 'pullup', name: 'Pull-ups', loadType: 'anchored', countType: 'reps', defaultReps: null, repUnit: null, note: null },
]

// Giant Block bodyweight accessory — Leg Raises (Bench/OHP days). Ab-Roll
// (Squat/Deadlift days) reuses `ab_rollout` above.
const GIANT2_GB_ACCESSORY: MovementSeed[] = [
  { key: 'leg_raises', name: 'Leg Raises', loadType: 'bodyweight', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
]

// Primer block: Rope flow (shared, both day types) + band activation (day-typed)
// + the bodyweight ramp (day-typed, 1-2-3 ascending scheme across 3 rounds —
// GIANT2_PRIMER_RAMP_ROUNDS in constants.ts; tempo not tracked). All unloaded,
// completion-only (no RPE), matching the existing ACTIVATION group's treatment.
const GIANT2_PRIMER: MovementSeed[] = [
  { key: 'rope_flow', name: 'Rope flow', loadType: 'none', countType: 'time_seconds', defaultReps: null, repUnit: null, note: 'flow sequence' },
  { key: 'crossover_symmetry', name: 'Crossover Symmetry', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: 'band activation sequence' },
  { key: 'hip_halo', name: 'Hip Halo', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: 'band activation sequence' },
  { key: 'primer_inverted_row', name: 'Inverted Row', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_pushups', name: 'Push-ups', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_dead_bug', name: 'Dead Bug', loadType: 'none', countType: 'reps_per_side', defaultReps: null, repUnit: '/side', note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_scap_dip', name: 'Support Scap-Dip', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_good_morning', name: 'Good Morning', loadType: 'none', countType: 'reps', defaultReps: null, repUnit: null, note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_reverse_lunges', name: 'Reverse Lunges', loadType: 'none', countType: 'reps_per_side', defaultReps: null, repUnit: '/side', note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_bird_dogs', name: 'Bird Dogs', loadType: 'none', countType: 'reps_per_side', defaultReps: null, repUnit: '/side', note: '1-2-3 ascending, 3 rounds' },
  { key: 'primer_lateral_lunge', name: 'Shallow Lateral Lunge', loadType: 'none', countType: 'reps_per_side', defaultReps: null, repUnit: '/side', note: '1-2-3 ascending, 3 rounds' },
]

// Capability block, C1 — Hypertrophy accessories. Sets are fixed at 3
// (GIANT2_HYPERTROPHY_SETS); defaultReps is the per-set target, 12 unless the
// spec calls for 15 (note left blank — the rep count carries it).
const GIANT2_HYPERTROPHY: MovementSeed[] = [
  { key: 'walking_lunge', name: 'Walking Lunge', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 12, repUnit: '/leg', note: null },
  { key: 'lying_hamstring_curl', name: 'Lying Hamstring Curl', loadType: 'recorded', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'hip_back_extension', name: 'Hip/Back Extension', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: 'weight optional' },
  { key: 'standing_calf_raise', name: 'Standing Calf Raise', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'seated_db_press', name: 'Seated DB Press', loadType: 'recorded', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'one_arm_row', name: 'One-Arm Row', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 12, repUnit: '/side', note: null },
  { key: 'bicep_curl', name: 'Bicep Curl', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'skull_crusher', name: 'Skull Crusher', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'serratus_raise', name: 'Serratus Anterior Raise', loadType: 'recorded', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'ffe_split_squat', name: 'Front-Foot-Elevated Split Squat', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 12, repUnit: '/leg', note: null },
  { key: 'hip_thrust', name: 'Hip Thrust', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'leg_extension', name: 'Leg Extension', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'flat_db_bench', name: 'Flat DB Bench', loadType: 'recorded', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'lat_pulldown_sup', name: 'Lat Pulldown (supinated)', loadType: 'recorded', countType: 'reps', defaultReps: 12, repUnit: null, note: null },
  { key: 'lateral_raise', name: 'Lateral Raise', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: null },
  { key: 'rope_face_pull', name: 'Rope Face Pull', loadType: 'recorded', countType: 'reps', defaultReps: 15, repUnit: null, note: 'seated, to top of head' },
]

// Capability block, C2 — Oly technical work. `note` carries the cluster
// notation (e.g. "2+1") since it can't reduce to one rep number; load is a
// per-lane technical ceiling "found by feel" (recorded), never a percentage
// of a tested max, and never RPE-logged (see OLY_QUALITY, constants.ts).
const GIANT2_OLY: MovementSeed[] = [
  { key: 'oly_snatch_balance_ohs', name: 'Snatch Balance + OHS', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: '3×5, unloaded' },
  { key: 'oly_hang_full_snatch', name: 'Hang Snatch + Full Snatch', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×2+1' },
  { key: 'oly_tall_clean', name: 'Tall Clean', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: '3×5, unloaded' },
  { key: 'oly_hang_power_clean_power_clean', name: 'Hang Power Clean + Power Clean', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×2+1' },
  { key: 'oly_clean_front_squat', name: 'Clean + Front Squat', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×3 (1+2), upper days only' },
  { key: 'oly_muscle_snatch', name: 'Muscle Snatch', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: '3×5, unloaded' },
  { key: 'oly_snatch_high_pull_hang_power_snatch', name: 'Snatch High Pull + Hang Power Snatch', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×2+1' },
  { key: 'oly_tall_jerk', name: 'Tall Jerk', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: '3×5, unloaded' },
  { key: 'oly_push_press_jerk', name: 'Push Press + Jerk', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×2+1' },
  { key: 'oly_split_jerk', name: 'Split Jerk', loadType: 'recorded', countType: 'reps', defaultReps: null, repUnit: null, note: '4-5×3, upper days only' },
]

// The complete library a fresh user is seeded with.
export const SEED_MOVEMENTS: MovementSeed[] = [
  ...ANCHORED,
  ...CARRIES,
  ...GB_ACCESSORIES,
  ...CAPACITY,
  ...ACTIVATION,
  ...BULLETPROOF,
  ...GIANT2_ANCHORED,
  ...GIANT2_GB_ACCESSORY,
  ...GIANT2_PRIMER,
  ...GIANT2_HYPERTROPHY,
  ...GIANT2_OLY,
]

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

// ---- Giant 2.0 seed key lists (day-type/day ordering — consumed by the
// ---- version-2 slot seed, engine/program.ts) ---------------------------------
export const SEED_GIANT2_PRIMER_KEYS: Record<'upper' | 'lower', string[]> = {
  upper: ['rope_flow', 'crossover_symmetry', 'primer_inverted_row', 'primer_pushups', 'primer_dead_bug', 'primer_scap_dip'],
  lower: ['rope_flow', 'hip_halo', 'primer_good_morning', 'primer_reverse_lunges', 'primer_bird_dogs', 'primer_lateral_lunge'],
}
export const SEED_GIANT2_HYPERTROPHY_KEYS: Record<Lift, string[]> = {
  squat: ['walking_lunge', 'lying_hamstring_curl', 'hip_back_extension', 'standing_calf_raise'],
  bench: ['seated_db_press', 'one_arm_row', 'bicep_curl', 'skull_crusher', 'serratus_raise'],
  deadlift: ['ffe_split_squat', 'hip_thrust', 'leg_extension'],
  ohp: ['flat_db_bench', 'lat_pulldown_sup', 'lateral_raise', 'rope_face_pull'],
  dips: [],
}
// Ordered: technical primer, complex, third item (upper days only).
export const SEED_GIANT2_OLY_KEYS: Record<Lift, string[]> = {
  squat: ['oly_snatch_balance_ohs', 'oly_hang_full_snatch'],
  bench: ['oly_tall_clean', 'oly_hang_power_clean_power_clean', 'oly_clean_front_squat'],
  deadlift: ['oly_muscle_snatch', 'oly_snatch_high_pull_hang_power_snatch'],
  ohp: ['oly_tall_jerk', 'oly_push_press_jerk', 'oly_split_jerk'],
  dips: [],
}

export function seedByKey(key: string): MovementSeed | undefined {
  return SEED_MOVEMENTS.find((m) => m.key === key)
}
