import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  SEED_MOVEMENTS,
  SEED_PRIMER_KEYS,
  SEED_HYPERTROPHY_KEYS,
  SEED_OLY_KEYS,
  formatCount,
  validateOccupant,
  slugify,
  seedByKey,
  LOAD_TYPES,
  COUNT_TYPES,
} from './movements'
import { ANCHOR_LABEL, GB_ACCESSORY, ACC_ITEMS, DAY_META, GIANT2_SECONDARY } from './constants'
import { SEED_LANE_KEYS, SEED_CARRY_KEYS, ANCHORED_LANES, PROGRAM_DAYS } from './program'

// ---- formatCount: character-for-character parity with today's rendering ------

test('formatCount: reproduces the current display join rule exactly', () => {
  assert.equal(formatCount(4, { repUnit: '/side' }), '4/side')
  assert.equal(formatCount(8, { repUnit: '/leg' }), '8/leg')
  assert.equal(formatCount(10, { repUnit: '/leg' }), '10/leg')
  assert.equal(formatCount(30, { repUnit: 'sec' }), '30 sec')
  assert.equal(formatCount(20, { repUnit: null }), '20')
  assert.equal(formatCount(6, { repUnit: '' }), '6')
  // A stored unit that already carries its space normalises to exactly one.
  assert.equal(formatCount(30, { repUnit: ' sec' }), '30 sec')
  // Missing counts degrade like fmt() does, never to "null".
  assert.equal(formatCount(null, { repUnit: '/side' }), '—')
  assert.equal(formatCount(undefined, { repUnit: null }), '—')
})

// ---- the seed must cover every movement the constants/program reference ------

test('seed covers every anchored lane, with no duplicate keys', () => {
  const keys = SEED_MOVEMENTS.map((m) => m.key)
  assert.equal(new Set(keys).size, keys.length, 'duplicate seed keys')

  // Every anchored lane (working_weights.lift) resolves to a seeded movement
  // via SEED_LANE_KEYS — the lane key and the movement key are NOT the same
  // string for the two secondary lanes (db_row -> bb_row, pendlay_row -> pullup).
  for (const lane of ANCHORED_LANES) {
    const movementKey = SEED_LANE_KEYS[lane]
    const seed = seedByKey(movementKey)
    assert.ok(seed, `seed missing for lane ${lane} (movement key ${movementKey})`)
    assert.equal(seed.loadType, 'anchored')
    assert.equal(seed.name, ANCHOR_LABEL[lane], `label drift for lane ${lane}`)
  }
})

test('seed covers every Giant Block accessory, primer, hypertrophy, oly, and carry movement', () => {
  for (const day of Object.keys(GB_ACCESSORY)) {
    const acc = GB_ACCESSORY[day]
    const seed = seedByKey(acc.key)
    assert.ok(seed, `seed missing GB accessory ${acc.key}`)
    // Ab-Roll (Squat/Deadlift) reuses the ab_rollout movement inherited from
    // GiantFit's own seed, which keeps its original name "Ab Rollout" in the
    // library — GB_ACCESSORY's own label is what the live UI actually
    // renders (it reads the constant directly, never the library), so
    // identity (the key) is the real parity contract, not the name.
    assert.equal(seed.defaultReps, acc.reps)
    assert.equal(seed.loadType, 'bodyweight')
  }

  for (const dayType of ['upper', 'lower']) {
    for (const key of SEED_PRIMER_KEYS[dayType]) {
      assert.ok(seedByKey(key), `seed missing primer movement ${key}`)
    }
  }

  for (const day of PROGRAM_DAYS) {
    for (const key of SEED_HYPERTROPHY_KEYS[day] || []) {
      assert.ok(seedByKey(key), `seed missing hypertrophy movement ${key}`)
    }
    for (const key of SEED_OLY_KEYS[day] || []) {
      assert.ok(seedByKey(key), `seed missing oly movement ${key}`)
    }
  }

  // The four carries: one seeded implement per ACC_ITEMS lane, named as
  // DAY_META names it (the lane key is carry_<day>; the occupant is the implement).
  assert.equal(ACC_ITEMS.length, 4)
  const carryNames = new Set(SEED_MOVEMENTS.filter((m) => m.key.startsWith('carry_')).map((m) => m.name))
  assert.equal(carryNames.size, 4)
  for (const item of ACC_ITEMS) {
    const day = item.replace('carry_', '')
    assert.ok(carryNames.has(DAY_META[day].carry.name), `no seeded implement named ${DAY_META[day].carry.name}`)
    const carryKey = SEED_CARRY_KEYS[day]
    assert.ok(seedByKey(carryKey), `seed missing carry movement ${carryKey}`)
  }

  // The secondary display names match GIANT2_SECONDARY exactly (bb_row/pullup).
  for (const day of Object.keys(GIANT2_SECONDARY)) {
    const sec = GIANT2_SECONDARY[day]
    const seed = seedByKey(sec.key)
    assert.ok(seed, `seed missing secondary ${sec.key}`)
    assert.equal(seed.name, sec.name)
  }
})

test('every seeded movement declares valid capabilities', () => {
  for (const m of SEED_MOVEMENTS) {
    assert.ok(LOAD_TYPES.includes(m.loadType), `${m.key}: bad load type ${m.loadType}`)
    assert.ok(COUNT_TYPES.includes(m.countType), `${m.key}: bad count type ${m.countType}`)
    assert.match(m.key, /^[a-z0-9_]+$/, `${m.key}: keys are slugs`)
    assert.ok(m.name.length > 0, `${m.key}: needs a display name`)
    // A per-side count without a unit would render a bare number — catch that.
    if (m.countType === 'reps_per_side') assert.ok(m.repUnit, `${m.key}: per-side movements need a rep unit`)
  }
})

// ---- contracts ---------------------------------------------------------------

const CONTRACT = { label: 'Giant Block main', loadTypes: ['anchored'], countTypes: ['reps'] }

test('validateOccupant: accepts a satisfying movement, names the reason otherwise', () => {
  assert.equal(validateOccupant(CONTRACT, seedByKey('deadlift')), null)
  // Wrong load capability.
  const bad = validateOccupant(CONTRACT, { ...seedByKey('walking_lunge'), archived: false })
  assert.match(bad, /needs Anchored/)
  // Archived movements can't occupy anything.
  assert.match(validateOccupant(CONTRACT, { ...seedByKey('deadlift'), archived: true }), /archived/)
  // Empty lanes: rejected unless the contract says the lane is nullable.
  assert.match(validateOccupant(CONTRACT, null), /needs a movement/)
  assert.equal(validateOccupant({ ...CONTRACT, nullable: true }, null), null)
})

test('validateOccupant: count capability is checked when the contract constrains it', () => {
  const repsOnly = { label: 'Accessory', loadTypes: ['bodyweight', 'none'], countTypes: ['reps'] }
  assert.equal(validateOccupant(repsOnly, seedByKey('ab_rollout')), null)
  assert.match(validateOccupant(repsOnly, seedByKey('rope_flow')), /counted in/)
  // No countTypes on the contract = any count is fine.
  assert.equal(validateOccupant({ label: 'Hypertrophy', loadTypes: ['recorded'] }, seedByKey('walking_lunge')), null)
})

test('slugify: stable auto-key from a name (create-time only)', () => {
  assert.equal(slugify('Box-over Burpees'), 'box_over_burpees')
  assert.equal(slugify("Farmer's Carry"), 'farmer_s_carry')
  assert.equal(slugify('  Hang BB Snatch  '), 'hang_bb_snatch')
  assert.equal(slugify('Toes-to-Bar'), 'toes_to_bar')
})
