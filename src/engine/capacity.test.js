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

test('both variants define exactly 7 ordered movements', () => {
  for (const v of CAPACITY_VARIANTS) {
    assert.equal(CAPACITY_MOVEMENTS[v].length, 7)
    // keys are unique within a variant (they're the persistence key)
    const keys = CAPACITY_MOVEMENTS[v].map((m) => m.key)
    assert.equal(new Set(keys).size, 7)
  }
})

test('spec defaults: loaded flags and rep targets (2026-07-30 revision)', () => {
  // Variant A: DB Snatch 4/side (loaded), Pull-ups 6, Double Unders 20.
  // GHD and Single Unders retired — double unders replace the singles.
  assert.deepEqual(
    CAPACITY_MOVEMENTS.A.map((m) => [m.key, m.reps, !!m.loaded]),
    [
      ['db_snatch', 4, true],
      ['pullups', 6, false],
      ['dips', 8, false],
      ['reverse_lunges', 8, true],
      ['goblet_curl', 10, true],
      ['double_unders', 20, false],
      ['box_over_burpees', 8, false],
    ]
  )
  // Variant B: Hang BB Snatch 5 (loaded — replaces the BB Clean), Double Unders
  // 20, Bike 30 sec for calories. Toes-to-Bar retired (it lives on as the OHP
  // day's Giant Block accessory, a different table).
  assert.deepEqual(
    CAPACITY_MOVEMENTS.B.map((m) => [m.key, m.reps, !!m.loaded]),
    [
      ['hang_bb_snatch', 5, true],
      ['chinups', 6, false],
      ['pushups', 12, false],
      ['walking_lunges', 10, true],
      ['bb_curl', 10, true],
      ['double_unders', 20, false],
      ['bike', 30, false],
    ]
  )
  // Retired keys are gone from the content (stored rows for them are ignored on read).
  for (const v of CAPACITY_VARIANTS) {
    for (const dead of ['ghd', 'single_unders', 'bb_clean', 'toes_to_bar']) {
      assert.equal(movementDef(v, dead), undefined, `${dead} should be retired from variant ${v}`)
    }
  }
  // The Bike is the calories movement; lunges are load-optional in both variants
  assert.equal(movementDef('B', 'bike')?.calories, true)
  // Per-limb rep semantics: the rep value IS per side/leg (no totals, no hardcoded hints)
  assert.equal(movementDef('A', 'db_snatch')?.repUnit, '/side')
  assert.equal(movementDef('A', 'db_snatch')?.note, undefined)
  assert.equal(movementDef('A', 'reverse_lunges')?.repUnit, '/leg')
  assert.equal(movementDef('B', 'walking_lunges')?.repUnit, '/leg')
  assert.equal(movementDef('A', 'reverse_lunges')?.loadOptional, true)
  assert.equal(movementDef('B', 'walking_lunges')?.loadOptional, true)
})

test('defaultCapacityConfig: every movement present, default reps, no weights, 3 rounds', () => {
  const cfg = defaultCapacityConfig()
  assert.equal(cfg.rounds, CAPACITY_ROUNDS_DEFAULT)
  assert.equal(cfg.movements.A.db_snatch.reps, 4)
  assert.equal(cfg.movements.A.db_snatch.weight, null)
  assert.equal(cfg.movements.B.bike.reps, 30)
  assert.equal(Object.keys(cfg.movements.A).length, 7)
  assert.equal(Object.keys(cfg.movements.B).length, 7)
})

test('mergeCapacityConfig: stored values override defaults; nulls fall back; unknown keys ignored', () => {
  const cfg = mergeCapacityConfig(
    {
      A: {
        db_snatch: { reps: 10, weight: 17.5 },
        pullups: { reps: null, weight: null }, // null reps -> default 6
        retired_movement: { reps: 99, weight: 99 }, // unknown -> ignored
        // A RETIRED movement's stored row (still in the DB) must be ignored too —
        // this is what keeps a content change from resurrecting old prescriptions.
        single_unders: { reps: 40, weight: null },
      },
    },
    4
  )
  assert.equal(cfg.rounds, 4)
  assert.deepEqual(cfg.movements.A.db_snatch, { reps: 10, weight: 17.5 })
  assert.equal(cfg.movements.A.pullups.reps, 6)
  assert.equal(cfg.movements.A.retired_movement, undefined)
  assert.equal(cfg.movements.A.single_unders, undefined)
  // untouched variant keeps pure defaults
  assert.equal(cfg.movements.B.hang_bb_snatch.reps, 5)
})

test('mergeCapacityConfig: invalid rounds falls back to default 3', () => {
  assert.equal(mergeCapacityConfig({}, 5).rounds, 3)
  assert.equal(mergeCapacityConfig({}, null).rounds, 3)
})

// ---- capacity time-trend helpers (Trends readout ONLY) ----------------------
// The time-based S6 was retired on 2026-07-31 — rollingVariantAvg, S6_THRESHOLD,
// CAPACITY_ROLLING_N and the per-point `slow` flag went with it. What remains is
// the per-round series the Trends chart draws.
import { perRoundSeconds, buildCapacityPoints } from './capacity'

const sess = (id, date, over = {}) => ({ id, date, weekType: 'training', cycle: 1, week: 1, ...over })
const log = (sessionId, variant, totalTimeSeconds, roundsCompleted = 3) => ({ sessionId, variant, roundsCompleted, totalTimeSeconds, calories: null, rpe: '', notes: '' })

test('perRoundSeconds: time/rounds; null when either is unusable', () => {
  assert.equal(perRoundSeconds(log('x', 'A', 300, 3)), 100)
  assert.equal(perRoundSeconds(log('x', 'A', 300, 2)), 150) // short session still normalizes
  assert.equal(perRoundSeconds(log('x', 'A', null, 3)), null)
  assert.equal(perRoundSeconds(log('x', 'A', 300, 0)), null)
})

test('buildCapacityPoints: date-ordered, incomplete and orphan logs dropped', () => {
  const sessions = [sess('a1', '2026-07-27'), sess('a2', '2026-07-29'), sess('a3', '2026-07-31'), sess('a4', '2026-08-03'), sess('a5', '2026-08-05')]
  const logs = [
    log('a4', 'A', 342),
    log('a1', 'A', 300),
    log('a2', 'A', 300),
    log('a3', 'A', 300),
    log('a5', 'A', 400),
    log('orphan', 'A', 300), // no matching session → dropped
    log('x', 'A', null), // unusable time → dropped
  ]
  const pts = buildCapacityPoints(logs, sessions)
  assert.deepEqual(pts.map((p) => p.sessionId), ['a1', 'a2', 'a3', 'a4', 'a5'])
  assert.equal(pts[3].perRoundS, 114)
  // No judgement is stamped on a point any more — it is data for a chart.
  assert.deepEqual(Object.keys(pts[0]).sort(), ['date', 'perRoundS', 'sessionId', 'variant'])
})

test('buildCapacityPoints: the optional exclusion predicate still filters', () => {
  const sessions = [sess('a1', '2026-07-27'), sess('a2', '2026-07-29', { weekType: 'deload' })]
  const pts = buildCapacityPoints([log('a1', 'A', 300), log('a2', 'A', 300)], sessions, (s) => s.weekType === 'deload')
  assert.deepEqual(pts.map((p) => p.sessionId), ['a1'])
})
