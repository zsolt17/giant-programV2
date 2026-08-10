// The parity gate for the data-driven program path.
//
// The resolver is built ALONGSIDE the hardcoded constants and must produce the
// same program. If any assertion here can only be made green by editing a
// constant, the SEED is wrong — fix the seed, never the constant.
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
  carrySlot,
  primerGroup,
  hypertrophyGroup,
  olyGroup,
  buildSeedSlots,
  resolveProgram,
  versionForDate,
  validateVersion,
} from './program'
import { SEED_MOVEMENTS, SEED_PRIMER_KEYS, SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS, formatCount } from './movements'
import { GIANT2_SECONDARY, GB_ACCESSORY, DAY_META, ANCHOR_LABEL, SECONDARY_REPS, SCHEMES } from './constants'
import { parseLocalDate } from './date-engine'
import { sessionSummary } from './session-summary'

// A stand-in for the user's library: the code seed with stable fake ids.
const MOVEMENTS = SEED_MOVEMENTS.map((m, i) => ({ ...m, id: `mv-${i}-${m.key}`, archived: false }))
const idOf = (key) => MOVEMENTS.find((m) => m.key === key).id
const V1 = { id: 'v1', number: 1, effectiveFrom: '2026-08-10', note: 'seed' }

// The program exactly as ensureSeedProgramVersion builds it.
function seededSlots() {
  return buildSeedSlots(V1.id, MOVEMENTS, {
    gbAccessoryKeys: Object.fromEntries(Object.entries(GB_ACCESSORY).map(([day, m]) => [day, m.key])),
    primerKeys: SEED_PRIMER_KEYS,
    hypertrophyKeys: SEED_HYPERTROPHY_KEYS,
    olyKeys: SEED_OLY_KEYS,
    carryKeys: SEED_CARRY_KEYS,
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

test('parity: the secondary lane matches GIANT2_SECONDARY — BB Row/Pull-ups on OHP/bench, empty on DL/squat', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const secondary = p.secondaryFor(day)
    const sec = GIANT2_SECONDARY[day]
    if (sec) {
      assert.ok(secondary, `${day} should resolve a secondary`)
      assert.equal(secondary.slotKey, SECONDARY_LANES[day])
      assert.equal(secondary.movement.key, sec.key)
      assert.equal(secondary.movement.name, sec.name)
    } else {
      assert.equal(secondary, null, `${day} trains alone — its lane must resolve empty`)
    }
  }
})

test('parity: the secondary keeps its FIXED reps per difficulty (loads still climb the ladder)', () => {
  const p = resolved()
  for (const day of ['ohp', 'bench']) {
    assert.equal(p.secondaryFor(day).reps, null, 'the secondary slot must not pin a rep count')
  }
  for (const difficulty of ['hard', 'medium', 'light']) {
    assert.ok(SECONDARY_REPS[difficulty] > 0)
    assert.ok(SCHEMES[difficulty].sets.length === 4)
  }
})

test('parity: Giant Block accessories match GB_ACCESSORY per day (key + reps + display)', () => {
  // Squat/Deadlift's Ab-Roll reuses the ab_rollout movement inherited from
  // GiantFit's own seed, which keeps its original name "Ab Rollout" in the
  // library — GB_ACCESSORY's own display label ("Ab-Roll") is what the live
  // UI actually renders (it reads the constant directly, never the library),
  // so identity (the key) is the real parity contract here, not the name.
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const acc = GB_ACCESSORY[day]
    const got = p.accessoriesFor(day)
    assert.equal(got.length, 1, `${day} carries exactly one accessory today`)
    assert.equal(got[0].slotKey, gbAccessoryGroup(day))
    assert.equal(got[0].movement.key, acc.key)
    assert.equal(got[0].reps, acc.reps, `${day} accessory rep drift`)
    assert.equal(formatCount(got[0].reps, got[0].movement), String(acc.reps))
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

test('parity: primer groups match SEED_PRIMER_KEYS, day-typed', () => {
  const p = resolved()
  for (const dayType of ['upper', 'lower']) {
    const got = p.primerFor(dayType).map((i) => i.movement.key)
    assert.deepEqual(got, SEED_PRIMER_KEYS[dayType])
  }
})

test('parity: hypertrophy and oly groups match their seed key lists, per day', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    assert.deepEqual(p.hypertrophyFor(day).map((i) => i.movement.key), SEED_HYPERTROPHY_KEYS[day] || [])
    assert.deepEqual(p.olyFor(day).map((i) => i.movement.key), SEED_OLY_KEYS[day] || [])
  }
})

// ---- 2. byte-identical copy-summaries ---------------------------------------
// The summary is the richest text the app derives from program content, so it's
// the sharpest parity probe. Fed from the resolver, it must be byte-identical.

const baseSession = (o = {}) => ({
  id: '2026-08-11-bench',
  macroId: 'm3',
  date: '2026-08-11',
  cycle: 1,
  week: 1,
  weekType: 'training',
  dayType: 'bench',
  difficulty: 'hard',
  volumeDifficulty: 'light',
  topReps: 2,
  topWeight: 100,
  rpe: 'R9',
  barSpeed: 'up',
  cardioCals: [null, null, null, null],
  blockCompletion: 'completed',
  volDone: true,
  volRpe: 'R8',
  volSpeed: 'normal',
  pullupCluster: '',
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
    { dayType: 'deadlift', id: '2026-08-13-deadlift', date: '2026-08-13', difficulty: 'medium' },
    { dayType: 'ohp', id: '2026-08-14-ohp', date: '2026-08-14', difficulty: 'medium' },
    { dayType: 'squat', id: '2026-08-10-squat', date: '2026-08-10', difficulty: 'hard' },
    { dayType: 'bench', id: '2026-08-11-bench', date: '2026-08-11', difficulty: 'hard' },
  ]
  for (const d of days) {
    const s = baseSession(d)
    // What the app prints today, from the constants.
    const fromConstants = sessionSummary(s, 3, ACC, WEIGHTS, false)
    // The same summary, with the Giant Block accessory value taken from the resolver.
    const accessory = p.accessoriesFor(d.dayType)[0]
    const fromResolver = sessionSummary(s, 3, ACC, WEIGHTS, false, accessory ? { [accessory.movement.key]: accessory.reps } : {})
    assert.equal(fromResolver, fromConstants, `summary drift on ${d.dayType}`)
    // ...and the resolver's own secondary name is the one the summary printed
    // (the secondary's display always comes from GIANT2_SECONDARY, which the
    // seed mirrors exactly — unlike the GB accessory case above, no drift here).
    const secondary = p.secondaryFor(d.dayType)
    if (secondary) assert.ok(fromConstants.includes(secondary.movement.name), `${secondary.movement.name} missing from the ${d.dayType} summary`)
  }
})

