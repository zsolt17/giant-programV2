import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseRpe, toTrendSessions, toWodSessions } from './trends'

const MACROS = [{ id: 'm2', number: 2, startISO: '2026-08-10', weeks: 13, status: 'active' }]

// Minimal session factory.
function S(over = {}) {
  return {
    id: 'x',
    macroId: 'm2',
    date: '2026-08-10',
    cycle: 1,
    week: 1,
    weekType: 'training',
    dayType: 'squat',
    difficulty: 'hard',
    volumeDifficulty: 'light',
    topReps: 2,
    topWeight: 160,
    rpe: '',
    barSpeed: '',
    cardioCals: [],
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pullupCluster: '',
    wodSkipped: false,
    wodSkipReason: '',
    notes: '',
    startedAt: null,
    endedAt: null,
    ...over,
  }
}

test('parseRpe handles R-notation, half-points, blanks', () => {
  assert.equal(parseRpe('R9.5'), 9.5)
  assert.equal(parseRpe('R8'), 8)
  assert.equal(parseRpe(''), null)
})

test('toTrendSessions maps day/weight/spd and derives signals like deload-rule', () => {
  const rows = toTrendSessions(
    [S({ rpe: 'R9.5', barSpeed: 'down', volDone: false, wodSkipped: true, wodSkipReason: 'fatigue', topWeight: 160, dayType: 'ohp', cardioCals: [15, 14, null, 15] })],
    MACROS,
    {}
  )
  assert.equal(rows.length, 1)
  const r = rows[0]
  assert.equal(r.macro, 'M2')
  assert.equal(r.day, 'OHP')
  assert.equal(r.weight, 160)
  assert.equal(r.spd, 0) // down
  assert.equal(r.S1, 1) // rpe >= 9.5
  assert.equal(r.S2, 1) // volume incomplete
  assert.equal(r.S3, 1) // Engine WOD skipped for fatigue
  assert.equal(r.S5, 1) // bar speed down
  assert.deepEqual(r.sets, [15, 14, 15]) // nulls dropped
})

test('toTrendSessions: S2 never fires on a session with no Volume block (C3 week 4, or deload)', () => {
  const c3w4 = S({ id: '2026-10-26-squat', date: '2026-10-26', volDone: false, volumeDifficulty: null })
  const rows = toTrendSessions([c3w4], MACROS, {})
  assert.equal(rows[0].S2, 0)
  // A normal session (Volume block present) still fires it.
  const normal = S({ volDone: false, volumeDifficulty: 'light' })
  assert.equal(toTrendSessions([normal], MACROS, {})[0].S2, 1)
})

test('toTrendSessions marks deload-week status from the deloads map', () => {
  const clean = toTrendSessions([S()], MACROS, {})
  assert.equal(clean[0].status, 'done')
  const dl = toTrendSessions([S()], MACROS, { M2C1W1: true })
  assert.equal(dl[0].status, 'deload')
})

test('toTrendSessions ignores non-training weeks', () => {
  assert.equal(toTrendSessions([S({ weekType: 'deload', cycle: null, week: null })], MACROS, {}).length, 0)
})

test('toWodSessions sums a session\'s logged rounds and groups by day type (lower/upper)', () => {
  const wodLogs = [
    { sessionId: 'x', roundNumber: 1, machineType: 'row', machineCalories: 12, carryRpe: 'R6' },
    { sessionId: 'x', roundNumber: 2, machineType: 'row', machineCalories: 14, carryRpe: '' },
  ]
  const rows = toWodSessions([S({ dayType: 'squat', cycle: 3 })], MACROS, wodLogs)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].dayGroup, 'lower') // squat = lower day
  assert.equal(rows[0].totalCalories, 26)
})

test('toWodSessions: bench/OHP group as upper', () => {
  const wodLogs = [{ sessionId: 'x', roundNumber: 1, machineType: 'bike', machineCalories: 10, carryRpe: '' }]
  assert.equal(toWodSessions([S({ dayType: 'bench', cycle: 3 })], MACROS, wodLogs)[0].dayGroup, 'upper')
})

test('toWodSessions omits skipped sessions and sessions with nothing logged yet', () => {
  const wodLogs = [{ sessionId: 'x', roundNumber: 1, machineType: 'row', machineCalories: 12, carryRpe: '' }]
  assert.equal(toWodSessions([S({ cycle: 3, wodSkipped: true })], MACROS, wodLogs).length, 0)
  assert.equal(toWodSessions([S({ cycle: 3 })], MACROS, []).length, 0)
})
