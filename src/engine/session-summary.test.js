import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionSummary } from './session-summary'

// A fully-populated base session; tests override fields as needed.
function base(over = {}) {
  return {
    id: '2026-06-22-squat-H',
    macroId: 'm2',
    date: '2026-06-22',
    cycle: 3,
    week: 3,
    weekType: 'training',
    dayType: 'squat',
    difficulty: 'hard',
    topReps: 2,
    topWeight: 145,
    rpe: 'R9.5',
    barSpeed: 'up',
    cardioCals: [15, 14, 15, 15],
    volDone: true,
    volRpe: 'R8',
    volSpeed: 'normal',
    pullupCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRounds: 3,
    carryDistance: 30,
    carryRpe: 'R6',
    notes: '',
    startedAt: '2026-06-22T09:00:00.000Z',
    endedAt: '2026-06-22T10:12:00.000Z',
    ...over,
  }
}

test('squat day: header, giant block (RPE de-duped, arrow), cardio, volume, carry, duration', () => {
  const out = sessionSummary(base(), 2)
  assert.equal(
    out,
    [
      'Session — M2C3W3 — Squat Hard — 22.06.2026',
      'Giant Block R9.5↑: top 145×2, cardio 15/14/15/15',
      'Volume R8→: 2 sets done',
      'Carry R6: 3×30m',
      'Duration: 72 min',
    ].join('\n')
  )
})

test('no Cleans line anywhere (clean block removed)', () => {
  assert.doesNotMatch(sessionSummary(base({ dayType: 'dips' }), 2), /Cleans:/)
})

test('dips day includes Pull-ups line; other days (incl. OHP) omit it', () => {
  const dips = sessionSummary(base({ dayType: 'dips', pullupCluster: '8+2' }), 2)
  assert.match(dips, /^Session — M2C3W3 — Dips Hard/)
  assert.match(dips, /\nPull-ups: 8\+2/)
  assert.doesNotMatch(sessionSummary(base(), 2), /Pull-ups:/) // squat
  assert.doesNotMatch(sessionSummary(base({ dayType: 'ohp', pullupCluster: '8+2' }), 2), /Pull-ups:/) // OHP no longer
})

test('skipped carry shows reason and drops rounds/distance', () => {
  const out = sessionSummary(base({ carrySkipped: true, carrySkipReason: 'fatigue' }), 2)
  assert.match(out, /\nCarry: skipped \(fatigue\)/)
  assert.doesNotMatch(out, /Carry R/)
})

test('untimed session omits Duration; empty notes omitted; notes included when present', () => {
  const untimed = sessionSummary(base({ startedAt: null, endedAt: null }), 2)
  assert.doesNotMatch(untimed, /Duration:/)
  assert.doesNotMatch(untimed, /Notes:/)
  const noted = sessionSummary(base({ notes: 'felt strong' }), 2)
  assert.match(noted, /\nNotes: felt strong$/)
})

test('incomplete volume + no cardio + no bar speed', () => {
  const out = sessionSummary(base({ volDone: false, cardioCals: [null, null, null, null], barSpeed: '' }), 2)
  assert.match(out, /\nGiant Block R9.5: top 145×2\n/) // no arrow, no cardio clause
  assert.match(out, /\nVolume R8→: incomplete/)
})

test('testing week (null cycle/week) degrades header to week type', () => {
  const out = sessionSummary(base({ cycle: null, week: null, weekType: 'testing', difficulty: null, dayType: null }), 2)
  assert.match(out, /^Session — M2 · Testing — — — 22.06.2026/)
})
