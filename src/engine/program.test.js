// The parity gate for the data-driven program path.
//
// The whole point of this phase: build the resolver ALONGSIDE the hardcoded
// constants and prove they produce the same program. If any assertion here can
// only be made green by editing a constant, the SEED is wrong — fix the seed,
// never the constant.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  SLOT_CONTRACTS,
  PROGRAM_DAYS,
  MAIN_LANES,
  SECONDARY_LANES,
  ANCHORED_LANES,
  SEED_LANE_KEYS,
  SEED_CARRY_KEYS,
  gbAccessoryGroup,
  capacityGroup,
  carrySlot,
  ACTIVATION_GROUP,
  BULLETPROOF_GROUP,
  buildSeedSlots,
  resolveProgram,
  versionForDate,
  validateVersion,
} from './program'
import { SEED_MOVEMENTS, SEED_CAPACITY_KEYS, SEED_ACTIVATION_KEYS, SEED_BULLETPROOF_KEYS, SEED_BULLETPROOF_OPTIONAL, formatCount } from './movements'
import {
  GIANTFIT_START_DATE,
  GIANTFIT_ROW,
  GIANTFIT_GB_ACCESSORY,
  GIANTFIT_ACTIVATION,
  BULLETPROOF_ITEMS,
  DAY_META,
  ANCHOR_LABEL,
  GIANTFIT_ROW_REPS,
  SCHEMES,
} from './constants'
import { CAPACITY_MOVEMENTS, CAPACITY_VARIANTS } from './capacity'
import { parseLocalDate, isGiantFitDate } from './date-engine'
import { sessionSummary } from './session-summary'

// A stand-in for the user's library: the code seed with stable fake ids.
const MOVEMENTS = SEED_MOVEMENTS.map((m, i) => ({ ...m, id: `mv-${i}-${m.key}`, archived: false }))
const idOf = (key) => MOVEMENTS.find((m) => m.key === key).id
const V1 = { id: 'v1', number: 1, effectiveFrom: GIANTFIT_START_DATE, note: 'seed' }

// Version 1 exactly as ensureSeedProgramVersion builds it for a user who has set
// no numbers of their own (so it must fall back to the code defaults).
function seededSlots(numbers = {}) {
  return buildSeedSlots(V1.id, MOVEMENTS, {
    gbAccessoryKeys: Object.fromEntries(Object.entries(GIANTFIT_GB_ACCESSORY).map(([day, m]) => [day, m.key])),
    capacityKeys: SEED_CAPACITY_KEYS,
    activationKeys: SEED_ACTIVATION_KEYS,
    bulletproofKeys: SEED_BULLETPROOF_KEYS,
    optionalKeys: SEED_BULLETPROOF_OPTIONAL,
    ...numbers,
  })
}
const resolved = () => resolveProgram(V1, seededSlots(), MOVEMENTS)

// ---- 1. the resolver reproduces the constants, everywhere -------------------

test('parity: Giant Block main lift per day matches the anchored lane occupant', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const main = p.mainFor(day)
    assert.ok(main, `no main resolved for ${day}`)
    // The lane key IS sessions.day_type — the invariant that keeps ids stable.
    assert.equal(main.slotKey, MAIN_LANES[day])
    assert.equal(main.slotKey, day)
    assert.equal(main.movement.name, ANCHOR_LABEL[day], `main name drift on ${day}`)
    assert.equal(main.movement.loadType, 'anchored')
  }
})

test('parity: the secondary lane matches GIANTFIT_ROW — rows on OHP/bench, empty on DL/squat', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const secondary = p.secondaryFor(day)
    const rowAnchor = GIANTFIT_ROW[day] // today's hardcoded truth
    if (rowAnchor) {
      assert.ok(secondary, `${day} should resolve a row`)
      // The lane key equals the working_weights.lift value it has always used.
      assert.equal(secondary.slotKey, rowAnchor)
      assert.equal(secondary.movement.key, rowAnchor)
      assert.equal(secondary.movement.name, ANCHOR_LABEL[rowAnchor])
    } else {
      assert.equal(secondary, null, `${day} trains alone — its lane must resolve empty`)
    }
  }
})

test('parity: the row keeps its FIXED reps per difficulty (loads still climb the ladder)', () => {
  // Reps for the anchored lanes are per-difficulty and stay in the engine — the
  // slot carries no rep override, so the constants remain the single source.
  const p = resolved()
  for (const day of ['ohp', 'bench']) {
    assert.equal(p.secondaryFor(day).reps, null, 'the row slot must not pin a rep count')
  }
  for (const difficulty of ['hard', 'medium', 'light']) {
    assert.ok(GIANTFIT_ROW_REPS[difficulty] > 0)
    assert.ok(SCHEMES[difficulty].sets.length === 4)
  }
})

