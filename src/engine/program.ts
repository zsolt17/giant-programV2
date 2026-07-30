// The program: which movement occupies which slot, versioned by date.
//
// THE INVARIANT: every slot is keyed by its POSITION, never by its occupant.
// This is the carry-key discipline (`carry_<day>` — "reassigning an implement
// doesn't move the key") generalised to everything. So:
//   · `sessions.day_type` stays deadlift|ohp|squat|bench forever — a LANE key,
//     not a movement name. Session ids never change shape.
//   · `working_weights.lift` values are lane keys too: `db_row` stays `db_row`
//     even if a different movement comes to occupy that lane.
//   · Anything needing a NAME reads it off the movement; anything needing
//     IDENTITY reads the key.
//
// SLOTS AND THEIR CONTRACTS ARE CODE (this file). Only the OCCUPANTS are data
// (program_slots rows pointing at movements). That split is deliberate: the
// shape of a session is program design, not user content.
//
// EDITING IS EFFECTIVE-DATED, NEVER RETROACTIVE. A session resolves the version
// that was live on its date, so history renders as it was lived — the same
// guarantee GIANTFIT_START_DATE gives today, parameterised. Version 1 is seeded
// at GIANTFIT_START_DATE, so every already-logged GiantFit session resolves to
// exactly what it lived; pre-cutover dates resolve to NO version and keep the
// legacy render path untouched.
//
// Pure module: no imports from data/ or ui/.
import type { Lift, CapacityVariant } from './types'
import type { Movement, SlotContract } from './movements'
import { validateOccupant } from './movements'

// ---- the slot inventory ------------------------------------------------------

// The four strength days. These are lane keys — identical to sessions.day_type.
export const PROGRAM_DAYS: Lift[] = ['deadlift', 'ohp', 'squat', 'bench']

// ANCHORED LANES — the fixed grid. These keys ARE the working_weights.lift
// values, so an anchor follows its LANE, not its occupant: swap the movement in
// `db_row` and the per-cycle anchor stays with the lane.
export const MAIN_LANES: Record<Lift, string> = {
  deadlift: 'deadlift',
  ohp: 'ohp',
  squat: 'squat',
  bench: 'bench',
  dips: 'dips', // legacy Giant-era lane — never scheduled post-cutover
}
// The day's secondary lane. OHP/bench carry the anchored rows today; DL and
// squat have a lane that exists but is deliberately EMPTY (nullable).
// This supersedes GIANTFIT_ROW as a lookup: day -> its secondary LANE key.
export const SECONDARY_LANES: Partial<Record<Lift, string>> = {
  deadlift: 'secondary_deadlift',
  ohp: 'db_row',
  squat: 'secondary_squat',
  bench: 'pendlay_row',
}
// Every anchored lane key, in grid order.
export const ANCHORED_LANES: string[] = [
  'deadlift',
  'ohp',
  'squat',
  'bench',
  'db_row',
  'pendlay_row',
  'secondary_deadlift',
  'secondary_squat',
]

// VARIABLE-COUNT SLOT GROUPS — rows carry an order_index and can be freely
// added, removed and reordered within the group.
export const gbAccessoryGroup = (day: Lift): string => `gb_accessory.${day}`
export const capacityGroup = (variant: CapacityVariant): string => `capacity.${variant}`
export const carrySlot = (day: Lift): string => `carry.${day}`
export const ACTIVATION_GROUP = 'activation'
export const BULLETPROOF_GROUP = 'bulletproof'

// ---- contracts ---------------------------------------------------------------
// What each slot will accept. A version is publishable only when every occupant
// satisfies its slot's contract.

function buildContracts(): Record<string, SlotContract> {
  const c: Record<string, SlotContract> = {}
  // Giant Block main: required, anchored, counted in reps.
  for (const day of PROGRAM_DAYS) {
    c[MAIN_LANES[day]] = { label: `${day} — Giant Block main`, loadTypes: ['anchored'], countTypes: ['reps'] }
  }
  // Secondary lanes: anchored, and NULLABLE — a day may train alone (DL, squat).
  for (const day of PROGRAM_DAYS) {
    const lane = SECONDARY_LANES[day]
    if (lane) c[lane] = { label: `${day} — secondary`, loadTypes: ['anchored'], countTypes: ['reps'], nullable: true }
  }
  // Giant Block accessories: bodyweight or unloaded, rep-countable, variable count.
  for (const day of PROGRAM_DAYS) {
    c[gbAccessoryGroup(day)] = {
      label: `${day} — Giant Block accessory`,
      loadTypes: ['bodyweight', 'none'],
      countTypes: ['reps', 'reps_per_side', 'time_seconds'],
      variable: true,
    }
  }
  // Capacity circuits: any count type, and a recorded load is allowed.
  for (const v of ['A', 'B'] as CapacityVariant[]) {
    c[capacityGroup(v)] = { label: `Capacity ${v}`, loadTypes: ['recorded', 'bodyweight', 'none'], variable: true }
  }
  // Carries: exactly one recorded implement per day — NOT variable.
  for (const day of PROGRAM_DAYS) {
    c[carrySlot(day)] = { label: `${day} — carry`, loadTypes: ['recorded'] }
  }
  // Warm-up activation and the post-run Bulletproof circuit: unloaded, variable.
  c[ACTIVATION_GROUP] = { label: 'Warm-up activation', loadTypes: ['none'], variable: true }
  c[BULLETPROOF_GROUP] = { label: 'Bulletproof circuit', loadTypes: ['none'], variable: true }
  return c
}

