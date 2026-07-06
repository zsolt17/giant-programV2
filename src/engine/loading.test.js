import { test } from 'vitest'
import assert from 'node:assert/strict'
import { round, fmt, schemeFor, dayTop, expandDayTops, giantSets, set1Weight, warmupSets, volumeWeight, deloadTop, testCeiling, liftMode, incFor } from './loading'

test('round: nearest 2.5 kg', () => {
  assert.equal(round(120), 120)
  assert.equal(round(131.2), 130)
  assert.equal(round(144), 145)
  assert.equal(round(112), 112.5)
})

test('fmt: integer vs decimal', () => {
  assert.equal(fmt(160), '160 kg')
  assert.equal(fmt(127.5), '127.5 kg')
})

test('fmt: null/undefined/NaN -> dash (no crash on weightless sessions)', () => {
  assert.equal(fmt(null), '—')
  assert.equal(fmt(undefined), '—')
  assert.equal(fmt(NaN), '—')
})

test('schemeFor: rep schemes (reps differentiate the days)', () => {
  assert.deepEqual(schemeFor('hard').sets, [8, 6, 4, 2])
  assert.deepEqual(schemeFor('medium').sets, [9, 7, 5, 3])
  assert.deepEqual(schemeFor('light').sets, [10, 8, 6, 4])
})

test('dayTop: Hard 100% / Medium 95% / Light 90% off the Hard anchor, rounded', () => {
  assert.equal(dayTop(160, 'hard'), 160)
  assert.equal(dayTop(160, 'medium'), 152.5) // 152 -> 152.5
  assert.equal(dayTop(160, 'light'), 145) // 144 -> 145
})

test('expandDayTops: the three day tops from one anchor', () => {
  assert.deepEqual(expandDayTops(160), { hard: 160, medium: 152.5, light: 145 })
})

test('dayTop: lift seam is accepted and currently identical for all lifts', () => {
  for (const lift of ['deadlift', 'ohp', 'squat', 'dips']) {
    assert.equal(dayTop(100, 'medium', lift), dayTop(100, 'medium'))
  }
})

test('giantSets: uniform 85/90/95/100 ladder off the day top (hard @ 160)', () => {
  const sets = giantSets(160, 'hard')
  assert.deepEqual(sets.map((s) => s.weight), [135, 145, 152.5, 160]) // round(136,144,152,160)
  assert.deepEqual(sets.map((s) => s.pct), [0.85, 0.9, 0.95, 1.0])
  assert.deepEqual(sets.map((s) => s.reps), [8, 6, 4, 2]) // reps still per-difficulty
  assert.equal(sets[3].isTop, true)
  assert.equal(sets[3].weight, 160) // top set exact, not re-rounded
})

test('giantSets: same ladder for medium, only reps differ', () => {
  const sets = giantSets(150, 'medium')
  assert.deepEqual(sets.map((s) => s.weight), [127.5, 135, 142.5, 150]) // round(127.5,135,142.5,150)
  assert.deepEqual(sets.map((s) => s.reps), [9, 7, 5, 3])
})

test('set1Weight: 85% of the day top', () => {
  assert.equal(set1Weight(160), 135) // round(136)
})

test('warmupSets: percentages of Set 1 (= 85% of top)', () => {
  const wu = warmupSets(160) // set1 = 135
  assert.equal(wu.length, 4)
  assert.deepEqual(wu.map((s) => s.reps), [8, 5, 3, 2])
  assert.deepEqual(wu.map((s) => s.weight), [round(135 * 0.4), round(135 * 0.55), round(135 * 0.7), round(135 * 0.85)])
})

test('volumeWeight: 80% of the day top, rounded', () => {
  assert.equal(volumeWeight(160), 127.5) // 128 -> 127.5
})

test('deloadTop: ~70% of top, rounded', () => {
  assert.equal(deloadTop(160), 112.5)
})

// ---- per-lift rounding (dips / pull-ups at 0.5 kg) --------------------------

test('incFor: 2.5 for barbell lifts and default, 0.5 for dips/pullup', () => {
  assert.equal(incFor('deadlift'), 2.5)
  assert.equal(incFor(), 2.5)
  assert.equal(incFor('dips'), 0.5)
  assert.equal(incFor('pullup'), 0.5)
})

test('round honors the increment', () => {
  assert.equal(round(9.3, 0.5), 9.5)
  assert.equal(round(9.2, 0.5), 9)
  assert.equal(round(9.3), 10) // default 2.5
})

test('anchor is NEVER rounded: hard day-top returns the anchor exactly', () => {
  assert.equal(dayTop(1, 'hard', 'dips'), 1) // would snap to 0 at 2.5 kg rounding
  assert.equal(dayTop(161, 'hard'), 161) // barbell anchors also exact
})

test('dips day-tops and ladder round at 0.5', () => {
  // anchor 10: medium = round(9.5, .5) = 9.5, light = round(9, .5) = 9
  assert.deepEqual(expandDayTops(10, 'dips'), { hard: 10, medium: 9.5, light: 9 })
  // ladder off top 10 at 0.5: [8.5, 9, 9.5, 10] (top exact)
  assert.deepEqual(giantSets(10, 'hard', 'dips').map((s) => s.weight), [8.5, 9, 9.5, 10])
  assert.equal(volumeWeight(10, 'dips'), 8)
  assert.equal(set1Weight(10, 'dips'), 8.5)
  assert.equal(deloadTop(10, 'dips'), 7)
})

test('dips build-up rounds at 0.5; tiny loads may hit 0 (= BW)', () => {
  // top 1 → set1 = round(0.85, .5) = 1; wu = round(1×[.4,.55,.7,.85], .5) = [0.5, 0.5, 0.5, 1]
  assert.deepEqual(warmupSets(1, 'dips').map((s) => s.weight), [0.5, 0.5, 0.5, 1])
  // top 0.5 → set1 = 0.5; first build-up rounds to 0 → bodyweight
  assert.equal(warmupSets(0.5, 'dips')[0].weight, 0)
})

test('testCeiling: ~+5% of the anchor at the lift increment', () => {
  assert.equal(testCeiling(160, 'deadlift'), 167.5) // round(168, 2.5)
  assert.equal(testCeiling(67.5, 'ohp'), 70) // round(70.875, 2.5)
  assert.equal(testCeiling(10, 'dips'), 10.5) // round(10.5, 0.5)
})

test('liftMode: 0/null/undefined = bodyweight, any weight = weighted', () => {
  assert.equal(liftMode(0), 'bodyweight')
  assert.equal(liftMode(null), 'bodyweight')
  assert.equal(liftMode(undefined), 'bodyweight')
  assert.equal(liftMode(0.5), 'weighted')
  assert.equal(liftMode(10), 'weighted')
})