test('parity: Giant Block accessories match GIANTFIT_GB_ACCESSORY per day (name + reps + display)', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const acc = GIANTFIT_GB_ACCESSORY[day]
    const got = p.accessoriesFor(day)
    assert.equal(got.length, 1, `${day} carries exactly one accessory today`)
    assert.equal(got[0].slotKey, gbAccessoryGroup(day))
    assert.equal(got[0].movement.key, acc.key)
    assert.equal(got[0].movement.name, acc.name)
    assert.equal(got[0].reps, acc.reps, `${day} accessory rep drift`)
    assert.equal(formatCount(got[0].reps, got[0].movement), String(acc.reps))
  }
})

test('parity: both capacity circuits match CAPACITY_MOVEMENTS — same order, names, reps, display', () => {
  const p = resolved()
  for (const v of CAPACITY_VARIANTS) {
    const got = p.capacityFor(v)
    const want = CAPACITY_MOVEMENTS[v]
    assert.equal(got.length, want.length, `variant ${v} length drift`)
    got.forEach((item, i) => {
      assert.equal(item.movement.key, want[i].key, `variant ${v} order drift at ${i}`)
      assert.equal(item.movement.name, want[i].name)
      assert.equal(item.reps, want[i].reps, `variant ${v} rep drift for ${want[i].key}`)
      // The exact string the capacity block prints today.
      const live = `${want[i].reps}${want[i].repUnit ? (want[i].repUnit.startsWith('/') ? want[i].repUnit : ` ${want[i].repUnit}`) : ''}`
      assert.equal(formatCount(item.reps, item.movement), live, `variant ${v} display drift for ${want[i].key}`)
    })
  }
})

test('parity: carries match the DAY_META implement per day (lane keyed by DAY, not implement)', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const got = p.carryFor(day)
    assert.ok(got, `no carry resolved for ${day}`)
    assert.equal(got.slotKey, carrySlot(day))
    assert.equal(got.movement.name, DAY_META[day].carry.name, `carry drift on ${day}`)
    assert.equal(got.movement.key, SEED_CARRY_KEYS[day])
    assert.equal(got.movement.loadType, 'recorded')
  }
})

test('parity: activation list matches GIANTFIT_ACTIVATION in order, dose for dose', () => {
  const p = resolved()
  const got = p.activation()
  assert.equal(got.length, GIANTFIT_ACTIVATION.length)
  got.forEach((item, i) => {
    assert.equal(item.movement.name, GIANTFIT_ACTIVATION[i].name, `activation order drift at ${i}`)
    // Doses compose from reps + unit with the list's "×" prefix.
    assert.equal(`×${formatCount(item.reps, item.movement)}`, GIANTFIT_ACTIVATION[i].dose)
  })
})

test('parity: Bulletproof matches BULLETPROOF_ITEMS in order, including the optional tail', () => {
  const p = resolved()
  const got = p.bulletproof()
  assert.equal(got.length, BULLETPROOF_ITEMS.length)
  got.forEach((item, i) => {
    assert.equal(item.movement.name, BULLETPROOF_ITEMS[i].name, `bulletproof order drift at ${i}`)
    // Compound doses can't compose from one number — they ride the movement note.
    assert.equal(item.movement.note, BULLETPROOF_ITEMS[i].dose)
    assert.equal(item.optional, !!BULLETPROOF_ITEMS[i].optional, `optional flag drift on ${item.movement.name}`)
  })
})

test("parity: seeding preserves the athlete's OWN numbers verbatim over the defaults", () => {
  // A user who edited capacity reps and an accessory target must see exactly
  // those numbers in version 1 — not the code defaults.
  const slots = seededSlots({
    gbAccessoryReps: { ghd_abs: 15 },
    capacityReps: { A: { pullups: 9 }, B: {} },
    capacityRounds: 4,
  })
  const p = resolveProgram(V1, slots, MOVEMENTS)
  assert.equal(p.accessoriesFor('squat')[0].reps, 15)
  assert.equal(p.capacityFor('A').find((i) => i.movement.key === 'pullups').reps, 9)
  // Untouched movements still fall back to the code default.
  assert.equal(p.capacityFor('A').find((i) => i.movement.key === 'dips').reps, 8)
  // Rounds is a GROUP property — it rides the group's first row.
  assert.equal(p.capacityFor('A')[0].rounds, 4)
})