export const SLOT_CONTRACTS: Record<string, SlotContract> = buildContracts()

export function contractFor(slotKey: string): SlotContract | undefined {
  return SLOT_CONTRACTS[slotKey]
}

// ---- the stored shapes -------------------------------------------------------

export interface ProgramVersion {
  id: string
  number: number
  effectiveFrom: string // ISO date; the version is live from this day on
  note: string | null
}

export interface ProgramSlot {
  id?: string
  versionId: string
  slotKey: string
  orderIndex: number
  movementId: string | null // null = the lane is deliberately empty
  reps: number | null
  rounds: number | null // capacity only
  optional: boolean // the Bulletproof tail's "optional" tag
}

// ---- validation --------------------------------------------------------------

export interface SlotViolation {
  slotKey: string
  orderIndex: number
  reason: string
}

// Every contract violation in a version (empty = publishable). Unknown slot keys
// are violations too: a slot that isn't in the registry can never be rendered.
export function validateVersion(slots: ProgramSlot[], movements: Movement[]): SlotViolation[] {
  const byId = new Map(movements.map((m) => [m.id, m]))
  const out: SlotViolation[] = []
  const seen = new Set<string>()

  for (const s of slots) {
    const contract = SLOT_CONTRACTS[s.slotKey]
    if (!contract) {
      out.push({ slotKey: s.slotKey, orderIndex: s.orderIndex, reason: `Unknown slot "${s.slotKey}"` })
      continue
    }
    seen.add(s.slotKey)
    const reason = validateOccupant(contract, s.movementId ? byId.get(s.movementId) : null)
    if (reason) out.push({ slotKey: s.slotKey, orderIndex: s.orderIndex, reason })
  }

  // Required, non-variable slots must be present at all: an absent Giant Block
  // main is as broken as an empty one.
  for (const [slotKey, contract] of Object.entries(SLOT_CONTRACTS)) {
    if (contract.variable || contract.nullable || seen.has(slotKey)) continue
    out.push({ slotKey, orderIndex: 0, reason: `${contract.label} has no movement assigned` })
  }
  return out
}

// ---- the resolver ------------------------------------------------------------
// Pure: given the stored versions/slots/movements, produce the program that was
// live on a date, in the same shape the constants expose today.

// One resolved occupant: the movement plus the numbers its slot carries.
export interface ResolvedItem {
  slotKey: string
  orderIndex: number
  movement: Movement
  reps: number | null // the slot's override, else the movement's default
  rounds: number | null // capacity only
  optional: boolean
}

export interface ResolvedProgram {
  version: ProgramVersion
  mainFor: (day: Lift) => ResolvedItem | null
  secondaryFor: (day: Lift) => ResolvedItem | null
  accessoriesFor: (day: Lift) => ResolvedItem[]
  capacityFor: (variant: CapacityVariant) => ResolvedItem[]
  carryFor: (day: Lift) => ResolvedItem | null
  activation: () => ResolvedItem[]
  bulletproof: () => ResolvedItem[]
}

// The version live on a date: the greatest effective_from that is <= the date,
// or null when the date precedes every version (pre-cutover dates land here and
// keep the legacy render path). Local-date math throughout — never UTC.
export function versionForDate(versions: ProgramVersion[], dateISO: string, parseLocal: (iso: string) => Date): ProgramVersion | null {
  if (!dateISO) return null
  const target = parseLocal(dateISO).getTime()
  let best: ProgramVersion | null = null
  for (const v of versions || []) {
    if (!v?.effectiveFrom) continue
    const t = parseLocal(v.effectiveFrom).getTime()
    if (t > target) continue
    if (!best || t > parseLocal(best.effectiveFrom).getTime()) best = v
  }
  return best
}

// Build the resolved program for one version. Slots whose movement is unknown or
// ARCHIVED are skipped — mirroring mergeCapacityConfig's "unknown keys are
// dropped on read" rule, so retiring content can never crash a render.
export function resolveProgram(version: ProgramVersion, slots: ProgramSlot[], movements: Movement[]): ResolvedProgram {
  const byId = new Map(movements.map((m) => [m.id, m]))
  const byKey = new Map<string, ResolvedItem[]>()

  for (const s of (slots || []).filter((s) => s.versionId === version.id)) {
    if (!s.movementId) continue // a deliberately empty lane resolves to nothing
    const movement = byId.get(s.movementId)
    if (!movement || movement.archived) continue
    const list = byKey.get(s.slotKey) || []
    list.push({
      slotKey: s.slotKey,
      orderIndex: s.orderIndex,
      movement,
      reps: s.reps ?? movement.defaultReps ?? null,
      rounds: s.rounds ?? null,
      optional: !!s.optional,
    })
    byKey.set(s.slotKey, list)
  }
  for (const list of byKey.values()) list.sort((a, b) => a.orderIndex - b.orderIndex)

  const one = (slotKey: string): ResolvedItem | null => (byKey.get(slotKey) || [])[0] ?? null
  const many = (slotKey: string): ResolvedItem[] => byKey.get(slotKey) || []

  return {
    version,
    mainFor: (day) => one(MAIN_LANES[day]),
    secondaryFor: (day) => {
      const lane = SECONDARY_LANES[day]
      return lane ? one(lane) : null
    },
    accessoriesFor: (day) => many(gbAccessoryGroup(day)),
    capacityFor: (variant) => many(capacityGroup(variant)),
    carryFor: (day) => one(carrySlot(day)),
    activation: () => many(ACTIVATION_GROUP),
    bulletproof: () => many(BULLETPROOF_GROUP),
  }
}

