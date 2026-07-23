import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseRpe, toTrendSessions, toAccessoryTrend, toCarrySessions } from './trends'

const MACROS = [{ id: 'm2', number: 2, startISO: '2026-04-13', weeks: 15, status: 'active' }]

// Minimal session factory (training, dips-ish defaults overridable).
function S(over = {}) {
  return {
    id: 'x',
    macroId: 'm2',
    date: '2026-04-13',
    cycle: 1,
    week: 1,
    weekType: 'training',
    dayType: 'deadlift',
    difficulty: 'hard',
    topReps: 2,
    topWeight: 160,
    rpe: '',
    barSpeed: '',
    cardioCals: [],
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pullupCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRounds: null,
    carryDistance: null,
    carryRpe: '',
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
    [
      S({ rpe: 'R9.5', barSpeed: 'down', volDone: false, carrySkipped: true, carrySkipReason: 'fatigue', topWeight: 160, dayType: 'ohp', cardioCals: [15, 14, null, 15] }),
    ],
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
  assert.equal(r.S3, 1) // carry skipped for fatigue
  assert.equal(r.S5, 1) // bar speed down
  assert.deepEqual(r.sets, [15, 14, 15]) // nulls dropped
})

test('toTrendSessions marks deload-week status from the deloads map', () => {
  const clean = toTrendSessions([S()], MACROS, {})
  assert.equal(clean[0].status, 'done')
  const dl = toTrendSessions([S()], MACROS, { M2C1W1: true })
  assert.equal(dl[0].status, 'deload')
})

test('toTrendSessions ignores non-training weeks', () => {
  assert.equal(toTrendSessions([S({ weekType: 'testing' })], MACROS, {}).length, 0)
})

test('toAccessoryTrend: per-cycle recorded weight across cycles, ordered M1C1..', () => {
  const accessory = { m2: { 1: { row_ohp: 20 }, 2: { row_ohp: 22.5 }, 3: { row_ohp: 25 } } }
  const rows = toAccessoryTrend(MACROS, accessory, 'row_ohp')
  assert.deepEqual(rows.map((r) => r.label), ['M2C1', 'M2C2', 'M2C3'])
  assert.deepEqual(rows.map((r) => r.weight), [20, 22.5, 25])
})

test('toAccessoryTrend: skips cycles with no value', () => {
  const accessory = { m2: { 1: { rdl_deadlift: 30 }, 3: { rdl_deadlift: 35 } } } // C2 unset
  const rows = toAccessoryTrend(MACROS, accessory, 'rdl_deadlift')
  assert.deepEqual(rows.map((r) => r.label), ['M2C1', 'M2C3'])
})

test('toCarrySessions joins per-cycle accessory weight with logged distance', () => {
  const accessory = { m2: { 1: { carry_deadlift: 60 } } }
  const rows = toCarrySessions([S({ dayType: 'deadlift', carryDistance: 40 })], MACROS, accessory)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, 'Farmer') // deadlift day = farmer's carry (final reassignment)
  assert.equal(rows[0].weight, 60)
  assert.equal(rows[0].distance, 40)
})

test('toCarrySessions skips carries with no logged distance or skipped', () => {
  assert.equal(toCarrySessions([S({ carryDistance: null })], MACROS, {}).length, 0)
  assert.equal(toCarrySessions([S({ carryDistance: 40, carrySkipped: true })], MACROS, {}).length, 0)
})

// ---- toRunTrend (Giant Run pace trend) ----------------------------------------
import { toRunTrend } from './trends'

test('toRunTrend: derives pace, drops paceless runs, sorts oldest first', () => {
  const macros = [{ id: 'm2', number: 2, startISO: '2026-04-13', weeks: 15, status: 'active', refPaceS: null }]
  const runs = [
    { id: 'b', macroId: 'm2', date: '2026-07-16', cycle: 1, week: 2, weekType: 'training', runType: 'quality', distanceKm: 3, durationS: 1000, avgHr: null, completion: 'completed', notes: '' },
    { id: 'a', macroId: 'm2', date: '2026-07-14', cycle: 1, week: 2, weekType: 'training', runType: 'easy', distanceKm: 5, durationS: 1800, avgHr: 148, completion: 'completed', notes: '' },
    { id: 'c', macroId: 'm2', date: '2026-07-18', cycle: 1, week: 2, weekType: 'training', runType: 'long', distanceKm: null, durationS: 1800, avgHr: null, completion: 'completed', notes: '' },
  ]
  const t = toRunTrend(runs, macros)
  assert.equal(t.length, 2) // the paceless long run is dropped
  assert.deepEqual(t.map((r) => r.date), ['2026-07-14', '2026-07-16'])
  assert.equal(t[0].paceS, 360)
  assert.equal(t[0].macro, 'M2')
  assert.equal(t[1].type, 'quality')
})

// ---- toCapacityTrend (GiantFit capacity view) -------------------------------
import { toCapacityTrend } from './trends'

test('toCapacityTrend: joins logs to sessions, derives per-round, drops incomplete, sorts by date', () => {
  const macros = [{ id: 'm3', number: 3, startISO: '2026-07-27', weeks: 13, status: 'active' }]
  const sess = (id, date) => ({ id, macroId: 'm3', date, weekType: 'training', cycle: 1, week: 1, dayType: 'deadlift' })
  const sessions = [sess('b', '2026-07-29'), sess('a', '2026-07-27')]
  const logs = [
    { sessionId: 'b', variant: 'B', roundsCompleted: 3, totalTimeSeconds: 702, calories: 27, rpe: 'R7', notes: '' },
    { sessionId: 'a', variant: 'A', roundsCompleted: 2, totalTimeSeconds: 300, calories: null, rpe: '', notes: '' },
    { sessionId: 'a', variant: 'A', roundsCompleted: 0, totalTimeSeconds: 300, calories: null, rpe: '', notes: '' }, // unusable -> dropped
    { sessionId: 'ghost', variant: 'A', roundsCompleted: 3, totalTimeSeconds: 300, calories: null, rpe: '', notes: '' }, // no session -> dropped
  ]
  const pts = toCapacityTrend(logs, sessions, macros)
  assert.equal(pts.length, 2)
  assert.deepEqual(pts.map((p) => [p.date, p.variant, p.perRoundS, p.rounds, p.calories, p.rpe]), [
    ['2026-07-27', 'A', 150, 2, null, null], // short session normalizes per round
    ['2026-07-29', 'B', 234, 3, 27, 7],
  ])
  assert.equal(pts[0].macro, 'M3')
})