// ---- 2. byte-identical copy-summaries ---------------------------------------
// The summary is the richest text the app derives from program content, so it's
// the sharpest parity probe. Fed from the resolver, it must be byte-identical.

const baseSession = (o = {}) => ({
  id: '2026-08-03-bench-H',
  macroId: 'm3',
  date: '2026-08-03',
  cycle: 1,
  week: 2,
  weekType: 'training',
  dayType: 'bench',
  difficulty: 'hard',
  topReps: 2,
  topWeight: 100,
  rpe: 'R9',
  barSpeed: 'up',
  cardioCals: [null, null, null, null],
  blockCompletion: 'completed',
  volDone: true,
  volRpe: 'R8',
  volSpeed: 'normal',
  pairWeight: null,
  pullupCluster: '',
  dipsCluster: '',
  carrySkipped: false,
  carrySkipReason: '',
  carryRounds: 3,
  carryDistance: 30,
  carryRpe: 'R6',
  startedAt: null,
  endedAt: null,
  notes: '',
  ...o,
})
const ACC = { 1: { carry_deadlift: 60, carry_ohp: 20, carry_squat: 68, carry_bench: 50 } }
const WEIGHTS = {
  1: {
    db_row: { hard: 30, medium: 27.5, light: 25 },
    pendlay_row: { hard: 60, medium: 57.5, light: 55 },
  },
}

test('parity: sessionSummary is byte-identical fed from the resolver vs the constants', () => {
  const p = resolved()
  const days = [
    { dayType: 'deadlift', id: '2026-07-27-deadlift-M', date: '2026-07-27', difficulty: 'medium' },
    { dayType: 'ohp', id: '2026-07-29-ohp-M', date: '2026-07-29', difficulty: 'medium' },
    { dayType: 'squat', id: '2026-07-31-squat-L', date: '2026-07-31', difficulty: 'light' },
    { dayType: 'bench', id: '2026-08-03-bench-H', date: '2026-08-03', difficulty: 'hard' },
  ]
  for (const d of days) {
    const s = baseSession(d)
    // What the app prints today, from the constants.
    const fromConstants = sessionSummary(s, 3, ACC, WEIGHTS, false, null)
    // The same summary, with every program-content value taken from the resolver.
    const accessory = p.accessoriesFor(d.dayType)[0]
    const fromResolver = sessionSummary(
      s,
      3,
      ACC,
      WEIGHTS,
      false,
      null,
      accessory ? { [accessory.movement.key]: accessory.reps } : {}
    )
    assert.equal(fromResolver, fromConstants, `summary drift on ${d.dayType}`)
    // ...and the resolver's own names are the ones the summary printed.
    if (accessory) assert.ok(fromConstants.includes(accessory.movement.name), `${accessory.movement.name} missing from the ${d.dayType} summary`)
    const secondary = p.secondaryFor(d.dayType)
    if (secondary) assert.ok(fromConstants.includes(secondary.movement.name), `${secondary.movement.name} missing from the ${d.dayType} summary`)
    assert.ok(fromConstants.includes(p.carryFor(d.dayType).movement.name), `carry name missing from the ${d.dayType} summary`)
  }
})

// ---- 3. effective dating -----------------------------------------------------

test('versionForDate: null for every pre-cutover date, v1 from the cutover onward', () => {
  const versions = [V1]
  for (const d of ['2026-04-13', '2026-06-22', '2026-07-24', '2026-07-26']) {
    assert.equal(versionForDate(versions, d, parseLocalDate), null, `${d} must resolve NO version`)
    assert.equal(isGiantFitDate(d), false, `${d} should be pre-cutover`)
  }
  for (const d of [GIANTFIT_START_DATE, '2026-07-28', '2026-08-03', '2027-01-01']) {
    assert.equal(versionForDate(versions, d, parseLocalDate)?.number, 1, `${d} must resolve v1`)
    assert.equal(isGiantFitDate(d), true)
  }
})

test('versionForDate: picks the greatest effective_from <= the date (never retroactive)', () => {
  const v2 = { id: 'v2', number: 2, effectiveFrom: '2026-09-07', note: null }
  const v3 = { id: 'v3', number: 3, effectiveFrom: '2026-11-02', note: null }
  const all = [V1, v3, v2] // deliberately unordered
  assert.equal(versionForDate(all, '2026-09-06', parseLocalDate).number, 1)
  assert.equal(versionForDate(all, '2026-09-07', parseLocalDate).number, 2) // live from its own day
  assert.equal(versionForDate(all, '2026-10-31', parseLocalDate).number, 2)
  assert.equal(versionForDate(all, '2026-11-02', parseLocalDate).number, 3)
  assert.equal(versionForDate(all, '2030-01-01', parseLocalDate).number, 3)
  assert.equal(versionForDate([], '2026-08-03', parseLocalDate), null)
})