// ---- 3. effective dating -----------------------------------------------------

test('versionForDate: null before the seed date, v1 from it onward', () => {
  const versions = [V1]
  for (const d of ['2026-04-13', '2026-06-22', '2026-08-08', '2026-08-09']) {
    assert.equal(versionForDate(versions, d, parseLocalDate), null, `${d} must resolve NO version`)
  }
  for (const d of [V1.effectiveFrom, '2026-08-11', '2026-09-01', '2027-01-01']) {
    assert.equal(versionForDate(versions, d, parseLocalDate)?.number, 1, `${d} must resolve v1`)
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
  assert.equal(versionForDate([], '2026-08-11', parseLocalDate), null)
})

// ---- 4. contracts ------------------------------------------------------------

test('validateVersion: a clean seeded version has no violations', () => {
  assert.deepEqual(validateVersion(seededSlots(), MOVEMENTS), [])
})

test('validateVersion: rejects a non-anchored movement in an anchored lane', () => {
  const slots = seededSlots().map((s) => (s.slotKey === 'db_row' ? { ...s, movementId: idOf('walking_lunge') } : s))
  const violations = validateVersion(slots, MOVEMENTS)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].slotKey, 'db_row')
  assert.match(violations[0].reason, /needs Anchored/)
})

test('validateVersion: rejects an empty required main lane', () => {
  const seeded = seededSlots()
  assert.deepEqual(validateVersion(seeded, MOVEMENTS), [])

  const broken = seeded.map((s) => (s.slotKey === 'squat' ? { ...s, movementId: null } : s))
  const violations = validateVersion(broken, MOVEMENTS)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].slotKey, 'squat')
})

test('validateVersion: an unknown slot key is a violation, and an archived occupant is too', () => {
  const withGhost = [...seededSlots(), { versionId: V1.id, slotKey: 'ghost_slot', orderIndex: 0, movementId: idOf('deadlift'), reps: null, rounds: null, optional: false }]
  assert.match(validateVersion(withGhost, MOVEMENTS)[0].reason, /Unknown slot/)

  const archivedLib = MOVEMENTS.map((m) => (m.key === 'bench' ? { ...m, archived: true } : m))
  const violations = validateVersion(seededSlots(), archivedLib)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /archived/)
})

test('resolveProgram: an archived or unknown occupant is SKIPPED, never crashes a render', () => {
  // Mirrors mergeCapacityConfig's "unknown keys are dropped on read" rule.
  const archivedLib = MOVEMENTS.map((m) => (m.key === 'walking_lunge' ? { ...m, archived: true } : m))
  const p = resolveProgram(V1, seededSlots(), archivedLib)
  const items = p.hypertrophyFor('squat').map((i) => i.movement.key)
  assert.ok(!items.includes('walking_lunge'))
  assert.equal(items.length, SEED_HYPERTROPHY_KEYS.squat.length - 1)

  const ghostSlots = seededSlots().map((s) => (s.slotKey === 'bench' ? { ...s, movementId: 'no-such-movement' } : s))
  assert.equal(resolveProgram(V1, ghostSlots, MOVEMENTS).mainFor('bench'), null)
})

// ---- the registry itself -----------------------------------------------------

test('the slot registry covers every lane and group, and lane keys ARE the anchor keys', () => {
  // Anchored lanes: exactly the working_weights.lift values the app writes.
  assert.deepEqual(ANCHORED_LANES, ['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row'])
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
    assert.ok(SLOT_CONTRACTS[hypertrophyGroup(day)]?.variable)
    assert.ok(SLOT_CONTRACTS[olyGroup(day)]?.variable)
  }
  for (const dayType of ['upper', 'lower']) assert.ok(SLOT_CONTRACTS[primerGroup(dayType)]?.variable)
})
