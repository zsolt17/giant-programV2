import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseRpe, toTrendSessions, toCleanSessions, toCarrySessions } from './trends'

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
    cleanLoad: null,
    cleanRounds: null,
    cleanSpeed: '',
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

test('toCleanSessions reads dips-day clean load + speed', () => {
  const rows = toCleanSessions([S({ dayType: 'dips', cleanLoad: 70, cleanSpeed: 'up' }), S({ dayType: 'deadlift' })], MACROS)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].weight, 70)
  assert.equal(rows[0].spd, 2)
})

test('toCarrySessions joins per-cycle accessory weight with logged distance', () => {
  const accessory = { m2: { 1: { carry_deadlift: 60 } } }
  const rows = toCarrySessions([S({ dayType: 'deadlift', carryDistance: 40 })], MACROS, accessory)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, 'Farmer')
  assert.equal(rows[0].weight, 60)
  assert.equal(rows[0].distance, 40)
})

test('toCarrySessions skips carries with no logged distance or skipped', () => {
  assert.equal(toCarrySessions([S({ carryDistance: null })], MACROS, {}).length, 0)
  assert.equal(toCarrySessions([S({ carryDistance: 40, carrySkipped: true })], MACROS, {}).length, 0)
})
