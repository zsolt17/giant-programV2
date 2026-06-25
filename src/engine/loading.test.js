import { test } from 'vitest'
import assert from 'node:assert/strict'
import { round, fmt, schemeFor, giantSets, set1Weight, warmupSets, volumeWeight, deloadTop } from './loading'

test('round: nearest 2.5 kg', () => {
  assert.equal(round(120), 120)
  assert.equal(round(131.2), 130) // 160 * 0.82
  assert.equal(round(144), 145) // 160 * 0.90
  assert.equal(round(112), 112.5) // 160 * 0.70
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

test('schemeFor: rep schemes', () => {
  assert.deepEqual(schemeFor('hard').sets, [8, 6, 4, 2])
  assert.deepEqual(schemeFor('medium').sets, [9, 7, 5, 3])
  assert.deepEqual(schemeFor('light').sets, [10, 8, 6, 4])
})

test('giantSets: hard @ top 160 -> [120,130,145,160]', () => {
  const sets = giantSets(160, 'hard')
  assert.deepEqual(sets.map((s) => s.weight), [120, 130, 145, 160])
  assert.deepEqual(sets.map((s) => s.reps), [8, 6, 4, 2])
  assert.equal(sets[3].isTop, true)
  assert.equal(sets[3].weight, 160) // top set is exact, not rounded
})

test('set1Weight: hard @ 160 = 120', () => {
  assert.equal(set1Weight(160, 'hard'), 120)
})

test('warmupSets: percentages of Set 1', () => {
  const wu = warmupSets(160, 'hard') // set1 = 120
  assert.equal(wu.length, 4)
  assert.deepEqual(wu.map((s) => s.reps), [8, 5, 3, 2])
  assert.deepEqual(wu.map((s) => s.weight), [round(120 * 0.4), round(120 * 0.55), round(120 * 0.7), round(120 * 0.85)])
})

test('volumeWeight: 80% of top, rounded', () => {
  assert.equal(volumeWeight(160), 127.5) // 128 -> 127.5
})

test('deloadTop: ~70% of top, rounded', () => {
  assert.equal(deloadTop(160), 112.5) // 112 -> 112.5
})
