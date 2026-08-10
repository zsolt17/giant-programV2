import { test } from 'vitest'
import assert from 'node:assert/strict'
import { rpeNum, computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor } from './deload-rule'

// Minimal session factory.
function S(id, over = {}) {
  return { id, rpe: '', barSpeed: '', volDone: true, volumeDifficulty: 'light', carrySkipped: false, carrySkipReason: '', ...over }
}

test('rpeNum parses R-notation; blanks are 0', () => {
  assert.equal(rpeNum('R9.5'), 9.5)
  assert.equal(rpeNum('R8'), 8)
  assert.equal(rpeNum(''), 0)
  assert.equal(rpeNum(undefined), 0)
})

test('no signals -> not fired', () => {
  const r = computeWeekSignals([S('a', { rpe: 'R7' }), S('b', { rpe: 'R8' })])
  assert.equal(r.occurrences, 0)
  assert.equal(r.fired, false)
})

test('S1 needs R9.5+, R9 does not count', () => {
  assert.equal(computeWeekSignals([S('a', { rpe: 'R9' })]).occurrences, 0)
  assert.equal(computeWeekSignals([S('a', { rpe: 'R9.5' })]).types.has('S1'), true)
})

test('S7 (giant block not completed as prescribed) fires; completed/blank do not', () => {
  assert.equal(computeWeekSignals([S('a', { blockCompletion: 'stopped_fatigue' })]).types.has('S7'), true)
  assert.equal(computeWeekSignals([S('a', { blockCompletion: 'completed' })]).occurrences, 0)
  assert.equal(computeWeekSignals([S('a', {})]).occurrences, 0) // legacy/unset -> no signal
})

test('one catastrophic day (3 occ, 1 session) never fires', () => {
  const r = computeWeekSignals([S('a', { rpe: 'R10', volDone: false, carrySkipped: true, carrySkipReason: 'fatigue' })])
  assert.equal(r.occurrences, 3)
  assert.equal(r.sessionCount, 1)
  assert.equal(r.fired, false) // needs >= 2 sessions
})

test('3 occurrences across 2 sessions -> fired', () => {
  const r = computeWeekSignals([
    S('a', { rpe: 'R9.5', volDone: false }), // S1 + S2 (2 occ, session a)
    S('b', { carrySkipped: true, carrySkipReason: 'fatigue' }), // S3 (session b)
  ])
  assert.equal(r.occurrences, 3)
  assert.equal(r.sessionCount, 2)
  assert.equal(r.fired, true)
})

test('carry skipped for schedule (not fatigue) is not a signal', () => {
  const r = computeWeekSignals([S('a', { carrySkipped: true, carrySkipReason: 'schedule' })])
  assert.equal(r.occurrences, 0)
})

test('S5: bar speed down in 2+ sessions is one occurrence spanning those sessions', () => {
  const r = computeWeekSignals([S('a', { barSpeed: 'down' }), S('b', { barSpeed: 'down' })])
  assert.equal(r.types.has('S5'), true)
  assert.equal(r.occurrences, 1) // S5 counts once
  assert.equal(r.sessionCount, 2)
  assert.equal(r.fired, false) // only 1 occurrence
})

test('S5 + two more occurrences -> fired across enough sessions', () => {
  const r = computeWeekSignals([
    S('a', { barSpeed: 'down' }),
    S('b', { barSpeed: 'down' }),
    S('c', { rpe: 'R9.5', volDone: false }), // S1 + S2
  ])
  assert.equal(r.occurrences, 3) // S5 + S1 + S2
  assert.equal(r.sessionCount, 3) // a, b, c
  assert.equal(r.fired, true)
})

test('exactly 2 occurrences does not fire', () => {
  const r = computeWeekSignals([S('a', { rpe: 'R9.5' }), S('b', { volDone: false })])
  assert.equal(r.occurrences, 2)
  assert.equal(r.fired, false)
})

test('shouldRecommendDeload respects cap / already-deloaded / break exemptions', () => {
  const firedWeek = [S('a', { rpe: 'R9.5', volDone: false }), S('b', { carrySkipped: true, carrySkipReason: 'fatigue' })]
  assert.equal(shouldRecommendDeload({ prevWeekSessions: firedWeek }), true)
  assert.equal(shouldRecommendDeload({ prevWeekSessions: firedWeek, alreadyDeloaded: true }), false)
  assert.equal(shouldRecommendDeload({ prevWeekSessions: firedWeek, usedThisMeso: true }), false)
  assert.equal(shouldRecommendDeload({ prevWeekSessions: firedWeek, breakComing: true }), false)
  assert.equal(shouldRecommendDeload({ prevWeekSessions: [] }), false)
})

test('helpers: weekKeyFor + usedDeloadThisMeso', () => {
  assert.equal(weekKeyFor(2, 3, 4), 'M2C3W4')
  assert.equal(usedDeloadThisMeso({ M2C3W2: true }, 2, 3), true)
  assert.equal(usedDeloadThisMeso({ M2C3W2: true }, 2, 1), false)
})

// ---- S2: no Volume block that session (C3 week 4, or deload) ----------------

test('S2: does NOT fire on a session with no Volume block (volumeDifficulty null — C3 week 4 or deload)', () => {
  const s = S('a', { volDone: false, volumeDifficulty: null })
  const r = computeWeekSignals([s])
  assert.equal(r.types.has('S2'), false)
  assert.equal(r.occurrences, 0)
})

test('S2: still fires on a session that DOES have a Volume block', () => {
  const s = S('a', { volDone: false, volumeDifficulty: 'light' })
  const r = computeWeekSignals([s])
  assert.equal(r.types.has('S2'), true)
  assert.equal(r.occurrences, 1)
})

test('C3 week 4 (no Volume block) pools correctly alongside a firing S3/S7', () => {
  const week = [
    S('a', { volDone: false, volumeDifficulty: null }), // S2 suppressed (C3 W4)
    S('b', { carrySkipped: true, carrySkipReason: 'fatigue' }), // S3 — a real C3 carry day
    S('c', { blockCompletion: 'stopped_fatigue' }), // S7
  ]
  const r = computeWeekSignals(week)
  assert.deepEqual([...r.types].sort(), ['S3', 'S7'])
  assert.equal(r.types.has('S2'), false)
  assert.equal(r.occurrences, 2)
  assert.equal(r.sessionCount, 2)
  assert.equal(r.fired, false) // 2 occurrences, needs 3
})
