import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  CAPACITY_MOVEMENTS,
  CAPACITY_VARIANTS,
  CAPACITY_ROUNDS_DEFAULT,
  movementDef,
  defaultCapacityConfig,
  mergeCapacityConfig,
} from './capacity'

test('both variants define exactly 8 ordered movements', () => {
  for (const v of CAPACITY_VARIANTS) {
    assert.equal(CAPACITY_MOVEMENTS[v].length, 8)
    // keys are unique within a variant (they're the persistence key)
    const keys = CAPACITY_MOVEMENTS[v].map((m) => m.key)
    assert.equal(new Set(keys).size, 8)
  }
})

test('spec defaults: loaded flags and rep targets', () => {
  // Variant A: DB Snatch 8 (loaded), Pull-ups 6, Single Unders 40
  assert.deepEqual(
    CAPACITY_MOVEMENTS.A.map((m) => [m.key, m.reps, !!m.loaded]),
    [
      ['db_snatch', 8, true],
      ['pullups', 6, false],
      ['dips', 8, false],
      ['reverse_lunges', 8, true],
      ['ghd', 10, false],
      ['goblet_curl', 10, true],
      ['single_unders', 40, false],
      ['box_over_burpees', 8, false],
    ]
  )
  // Variant B: BB Clean 6 (loaded), Double Unders 20, Bike 30 sec for calories
  assert.deepEqual(
    CAPACITY_MOVEMENTS.B.map((m) => [m.key, m.reps, !!m.loaded]),
    [
      ['bb_clean', 6, true],
      ['chinups', 6, false],
      ['pushups', 12, false],
      ['walking_lunges', 10, true],
      ['toes_to_bar', 8, false],
      ['bb_curl', 10, true],
      ['double_unders', 20, false],
      ['bike', 30, false],
    ]
  )
  // The Bike is the calories movement; lunges are load-optional in both variants
  assert.equal(movementDef('B', 'bike')?.calories, true)
  assert.equal(movementDef('A', 'reverse_lunges')?.loadOptional, true)
  assert.equal(movementDef('B', 'walking_lunges')?.loadOptional, true)
})

test('defaultCapacityConfig: every movement present, default reps, no weights, 3 rounds', () => {
  const cfg = defaultCapacityConfig()
  assert.equal(cfg.rounds, CAPACITY_ROUNDS_DEFAULT)
  assert.equal(cfg.movements.A.db_snatch.reps, 8)
  assert.equal(cfg.movements.A.db_snatch.weight, null)
  assert.equal(cfg.movements.B.bike.reps, 30)
  assert.equal(Object.keys(cfg.movements.A).length, 8)
  assert.equal(Object.keys(cfg.movements.B).length, 8)
})

test('mergeCapacityConfig: stored values override defaults; nulls fall back; unknown keys ignored', () => {
  const cfg = mergeCapacityConfig(
    {
      A: {
        db_snatch: { reps: 10, weight: 17.5 },
        pullups: { reps: null, weight: null }, // null reps -> default 6
        retired_movement: { reps: 99, weight: 99 }, // unknown -> ignored
      },
    },
    4
  )
  assert.equal(cfg.rounds, 4)
  assert.deepEqual(cfg.movements.A.db_snatch, { reps: 10, weight: 17.5 })
  assert.equal(cfg.movements.A.pullups.reps, 6)
  assert.equal(cfg.movements.A.retired_movement, undefined)
  // untouched variant keeps pure defaults
  assert.equal(cfg.movements.B.bb_clean.reps, 6)
})

test('mergeCapacityConfig: invalid rounds falls back to default 3', () => {
  assert.equal(mergeCapacityConfig({}, 5).rounds, 3)
  assert.equal(mergeCapacityConfig({}, null).rounds, 3)
})