// ---- 4. contracts ------------------------------------------------------------

test('validateVersion: a clean seeded version has no violations', () => {
  assert.deepEqual(validateVersion(seededSlots(), MOVEMENTS), [])
})

test('validateVersion: rejects a non-anchored movement in an anchored lane', () => {
  const slots = seededSlots().map((s) => (s.slotKey === 'db_row' ? { ...s, movementId: idOf('pullups') } : s))
  const violations = validateVersion(slots, MOVEMENTS)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].slotKey, 'db_row')
  assert.match(violations[0].reason, /needs Anchored/)
})

test('validateVersion: accepts a nullable secondary lane left empty, rejects an empty main', () => {
  // DL and Squat ship with their secondary lane empty — that must be valid.
  const seeded = seededSlots()
  const dlLane = seeded.find((s) => s.slotKey === SECONDARY_LANES.deadlift)
  assert.ok(dlLane, 'the empty lane still gets a row (deliberately empty, not absent)')
  assert.equal(dlLane.movementId, null)
  assert.deepEqual(validateVersion(seeded, MOVEMENTS), [])

  // Emptying a REQUIRED main lane is a violation.
  const broken = seeded.map((s) => (s.slotKey === 'squat' ? { ...s, movementId: null } : s))
  const violations = validateVersion(broken, MOVEMENTS)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].slotKey, 'squat')
})

test('validateVersion: an unknown slot key is a violation, and an archived occupant is too', () => {
  const withGhost = [...seededSlots(), { versionId: V1.id, slotKey: 'ghost_slot', orderIndex: 0, movementId: idOf('dips'), reps: null, rounds: null, optional: false }]
  assert.match(validateVersion(withGhost, MOVEMENTS)[0].reason, /Unknown slot/)

  const archivedLib = MOVEMENTS.map((m) => (m.key === 'bench' ? { ...m, archived: true } : m))
  const violations = validateVersion(seededSlots(), archivedLib)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /archived/)
})

test('resolveProgram: an archived or unknown occupant is SKIPPED, never crashes a render', () => {
  // Mirrors mergeCapacityConfig's "unknown keys are dropped on read" rule.
  const archivedLib = MOVEMENTS.map((m) => (m.key === 'dips' ? { ...m, archived: true } : m))
  const p = resolveProgram(V1, seededSlots(), archivedLib)
  const circuit = p.capacityFor('A').map((i) => i.movement.key)
  assert.ok(!circuit.includes('dips'))
  assert.equal(circuit.length, CAPACITY_MOVEMENTS.A.length - 1)

  const ghostSlots = seededSlots().map((s) => (s.slotKey === 'bench' ? { ...s, movementId: 'no-such-movement' } : s))
  assert.equal(resolveProgram(V1, ghostSlots, MOVEMENTS).mainFor('bench'), null)
})

// ---- the registry itself -----------------------------------------------------

test('the slot registry covers every lane and group, and lane keys ARE the anchor keys', () => {
  // Anchored lanes: exactly the working_weights.lift values the app writes.
  assert.deepEqual(ANCHORED_LANES, ['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row', 'secondary_deadlift', 'secondary_squat'])
  for (const lane of ANCHORED_LANES) {
    assert.ok(SLOT_CONTRACTS[lane], `no contract for lane ${lane}`)
    assert.deepEqual(SLOT_CONTRACTS[lane].loadTypes, ['anchored'])
    assert.ok(Object.prototype.hasOwnProperty.call(SEED_LANE_KEYS, lane), `no seed entry for lane ${lane}`)
  }
  // Every group key has a contract.
  for (const day of PROGRAM_DAYS) {
    assert.ok(SLOT_CONTRACTS[gbAccessoryGroup(day)]?.variable)
    assert.ok(SLOT_CONTRACTS[carrySlot(day)])
    assert.equal(SLOT_CONTRACTS[carrySlot(day)].variable, undefined, 'a day has exactly one carry')
  }
  for (const v of CAPACITY_VARIANTS) assert.ok(SLOT_CONTRACTS[capacityGroup(v)]?.variable)
  assert.ok(SLOT_CONTRACTS[ACTIVATION_GROUP]?.variable)
  assert.ok(SLOT_CONTRACTS[BULLETPROOF_GROUP]?.variable)
})
