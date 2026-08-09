// Giant 2.0 — Phase 1 data model tests: the version-2 seed resolves correctly,
// coexists with version 1 across the cutover, and the weekly Giant-difficulty
// rotation is internally consistent (the exact contradiction almost shipped
// during planning — see the 2026-08-09 conversation — so this is a permanent
// regression guard, not a one-off check).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  SLOT_CONTRACTS,
  PROGRAM_DAYS,
  MAIN_LANES,
  SECONDARY_LANES,
  ANCHORED_LANES,
  gbAccessoryGroup,
  carrySlot,
  primerGroup,
  hypertrophyGroup,
  olyGroup,
  SEED_CARRY_KEYS,
  buildGiant2SeedSlots,
  GIANT2_SEED_LANE_KEYS,
  resolveProgram,
  versionForDate,
} from './program'
import {
  SEED_MOVEMENTS,
  SEED_GIANT2_PRIMER_KEYS,
  SEED_GIANT2_HYPERTROPHY_KEYS,
  SEED_GIANT2_OLY_KEYS,
} from './movements'
import {
  GIANTFIT_START_DATE,
  GIANT2_START_DATE,
  GIANT2_DAY_LIFT,
  GIANT2_SESSION_DAYS,
  GIANT2_GIANT_DEFAULT_ROTATION,
  GIANT2_WEEK4_DIFFICULTY,
  GIANT2_VOLUME_DIFFICULTY_BY_CYCLE,
  GIANT2_CAPABILITY_BY_CYCLE,
  GIANT2_SECONDARY,
  GIANT2_GB_ACCESSORY,
} from './constants'
import { parseLocalDate } from './date-engine'

const MOVEMENTS = SEED_MOVEMENTS.map((m, i) => ({ ...m, id: `mv-${i}-${m.key}`, archived: false }))
const V1 = { id: 'v1', number: 1, effectiveFrom: GIANTFIT_START_DATE, note: 'seed' }
const V2 = { id: 'v2', number: 2, effectiveFrom: GIANT2_START_DATE, note: 'seed' }

const GIANT2_GB_ACCESSORY_KEYS = Object.fromEntries(Object.entries(GIANT2_GB_ACCESSORY).map(([day, m]) => [day, m.key]))

function giant2Slots() {
  return buildGiant2SeedSlots(V2.id, MOVEMENTS, {
    gbAccessoryKeys: GIANT2_GB_ACCESSORY_KEYS,
    primerKeys: SEED_GIANT2_PRIMER_KEYS,
    hypertrophyKeys: SEED_GIANT2_HYPERTROPHY_KEYS,
    olyKeys: SEED_GIANT2_OLY_KEYS,
    carryKeys: SEED_CARRY_KEYS,
  })
}
const resolved = () => resolveProgram(V2, giant2Slots(), MOVEMENTS)

// ---- 1. the weekly Giant-difficulty rotation is internally consistent -------

test('GIANT2_GIANT_DEFAULT_ROTATION: each lift touches Hard/Medium/Light exactly once across weeks 1-3', () => {
  const days = ['squat', 'bench', 'deadlift', 'ohp']
  for (const lift of days) {
    const seen = [1, 2, 3].map((w) => GIANT2_GIANT_DEFAULT_ROTATION[w][lift])
    assert.deepEqual([...seen].sort(), ['hard', 'light', 'medium'], `${lift} does not touch all three tiers`)
  }
})

test('GIANT2_GIANT_DEFAULT_ROTATION: exactly one tier doubles up each week, all three present', () => {
  const days = ['squat', 'bench', 'deadlift', 'ohp']
  for (const week of [1, 2, 3]) {
    const values = days.map((d) => GIANT2_GIANT_DEFAULT_ROTATION[week][d])
    const counts = { hard: 0, medium: 0, light: 0 }
    values.forEach((v) => counts[v]++)
    const tally = Object.values(counts).sort((a, b) => a - b)
    assert.deepEqual(tally, [1, 1, 2], `week ${week} is not a clean one-tier-doubled distribution`)
  }
})

test('week 4 collapse and volume-by-cycle and capability-by-cycle match the confirmed 13-week calendar', () => {
  assert.deepEqual(GIANT2_WEEK4_DIFFICULTY, { 1: 'light', 2: 'medium', 3: 'hard' })
  assert.deepEqual(GIANT2_VOLUME_DIFFICULTY_BY_CYCLE, { 1: 'light', 2: 'medium', 3: 'hard' })
  assert.deepEqual(GIANT2_CAPABILITY_BY_CYCLE, { 1: 'hypertrophy', 2: 'oly', 3: 'carries' })
})

test('GIANT2_DAY_LIFT: fixed Mon/Tue/Thu/Fri -> Squat/Bench/Deadlift/OHP, no Wed/Sat/Sun', () => {
  assert.deepEqual(GIANT2_DAY_LIFT, { 1: 'squat', 2: 'bench', 4: 'deadlift', 5: 'ohp' })
  assert.deepEqual(GIANT2_SESSION_DAYS.slice().sort(), [1, 2, 4, 5])
})

// ---- 2. the version-2 seed reproduces the Giant 2.0 spec ---------------------

test('Giant 2.0 main lanes: unchanged day->lift lane keys, same as version 1', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    const main = p.mainFor(day)
    assert.ok(main, `no main resolved for ${day}`)
    assert.equal(main.slotKey, MAIN_LANES[day])
    assert.equal(main.movement.key, day)
  }
})

