import { test } from 'vitest'
import assert from 'node:assert/strict'
import { SEED_MOVEMENTS, SEED_CAPACITY_KEYS, formatCount, validateOccupant, slugify, seedByKey, LOAD_TYPES, COUNT_TYPES } from './movements'
import { ANCHOR_LIFTS, ANCHOR_LABEL, GIANTFIT_GB_ACCESSORY, GIANTFIT_ACC_ITEMS, GIANTFIT_ACTIVATION, BULLETPROOF_ITEMS, DAY_META } from './constants'
import { CAPACITY_MOVEMENTS, CAPACITY_VARIANTS } from './capacity'

// ---- formatCount: character-for-character parity with today's rendering ------
// The rule lives in two places today (CapacityBlock's desc line and Setup's
// label); both join '/'-prefixed units tight and word units with one space.

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

test('formatCount matches what the capacity block renders for every seeded capacity movement', () => {
  for (const v of CAPACITY_VARIANTS) {
    for (const def of CAPACITY_MOVEMENTS[v]) {
      const seed = seedByKey(def.key)
      assert.ok(seed, `seed missing for capacity movement ${def.key}`)
      // The live rendering rule, inlined from CapacityBlock.tsx.
      const live = `${def.reps}${def.repUnit ? (def.repUnit.startsWith('/') ? def.repUnit : ` ${def.repUnit}`) : ''}`
      assert.equal(formatCount(seed.defaultReps, seed), live, `display drift for ${def.key}`)
    }
  }
})

// ---- the seed must cover every movement the constants reference --------------
// This is the test that stops the seed drifting from the hardcoded content.

test('seed covers every currently-referenced movement, with no duplicate keys', () => {
  const keys = SEED_MOVEMENTS.map((m) => m.key)
  assert.equal(new Set(keys).size, keys.length, 'duplicate seed keys')

  // Anchored lifts (ANCHOR_LIFTS) — same keys, same labels.
  for (const lift of ANCHOR_LIFTS) {
    const seed = seedByKey(lift)
    assert.ok(seed, `seed missing anchor lift ${lift}`)
    assert.equal(seed.loadType, 'anchored')
    assert.equal(seed.name, ANCHOR_LABEL[lift], `label drift for ${lift}`)
  }

  // Giant Block accessories — key, name and default reps all carried over.
  for (const day of Object.keys(GIANTFIT_GB_ACCESSORY)) {
    const acc = GIANTFIT_GB_ACCESSORY[day]
    const seed = seedByKey(acc.key)
    assert.ok(seed, `seed missing GB accessory ${acc.key}`)
    assert.equal(seed.name, acc.name)
    assert.equal(seed.defaultReps, acc.reps)
    assert.equal(seed.loadType, 'bodyweight')
  }

  // Capacity: every movement of both variants, with matching reps + unit.
  for (const v of CAPACITY_VARIANTS) {
    for (const def of CAPACITY_MOVEMENTS[v]) {
      const seed = seedByKey(def.key)
      assert.ok(seed, `seed missing capacity movement ${def.key}`)
      assert.equal(seed.name, def.name, `name drift for ${def.key}`)
      assert.equal(seed.defaultReps, def.reps, `reps drift for ${def.key}`)
      assert.equal(seed.loadType, def.loaded ? 'recorded' : 'bodyweight', `load type drift for ${def.key}`)
    }
    // ...and the seeded circuit order matches the live one exactly.
    assert.deepEqual(SEED_CAPACITY_KEYS[v], CAPACITY_MOVEMENTS[v].map((m) => m.key), `circuit order drift in variant ${v}`)
  }

  // The four carries: one seeded implement per GIANTFIT_ACC_ITEMS lane, named
  // as DAY_META names it (the lane key is carry_<day>; the occupant is the implement).
  assert.equal(GIANTFIT_ACC_ITEMS.length, 4)
  const carryNames = new Set(SEED_MOVEMENTS.filter((m) => m.key.startsWith('carry_')).map((m) => m.name))
  assert.equal(carryNames.size, 4)
  for (const item of GIANTFIT_ACC_ITEMS) {
    const day = item.replace('carry_', '')
    assert.ok(carryNames.has(DAY_META[day].carry.name), `no seeded implement named ${DAY_META[day].carry.name}`)
  }

  // Activation: names carried over, and every dose recomposes character-for-character.
  for (const a of GIANTFIT_ACTIVATION) {
    const seed = SEED_MOVEMENTS.find((m) => m.name === a.name)
    assert.ok(seed, `seed missing activation item ${a.name}`)
    assert.equal(seed.loadType, 'none')
    assert.equal(`×${formatCount(seed.defaultReps, seed)}`, a.dose, `dose drift for ${a.name}`)
  }

  // Bulletproof: compound doses can't compose from one number, so they're carried
  // verbatim in `note` — assert byte parity with the live strings.
  for (const b of BULLETPROOF_ITEMS) {
    const seed = SEED_MOVEMENTS.find((m) => m.name === b.name)
    assert.ok(seed, `seed missing bulletproof item ${b.name}`)
    assert.equal(seed.loadType, 'none')
    assert.equal(seed.note, b.dose, `dose drift for ${b.name}`)
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
  const bad = validateOccupant(CONTRACT, { ...seedByKey('pullups'), archived: false })
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
  assert.match(validateOccupant(repsOnly, seedByKey('bike')), /counted in/)
  // No countTypes on the contract = any count is fine.
  assert.equal(validateOccupant({ label: 'Capacity', loadTypes: ['bodyweight'] }, seedByKey('bike')), null)
})

test('slugify: stable auto-key from a name (create-time only)', () => {
  assert.equal(slugify('Box-over Burpees'), 'box_over_burpees')
  assert.equal(slugify("Farmer's Carry"), 'farmer_s_carry')
  assert.equal(slugify('  Hang BB Snatch  '), 'hang_bb_snatch')
  assert.equal(slugify('Toes-to-Bar'), 'toes_to_bar')
})
