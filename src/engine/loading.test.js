import { test } from 'vitest'
import assert from 'node:assert/strict'
import { round, fmt, schemeFor, dayTop, expandDayTops, giantSets, set1Weight, warmupSets, volumeWeight, deloadTop } from './loading'

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