test('Giant 2.0 secondary lanes: BB Row occupies db_row (OHP), Pull-ups occupies pendlay_row (bench) — same LANES as GiantFit, new occupants', () => {
  const p = resolved()
  assert.equal(SECONDARY_LANES.ohp, 'db_row')
  assert.equal(SECONDARY_LANES.bench, 'pendlay_row')
  assert.equal(p.secondaryFor('ohp').movement.key, 'bb_row')
  assert.equal(p.secondaryFor('ohp').slotKey, 'db_row')
  assert.equal(p.secondaryFor('bench').movement.key, 'pullup')
  assert.equal(p.secondaryFor('bench').slotKey, 'pendlay_row')
  assert.equal(p.secondaryFor('bench').movement.loadType, 'anchored')
  // Squat/Deadlift still train alone.
  assert.equal(p.secondaryFor('squat'), null)
  assert.equal(p.secondaryFor('deadlift'), null)
})

test('Giant 2.0 GB accessories: Ab-Roll (reused ab_rollout) on Squat/Deadlift, Leg Raises on Bench/OHP', () => {
  const p = resolved()
  assert.equal(p.accessoriesFor('squat')[0].movement.key, 'ab_rollout')
  assert.equal(p.accessoriesFor('deadlift')[0].movement.key, 'ab_rollout')
  assert.equal(p.accessoriesFor('bench')[0].movement.key, 'leg_raises')
  assert.equal(p.accessoriesFor('ohp')[0].movement.key, 'leg_raises')
})

test('Giant 2.0 Primer: rope flow first on both day types, then the day-typed band + ramp', () => {
  const p = resolved()
  const upper = p.primerFor('upper').map((i) => i.movement.key)
  const lower = p.primerFor('lower').map((i) => i.movement.key)
  assert.deepEqual(upper, SEED_GIANT2_PRIMER_KEYS.upper)
  assert.deepEqual(lower, SEED_GIANT2_PRIMER_KEYS.lower)
  assert.equal(upper[0], 'rope_flow')
  assert.equal(lower[0], 'rope_flow')
  assert.ok(upper.includes('crossover_symmetry'))
  assert.ok(lower.includes('hip_halo'))
})

test('Giant 2.0 Capability: Hypertrophy, Oly, and Carries are ALL seeded (cycle dispatch happens at read time, not seed time)', () => {
  const p = resolved()
  for (const day of PROGRAM_DAYS) {
    assert.ok(p.hypertrophyFor(day).length > 0, `no Hypertrophy content for ${day}`)
    assert.ok(p.olyFor(day).length > 0, `no Oly content for ${day}`)
    assert.equal(p.carryFor(day).movement.key, SEED_CARRY_KEYS[day])
  }
  // Squat/Deadlift (lower days) never get the Oly "third item" (upper-only).
  assert.equal(SEED_GIANT2_OLY_KEYS.squat.length, 2)
  assert.equal(SEED_GIANT2_OLY_KEYS.deadlift.length, 2)
  assert.equal(SEED_GIANT2_OLY_KEYS.bench.length, 3)
  assert.equal(SEED_GIANT2_OLY_KEYS.ohp.length, 3)
})

test('carries reuse the exact GiantFit day->implement mapping unchanged', () => {
  assert.deepEqual(SEED_CARRY_KEYS, {
    deadlift: 'carry_farmers',
    ohp: 'carry_overhead',
    squat: 'carry_bearhug',
    bench: 'carry_suitcase',
  })
})

// ---- 3. multi-era coexistence: GiantFit history renders untouched -----------

test('versionForDate: pre-cutover dates resolve to version 1, Giant2-era dates resolve to version 2', () => {
  const versions = [V1, V2]
  const day = (iso) => versionForDate(versions, iso, parseLocalDate)
  assert.equal(day('2026-07-20')?.number, undefined) // pre-GiantFit: no version
  assert.equal(day('2026-07-27')?.number, 1) // GiantFit cutover
  assert.equal(day('2026-08-09')?.number, 1) // day before Giant 2.0 cutover
  assert.equal(day(GIANT2_START_DATE)?.number, 2) // Giant 2.0 cutover itself
  assert.equal(day('2026-09-01')?.number, 2)
})

// ---- 4. the registry: every new slot has a contract, nothing collides -------

test('every Giant 2.0 slot key has a registered contract, distinct from GiantFit/legacy keys', () => {
  for (const t of ['upper', 'lower']) assert.ok(SLOT_CONTRACTS[primerGroup(t)]?.variable)
  for (const day of PROGRAM_DAYS) {
    assert.ok(SLOT_CONTRACTS[hypertrophyGroup(day)]?.variable)
    assert.ok(SLOT_CONTRACTS[olyGroup(day)]?.variable)
    assert.ok(SLOT_CONTRACTS[carrySlot(day)]) // reused, unchanged
    assert.ok(SLOT_CONTRACTS[gbAccessoryGroup(day)]) // reused, unchanged
  }
  // The anchored lanes are the SAME lanes as version 1 — no new lane, no CHECK change.
  assert.deepEqual(Object.keys(GIANT2_SEED_LANE_KEYS).sort(), [...ANCHORED_LANES].sort())
})

test('GIANT2_SECONDARY documents the lane->occupant reassignment used by the seed', () => {
  assert.deepEqual(GIANT2_SECONDARY, { ohp: { key: 'bb_row', name: 'BB Row' }, bench: { key: 'pullup', name: 'Pull-ups' } })
})
