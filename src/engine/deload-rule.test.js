import { test } from 'vitest'
import assert from 'node:assert/strict'
import { rpeNum, computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor, capacityPointsForSignals } from './deload-rule'

// Minimal session factory.
function S(id, over = {}) {
  return { id, rpe: '', barSpeed: '', volDone: true, carrySkipped: false, carrySkipReason: '', ...over }
}
// Capacity log factory (joined to a session by id).
function L(sessionId, variant, totalTimeSeconds, roundsCompleted = 3) {
  return { sessionId, variant, roundsCompleted, totalTimeSeconds, calories: null, rpe: '', notes: '' }
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

test('S7 (giant block not completed — renumbered from the Giant-era S6) fires; completed/blank do not', () => {
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

// ---- Giant Run pooling ------------------------------------------------------
function R(id, over = {}) {
  return {
    id, macroId: 'm', date: '2026-04-21', cycle: 1, week: 2, weekType: 'training',
    runType: 'easy', distanceKm: null, durationS: null, avgHr: null, completion: 'completed', notes: '',
    ...over,
  }
}

test('lift + run signals pool: 2 lift occ (1 session) + 1 run occ -> fired', () => {
  const sessions = [S('a', { rpe: 'R9.5', volDone: false })] // 2 occurrences, 1 session
  const runs = [R('r1', { completion: 'cut_fatigue' })] // R1: +1 occurrence, 2nd "session"
  const sig = computeWeekSignals(sessions, runs)
  assert.equal(sig.occurrences, 3)
  assert.equal(sig.sessionCount, 2)
  assert.equal(sig.fired, true)
  assert.equal(sig.types.has('R1'), true)
})

test('cut_schedule run is neutral; runs alone can fire the pooled trigger', () => {
  assert.equal(computeWeekSignals([], [R('r1', { completion: 'cut_schedule' })]).occurrences, 0)
  const sig = computeWeekSignals([], [
    R('r1', { completion: 'cut_fatigue' }),
    R('r2', { id: 'r2', completion: 'felt_heavy' }),
    R('r3', { id: 'r3', completion: 'felt_heavy' }),
  ])
  assert.equal(sig.occurrences, 3)
  assert.equal(sig.fired, true)
})

test('shouldRecommendDeload sees run-only weeks', () => {
  const runs = [
    R('r1', { completion: 'cut_fatigue' }),
    R('r2', { id: 'r2', completion: 'felt_heavy' }),
    R('r3', { id: 'r3', completion: 'felt_heavy' }),
  ]
  assert.equal(shouldRecommendDeload({ prevWeekRuns: runs }), true)
  assert.equal(shouldRecommendDeload({ prevWeekRuns: runs, breakComing: true }), false)
})

// ---- S6: GiantFit capacity time trend ---------------------------------------
// Per-round time > rolling same-variant avg (last 3) × S6_THRESHOLD in 2+
// CONSECUTIVE capacity sessions = ONE occurrence. Deload weeks excluded from
// evaluation AND from the rolling averages.

// GiantFit training-session factory (dated, positioned).
function CS(id, date, week = 1, over = {}) {
  return S(id, { date, weekType: 'training', cycle: 1, week, ...over })
}

// Baseline: three variant-A sessions at 100 s/round (weeks 1–2).
const BASE_SESS = [CS('a1', '2026-07-27', 1), CS('a2', '2026-07-29', 1), CS('a3', '2026-07-31', 1)]
const BASE_LOGS = [L('a1', 'A', 300), L('a2', 'A', 300), L('a3', 'A', 300)]

test('S6: two consecutive slow capacity sessions = ONE occurrence, dates exposed', () => {
  const s4 = CS('a4', '2026-08-03', 2)
  const s5 = CS('a5', '2026-08-05', 2)
  // a4: avg(100,100,100)=100 → >115 needed → 150 slow. a5: avg(100,100,150)≈116.7
  // → >134.2 needed → 140 slow.
  const logs = [...BASE_LOGS, L('a4', 'A', 450), L('a5', 'A', 420)]
  const points = capacityPointsForSignals(logs, [...BASE_SESS, s4, s5], 3, {})
  const sig = computeWeekSignals([s4, s5], [], [], points)
  assert.equal(sig.types.has('S6'), true)
  assert.equal(sig.occurrences, 1) // 2+ consecutive = ONE occurrence
  assert.equal(sig.sessionCount, 2) // both offending sessions count toward the spread
  assert.deepEqual(sig.s6Dates, ['2026-08-03', '2026-08-05'])
  // The streak is attributed to the week holding its later session — not week 1.
  assert.equal(computeWeekSignals(BASE_SESS, [], [], points).types.has('S6'), false)
})

test('S6 cold start: no evaluation until a variant has 3 logged sessions', () => {
  const sess = [CS('a1', '2026-07-27'), CS('a2', '2026-07-29'), CS('a3', '2026-07-31')]
  // Only 2 priors before a3 — even a huge a3 is not "slow".
  const logs = [L('a1', 'A', 300), L('a2', 'A', 300), L('a3', 'A', 900)]
  const points = capacityPointsForSignals(logs, sess, 3, {})
  assert.equal(points.every((p) => p.slow === false), true)
  assert.equal(computeWeekSignals(sess, [], [], points).types.has('S6'), false)
})

test('S6 needs CONSECUTIVE slow sessions: slow-ok-slow does not fire', () => {
  const s4 = CS('a4', '2026-08-03', 2)
  const s5 = CS('a5', '2026-08-05', 2)
  const s6 = CS('a6', '2026-08-07', 2)
  // a4 slow (150), a5 back to normal (drops the streak), a6 slow again.
  const logs = [...BASE_LOGS, L('a4', 'A', 450), L('a5', 'A', 300), L('a6', 'A', 450)]
  const points = capacityPointsForSignals(logs, [...BASE_SESS, s4, s5, s6], 3, {})
  assert.equal(computeWeekSignals([s4, s5, s6], [], [], points).types.has('S6'), false)
})

test('S6: a streak of 3 slow sessions is still ONE occurrence', () => {
  const s4 = CS('a4', '2026-08-03', 2)
  const s5 = CS('a5', '2026-08-05', 2)
  const s6 = CS('a6', '2026-08-07', 2)
  // a6: avg(100,150,140)=130 → >149.5 needed → 160 slow.
  const logs = [...BASE_LOGS, L('a4', 'A', 450), L('a5', 'A', 420), L('a6', 'A', 480)]
  const points = capacityPointsForSignals(logs, [...BASE_SESS, s4, s5, s6], 3, {})
  const sig = computeWeekSignals([s4, s5, s6], [], [], points)
  assert.equal(sig.occurrences, 1)
  assert.deepEqual(sig.s6Dates, ['2026-08-03', '2026-08-05', '2026-08-07'])
})

test('S6 variant mix: consecutive by session order, each vs its OWN variant average', () => {
  // A baseline ~100 s/rnd, B baseline ~200 s/rnd, then an A-slow and a B-slow
  // back to back — consecutive in the ordered series → one occurrence.
  const sess = [
    CS('a1', '2026-07-27', 1), CS('b1', '2026-07-29', 1), CS('a2', '2026-07-31', 1),
    CS('b2', '2026-08-03', 2), CS('a3', '2026-08-05', 2), CS('b3', '2026-08-07', 2),
    CS('a4', '2026-08-10', 3), CS('b4', '2026-08-12', 3),
  ]
  const logs = [
    L('a1', 'A', 300), L('b1', 'B', 600), L('a2', 'A', 300),
    L('b2', 'B', 600), L('a3', 'A', 300), L('b3', 'B', 600),
    L('a4', 'A', 450), // A: avg 100 → >115 → 150 slow
    L('b4', 'B', 700), // B: avg 200 → >230 → 233 slow
  ]
  const points = capacityPointsForSignals(logs, sess, 3, {})
  const week3 = sess.filter((s) => s.week === 3)
  const sig = computeWeekSignals(week3, [], [], points)
  assert.equal(sig.types.has('S6'), true)
  assert.equal(sig.occurrences, 1)
})

test('S6 deload exclusion: deload-week sessions are neither evaluated nor averaged', () => {
  // A reactive-deload week (flagged M3C1W3) holds a slow log — it must vanish
  // from the series entirely, so the later rolling average skips the gap.
  const d1 = CS('d1', '2026-08-10', 3)
  const s4 = CS('a4', '2026-08-17', 4)
  const s5 = CS('a5', '2026-08-19', 4)
  const logs = [...BASE_LOGS, L('d1', 'A', 900), L('a4', 'A', 450), L('a5', 'A', 420)]
  const deloads = { M3C1W3: true }
  const points = capacityPointsForSignals(logs, [...BASE_SESS, d1, s4, s5], 3, deloads)
  assert.equal(points.some((p) => p.sessionId === 'd1'), false) // excluded
  // a4's average is still the clean 100 baseline (not polluted by d1's 300).
  const sig = computeWeekSignals([s4, s5], [], [], points)
  assert.equal(sig.types.has('S6'), true)
  // End-of-macro deload sessions (weekType 'deload') are excluded the same way.
  const em = CS('em', '2026-10-19', null, { weekType: 'deload', cycle: null, week: null })
  const p2 = capacityPointsForSignals([...BASE_LOGS, L('em', 'A', 900)], [...BASE_SESS, em], 3, {})
  assert.equal(p2.some((p) => p.sessionId === 'em'), false)
})

test('S6 normalizes by rounds: a short session still counts via per-round time', () => {
  const s4 = CS('a4', '2026-08-03', 2)
  const s5 = CS('a5', '2026-08-05', 2)
  // a4: only 2 of 3 rounds, 300 s → 150 s/rnd (slow). a5: 420/3 = 140 (slow).
  const logs = [...BASE_LOGS, L('a4', 'A', 300, 2), L('a5', 'A', 420)]
  const points = capacityPointsForSignals(logs, [...BASE_SESS, s4, s5], 3, {})
  assert.equal(computeWeekSignals([s4, s5], [], [], points).types.has('S6'), true)
})

test('S6 pools into the weekly trigger with the lift signals', () => {
  const s4 = CS('a4', '2026-08-03', 2, { rpe: 'R9.5', volDone: false }) // S1 + S2
  const s5 = CS('a5', '2026-08-05', 2)
  const logs = [...BASE_LOGS, L('a4', 'A', 450), L('a5', 'A', 420)]
  const points = capacityPointsForSignals(logs, [...BASE_SESS, s4, s5], 3, {})
  const sig = computeWeekSignals([s4, s5], [], [], points)
  assert.equal(sig.occurrences, 3) // S1 + S2 + S6
  assert.equal(sig.fired, true) // 3 occ across 2 sessions
})