// ---- seeding version 1 -------------------------------------------------------
// Version 1 reproduces TODAY's program exactly: the hardcoded occupants, with
// the athlete's own numbers where they've set them. Pure and DB-free so the
// parity test can build it without a database.

// Which seeded movement fills each carry lane. The lane is keyed by DAY; the
// implement is the occupant — swapping it never moves the recorded weight.
export const SEED_CARRY_KEYS: Record<string, string> = {
  deadlift: 'carry_farmers',
  ohp: 'carry_overhead',
  squat: 'carry_bearhug',
  bench: 'carry_suitcase',
}
// Which seeded movement fills each anchored lane. The two secondary lanes for DL
// and Squat are deliberately EMPTY — the lane exists, nothing occupies it.
export const SEED_LANE_KEYS: Record<string, string | null> = {
  deadlift: 'deadlift',
  ohp: 'ohp',
  squat: 'squat',
  bench: 'bench',
  db_row: 'db_row',
  pendlay_row: 'pendlay_row',
  secondary_deadlift: null,
  secondary_squat: null,
}

// The athlete's live numbers, so seeding preserves them verbatim.
export interface SeedNumbers {
  // giant_accessory_config: movement key -> rep target
  gbAccessoryReps?: Record<string, number>
  // capacity_config: variant -> movement key -> reps
  capacityReps?: Partial<Record<CapacityVariant, Record<string, number | null>>>
  // capacity_settings.rounds (a group-level value; stamped on each group's first row)
  capacityRounds?: number | null
  // Giant Block accessory occupancy: day -> movement key (from GIANTFIT_GB_ACCESSORY)
  gbAccessoryKeys?: Partial<Record<Lift, string>>
  // Ordered capacity circuits: variant -> movement keys
  capacityKeys?: Record<CapacityVariant, string[]>
  activationKeys?: string[]
  bulletproofKeys?: string[]
  optionalKeys?: string[]
}

// Build every slot row for a fresh version 1. Movement keys resolve to ids via
// the user's library; a key with no movement is skipped rather than guessed.
export function buildSeedSlots(versionId: string, movements: Movement[], n: SeedNumbers): ProgramSlot[] {
  const idOf = (key: string): string | null => movements.find((m) => m.key === key)?.id ?? null
  const slots: ProgramSlot[] = []
  const push = (slotKey: string, orderIndex: number, movementKey: string | null, reps: number | null, rounds: number | null = null, optional = false) => {
    const movementId = movementKey ? idOf(movementKey) : null
    if (movementKey && !movementId) return // unknown key: skip, never invent
    slots.push({ versionId, slotKey, orderIndex, movementId, reps, rounds, optional })
  }

  // Anchored lanes — reps are per-difficulty (SCHEMES / GIANTFIT_ROW_REPS), so
  // no single rep value lives on the slot.
  for (const lane of ANCHORED_LANES) push(lane, 0, SEED_LANE_KEYS[lane] ?? null, null)

  // Giant Block accessories — one per day, the athlete's rep target if set.
  for (const day of PROGRAM_DAYS) {
    const key = n.gbAccessoryKeys?.[day]
    if (!key) continue
    push(gbAccessoryGroup(day), 0, key, n.gbAccessoryReps?.[key] ?? null)
  }

  // Capacity circuits — the athlete's per-movement reps; rounds is a GROUP
  // property, so it rides the group's first row.
  for (const v of ['A', 'B'] as CapacityVariant[]) {
    const keys = n.capacityKeys?.[v] || []
    keys.forEach((key, i) => push(capacityGroup(v), i, key, n.capacityReps?.[v]?.[key] ?? null, i === 0 ? (n.capacityRounds ?? null) : null))
  }

  // Carries — one implement per day lane.
  for (const day of PROGRAM_DAYS) push(carrySlot(day), 0, SEED_CARRY_KEYS[day] ?? null, null)

  // Warm-up activation and the Bulletproof circuit — ordered lists; reps fall
  // back to each movement's default.
  ;(n.activationKeys || []).forEach((key, i) => push(ACTIVATION_GROUP, i, key, null))
  ;(n.bulletproofKeys || []).forEach((key, i) => push(BULLETPROOF_GROUP, i, key, null, null, (n.optionalKeys || []).includes(key)))

  return slots
}
