import { test } from 'vitest'
import assert from 'node:assert/strict'
import { daysSinceStart, protocolDay, suggestedPhase, effectivePhase } from './recovery'

test('daysSinceStart / protocolDay: start day = 0 / day 1', () => {
  assert.equal(daysSinceStart('2026-06-01', '2026-06-01'), 0)
  assert.equal(daysSinceStart('2026-06-01', '2026-06-22'), 21)
  assert.equal(protocolDay('2026-06-01', '2026-06-01'), 1)
  assert.equal(protocolDay('2026-06-01', '2026-06-22'), 22)
})

test('suggestedPhase boundaries: 0–20 acute, 21–56 build, 57+ maintenance', () => {
  assert.equal(suggestedPhase('2026-06-01', '2026-06-01'), 'acute') // day 0
  assert.equal(suggestedPhase('2026-06-01', '2026-06-21'), 'acute') // day 20
  assert.equal(suggestedPhase('2026-06-01', '2026-06-22'), 'build') // day 21
  assert.equal(suggestedPhase('2026-06-01', '2026-07-27'), 'build') // day 56
  assert.equal(suggestedPhase('2026-06-01', '2026-07-28'), 'maintenance') // day 57
})

test('effectivePhase: override wins, else suggestion', () => {
  assert.equal(effectivePhase('2026-06-01', 'maintenance', '2026-06-01'), 'maintenance') // overridden
  assert.equal(effectivePhase('2026-06-01', null, '2026-06-01'), 'acute') // auto
  assert.equal(effectivePhase('2026-06-01', undefined, '2026-06-22'), 'build')
})
