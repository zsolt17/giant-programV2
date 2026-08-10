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
// shape of a session is program design, not user content. Still unwired from
// any live session view (those render off engine/constants.ts directly) —
// this stays available for a future content-editable Setup flow.
//
// EDITING IS EFFECTIVE-DATED, NEVER RETROACTIVE. A session resolves the
// version that was live on its date. Version 1 (GiantFit) is retired along
// with its data; the live version is 2 ("Giant 2.0").
//
// Pure module: no imports from data/ or ui/.
import type { Lift } from './types'
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
}
// The day's secondary lane (OHP/bench only — DL and squat train alone).
export const SECONDARY_LANES: Partial<Record<Lift, string>> = {
  ohp: 'db_row',
  bench: 'pendlay_row',
}
// Every anchored lane key, in grid order.
export const ANCHORED_LANES: string[] = ['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row']

// VARIABLE-COUNT SLOT GROUPS — rows carry an order_index and can be freely
// added, removed and reordered within the group.
export const gbAccessoryGroup = (day: Lift): string => `gb_accessory.${day}`
export const carrySlot = (day: Lift): string => `carry.${day}`

// The Capability block's slot inventory changes by CYCLE, not by week or
// session (GIANT2_CAPABILITY_BY_CYCLE, constants.ts) — the slot registry
// itself doesn't need to know about cycles at all.
export type DayType = 'upper' | 'lower'
export const primerGroup = (dayType: DayType): string => `primer.${dayType}`
export const hypertrophyGroup = (day: Lift): string => `capability.hypertrophy.${day}`
export const olyGroup = (day: Lift): string => `capability.oly.${day}`
// Carries (C3) reuse carrySlot(day) above unchanged — same lane, same implement.

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
  // Carries: exactly one recorded implement per day — NOT variable.
  for (const day of PROGRAM_DAYS) {
    c[carrySlot(day)] = { label: `${day} — carry`, loadTypes: ['recorded'] }
  }
  // Primer: rope flow + band activation + bodyweight ramp, day-typed
  // (upper/lower), unloaded, variable.
  for (const t of ['upper', 'lower'] as DayType[]) {
    c[primerGroup(t)] = { label: `Primer — ${t}`, loadTypes: ['none'], variable: true }
  }
  // Capability block, C1 Hypertrophy: per-exercise weight×reps, variable.
  for (const day of PROGRAM_DAYS) {
    c[hypertrophyGroup(day)] = {
      label: `${day} — Hypertrophy`,
      loadTypes: ['recorded', 'bodyweight'],
      countTypes: ['reps', 'reps_per_side'],
      variable: true,
    }
  }
  // Capability block, C2 Oly: per-lane technical-ceiling weight, variable
  // (2-3 items per day). Logged with a quality mark, not RPE (oly_logs).
  for (const day of PROGRAM_DAYS) {
    c[olyGroup(day)] = { label: `${day} — Oly`, loadTypes: ['recorded'], countTypes: ['reps'], variable: true }
  }
  // Capability block, C3 Carries: reuses carrySlot(day) above, no new contract.
  return c
}

export const SLOT_CONTRACTS: Record<string, SlotContract> = buildContracts()

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
  rounds: number | null
  optional: boolean
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
  rounds: number | null
  optional: boolean
}

export interface ResolvedProgram {
  version: ProgramVersion
  mainFor: (day: Lift) => ResolvedItem | null
  secondaryFor: (day: Lift) => ResolvedItem | null
  accessoriesFor: (day: Lift) => ResolvedItem[]
  carryFor: (day: Lift) => ResolvedItem | null
  primerFor: (dayType: DayType) => ResolvedItem[]
  hypertrophyFor: (day: Lift) => ResolvedItem[]
  olyFor: (day: Lift) => ResolvedItem[]
}

// The version live on a date: the greatest effective_from that is <= the date,
// or null when the date precedes every version. Local-date math throughout —
// never UTC.
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
    carryFor: (day) => one(carrySlot(day)),
    primerFor: (dayType) => many(primerGroup(dayType)),
    hypertrophyFor: (day) => many(hypertrophyGroup(day)),
    olyFor: (day) => many(olyGroup(day)),
  }
}

// ---- seeding version 2 ("Giant 2.0") -----------------------------------------
// Pure, DB-free — every occupant comes in as a parameter; the caller
// (repository.ts) wires the real content in from engine/movements.ts /
// engine/constants.ts. All three Capability programs are seeded
// unconditionally; which one a session reads is a cycle-level dispatch
// (GIANT2_CAPABILITY_BY_CYCLE), not a seeding decision.

// Which seeded movement fills each carry lane. The lane is keyed by DAY; the
// implement is the occupant — swapping it never moves the recorded weight.
export const SEED_CARRY_KEYS: Record<string, string> = {
  deadlift: 'carry_farmers',
  ohp: 'carry_overhead',
  squat: 'carry_bearhug',
  bench: 'carry_suitcase',
}
// Which seeded movement fills each anchored lane. db_row/pendlay_row hold BB
// Row and Pull-ups.
export const SEED_LANE_KEYS: Record<string, string> = {
  deadlift: 'deadlift',
  ohp: 'ohp',
  squat: 'squat',
  bench: 'bench',
  db_row: 'bb_row',
  pendlay_row: 'pullup',
}

export interface SeedNumbers {
  gbAccessoryKeys: Partial<Record<Lift, string>> // day -> GB accessory movement key
  primerKeys: Record<DayType, string[]> // upper/lower -> ordered movement keys
  hypertrophyKeys: Partial<Record<Lift, string[]>> // day -> ordered movement keys
  olyKeys: Partial<Record<Lift, string[]>> // day -> ordered movement keys
  carryKeys: Partial<Record<Lift, string>> // day -> carry movement key (SEED_CARRY_KEYS shape)
}

export function buildSeedSlots(versionId: string, movements: Movement[], n: SeedNumbers): ProgramSlot[] {
  const idOf = (key: string): string | null => movements.find((m) => m.key === key)?.id ?? null
  const slots: ProgramSlot[] = []
  const push = (slotKey: string, orderIndex: number, movementKey: string | null, reps: number | null = null) => {
    const movementId = movementKey ? idOf(movementKey) : null
    if (movementKey && !movementId) return // unknown key: skip, never invent
    slots.push({ versionId, slotKey, orderIndex, movementId, reps, rounds: null, optional: false })
  }

  for (const lane of ANCHORED_LANES) push(lane, 0, SEED_LANE_KEYS[lane] ?? null)

  for (const day of PROGRAM_DAYS) {
    const key = n.gbAccessoryKeys[day]
    if (key) push(gbAccessoryGroup(day), 0, key)
  }

  for (const t of ['upper', 'lower'] as DayType[]) {
    ;(n.primerKeys[t] || []).forEach((key, i) => push(primerGroup(t), i, key))
  }

  for (const day of PROGRAM_DAYS) {
    ;(n.hypertrophyKeys[day] || []).forEach((key, i) => push(hypertrophyGroup(day), i, key))
    ;(n.olyKeys[day] || []).forEach((key, i) => push(olyGroup(day), i, key))
    const carryKey = n.carryKeys[day]
    if (carryKey) push(carrySlot(day), 0, carryKey)
  }

  return slots
}
