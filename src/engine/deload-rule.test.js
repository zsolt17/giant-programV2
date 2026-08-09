import { test } from 'vitest'
import assert from 'node:assert/strict'
import { rpeNum, computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor, capacityLogsForSessions } from './deload-rule'
import { CAPACITY_COMPLETION, isCapacityFatigue } from './constants'

// Minimal session factory.
function S(id, over = {}) {
  return { id, rpe: '', barSpeed: '', volDone: true, carrySkipped: false, carrySkipReason: '', ...over }
}
// Capacity log factory (joined to a session by id). `completion` is the S6
// input; undefined stands in for a legacy pre-0021 row.
function L(sessionId, variant, completion, totalTimeSeconds = 300, roundsCompleted = 3) {
  return { sessionId, variant, roundsCompleted, totalTimeSeconds, calories: null, rpe: '', completion, notes: '' }
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

// ---- S6: capacity adherence -------------------------------------------------
// Replaced the capacity TIME trend on 2026-07-31. One occurrence per capacity
// log in the week the ATHLETE attributed to fatigue — no streak rule, no cold
// start, no rolling baseline. Any *_fatigue value fires; nothing else does.

// GiantFit training-session factory (dated, positioned).
function CS(id, date, week = 1, over = {}) {
  return S(id, { date, weekType: 'training', cycle: 1, week, ...over })
}

test('the firing rule lives in the value names: only *_fatigue values fire', () => {
  // A guard on the option list itself — adding a value without thinking about
  // attribution should break here, not silently change the trigger's behaviour.
  assert.deepEqual(
    CAPACITY_COMPLETION.map((o) => [o.id, isCapacityFatigue(o.id)]),
    [
      ['completed', false],
      ['cut_short_fatigue', true],
      ['cut_short_time', false],
      ['scaled_fatigue', true],
      ['scaled_other', false],
    ]
  )
})

test('S6: each of the five completion values, evaluated end to end', () => {
  for (const { id } of CAPACITY_COMPLETION) {
    const sess = CS('a1', '2026-07-27')
    const sig = computeWeekSignals([sess], [], [], [L('a1', 'A', id)])
    assert.equal(sig.types.has('S6'), isCapacityFatigue(id), `S6 wrong for ${id}`)
    assert.equal(sig.occurrences, isCapacityFatigue(id) ? 1 : 0, `occurrences wrong for ${id}`)
  }
})

test('S6: a legacy row (null/undefined completion) is inert', () => {
  const sess = CS('a1', '2026-07-27')
  assert.equal(computeWeekSignals([sess], [], [], [L('a1', 'A', undefined)]).types.has('S6'), false)
  assert.equal(computeWeekSignals([sess], [], [], [L('a1', 'A', null)]).types.has('S6'), false)
  assert.equal(computeWeekSignals([sess], [], [], [L('a1', 'A', '')]).types.has('S6'), false)
})

test('S6: one occurrence PER fatigue-attributed session, with its dates exposed', () => {
  const s1 = CS('a1', '2026-07-27', 1)
  const s2 = CS('a2', '2026-07-29', 1)
  const logs = [L('a1', 'A', 'cut_short_fatigue'), L('a2', 'B', 'scaled_fatigue')]
  const sig = computeWeekSignals([s1, s2], [], [], logs)
  assert.equal(sig.occurrences, 2) // NOT one — no streak collapsing anymore
  assert.equal(sig.sessionCount, 2)
  assert.deepEqual(sig.s6Dates, ['2026-07-27', '2026-07-29'])
})

test('S6: two fatigue capacity sessions + one other signal -> trigger fires', () => {
  const s1 = CS('a1', '2026-07-27', 1, { volDone: false }) // S2
  const s2 = CS('a2', '2026-07-29', 1)
  const logs = [L('a1', 'A', 'scaled_fatigue'), L('a2', 'B', 'cut_short_fatigue')]
  const sig = computeWeekSignals([s1, s2], [], [], logs)
  assert.equal(sig.occurrences, 3) // S2 + S6 + S6
  assert.equal(sig.sessionCount, 2)
  assert.equal(sig.fired, true)
})

test('S6: three fatigue logs on the SAME date do not satisfy the 2-session half', () => {
  // Three occurrences, but all on one session id — severity without a pattern.
  const s1 = CS('a1', '2026-07-27', 1)
  const logs = [L('a1', 'A', 'cut_short_fatigue'), L('a1', 'A', 'scaled_fatigue'), L('a1', 'A', 'cut_short_fatigue')]
  const sig = computeWeekSignals([s1], [], [], logs)
  assert.equal(sig.occurrences, 3)
  assert.equal(sig.sessionCount, 1)
  assert.equal(sig.fired, false)
  assert.deepEqual(sig.s6Dates, ['2026-07-27']) // one date, not three
})

test('S6: a fatigue capacity block on a day that already fired counts as ONE session', () => {
  // The capacity log shares the lift session's id, so the spread must not
  // double-count the day.
  const s1 = CS('a1', '2026-07-27', 1, { rpe: 'R9.5' }) // S1
  const sig = computeWeekSignals([s1], [], [], [L('a1', 'A', 'cut_short_fatigue')])
  assert.equal(sig.occurrences, 2)
  assert.equal(sig.sessionCount, 1)
  assert.equal(sig.fired, false) // 2 occ, 1 session
})

test('a lift-only caller passing no capacity logs computes S1/S2/S3/S5/S7 identically', () => {
  const week = [
    S('x1', { rpe: 'R9.5', barSpeed: 'down' }),
    S('x2', { volDone: false, barSpeed: 'down', carrySkipped: true, carrySkipReason: 'fatigue' }),
    S('x3', { blockCompletion: 'stopped_fatigue' }),
  ]
  const withoutLogs = computeWeekSignals(week)
  const withEmptyLogs = computeWeekSignals(week, [], [], [])
  assert.deepEqual([...withoutLogs.types].sort(), ['S1', 'S2', 'S3', 'S5', 'S7'])
  assert.equal(withoutLogs.types.has('S6'), false)
  assert.equal(withoutLogs.occurrences, withEmptyLogs.occurrences)
  assert.equal(withoutLogs.fired, withEmptyLogs.fired)
})

test('capacityLogsForSessions: narrows the macro-wide logs to a week\'s sessions', () => {
  const week = [CS('a1', '2026-07-27', 1), CS('a2', '2026-07-29', 1)]
  const all = [L('a1', 'A', 'completed'), L('a2', 'B', 'cut_short_fatigue'), L('zz', 'A', 'scaled_fatigue')]
  const got = capacityLogsForSessions(all, week)
  assert.deepEqual(got.map((l) => l.sessionId), ['a1', 'a2'])
  // The out-of-week fatigue log must not leak into this week's signals.
  assert.equal(computeWeekSignals(week, [], [], got).occurrences, 1)
})

test('shouldRecommendDeload pools capacity logs through the unchanged trigger', () => {
  const prevWeekSessions = [CS('a1', '2026-07-27', 1, { volDone: false }), CS('a2', '2026-07-29', 1)]
  const capacityLogs = [L('a1', 'A', 'scaled_fatigue'), L('a2', 'B', 'cut_short_fatigue')]
  assert.equal(shouldRecommendDeload({ prevWeekSessions, capacityLogs }), true)
  // Every exemption still wins over the signals.
  assert.equal(shouldRecommendDeload({ prevWeekSessions, capacityLogs, alreadyDeloaded: true }), false)
  assert.equal(shouldRecommendDeload({ prevWeekSessions, capacityLogs, usedThisMeso: true }), false)
  assert.equal(shouldRecommendDeload({ prevWeekSessions, capacityLogs, breakComing: true }), false)
})

// ---- Giant 2.0 (S2's one exception; S3/S6 confirmed to need no code change) -
const G2 = '2026-08-10' // GIANT2_START_DATE, a Monday

test('S2: does NOT fire on a Giant 2.0 C3 week 4 session (no Volume block that week)', () => {
  const s = CS('a', G2, 4, { cycle: 3, volDone: false, volumeDifficulty: null })
  const r = computeWeekSignals([s])
  assert.equal(r.types.has('S2'), false)
  assert.equal(r.occurrences, 0)
})

test('S2: still fires on a Giant 2.0 session that DOES have a Volume block', () => {
  const s = CS('a', G2, 1, { cycle: 1, volDone: false, volumeDifficulty: 'light' })
  const r = computeWeekSignals([s])
  assert.equal(r.types.has('S2'), true)
  assert.equal(r.occurrences, 1)
})

test('S2: unaffected on GiantFit/legacy sessions — volumeDifficulty is always null there too, but the era gate only suppresses Giant 2.0', () => {
  const s = CS('a', '2026-07-27', 1, { volDone: false }) // volumeDifficulty left unset (undefined), like every real GiantFit row
  const r = computeWeekSignals([s])
  assert.equal(r.types.has('S2'), true)
  assert.equal(r.occurrences, 1)
})

test('S3/S6: no Giant-2.0-specific code needed — both already go quiet structurally (carrySkipped only set where the Carry UI renders; capacity_logs never exist for a Giant2 session), pooled correctly alongside a firing S2', () => {
  const week = [
    CS('a', G2, 4, { cycle: 3, volDone: false, volumeDifficulty: null }), // S2 suppressed (C3 W4)
    CS('b', G2, 1, { cycle: 3, carrySkipped: true, carrySkipReason: 'fatigue' }), // S3 — a real C3 carry day
    CS('c', G2, 1, { cycle: 1, blockCompletion: 'stopped_fatigue' }), // S7
  ]
  const r = computeWeekSignals(week, [], [], []) // no capacity logs — none could exist for these session ids
  assert.deepEqual([...r.types].sort(), ['S3', 'S7'])
  assert.equal(r.types.has('S2'), false)
  assert.equal(r.types.has('S6'), false)
  assert.equal(r.occurrences, 2)
  assert.equal(r.sessionCount, 2)
  assert.equal(r.fired, false) // 2 occurrences, needs 3
})
