import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  runSlotFor,
  runSlotsForWeek,
  runIdFor,
  runMode,
  roundPace,
  easyPace,
  qualityRange,
  derivedPaceS,
  fmtPace,
  fmtRunDuration,
  parseClock,
  computeRunSignalHits,
} from './runs'
import { parseLocalDate } from './date-engine'

const START = '2026-04-13' // Macro 2 began Monday 13 Apr 2026
const MACRO = 2

// ---- schedule ---------------------------------------------------------------

test('W1 Tuesday -> easy run (C1 W1)', () => {
  const s = runSlotFor(START, MACRO, parseLocalDate('2026-04-14'))
  assert.equal(s.runType, 'easy')
  assert.equal(s.slot, 'easy')
  assert.equal(s.weekType, 'training')
  assert.equal(s.cycle, 1)
  assert.equal(s.week, 1)
  assert.equal(s.optional, false)
})

test('mesocycle-1 Thursday runs EASY in the quality slot', () => {
  const s = runSlotFor(START, MACRO, parseLocalDate('2026-04-16'))
  assert.equal(s.slot, 'quality')
  assert.equal(s.runType, 'easy')
})

test('mesocycle-2 Thursday runs QUALITY', () => {
  const s = runSlotFor(START, MACRO, parseLocalDate('2026-05-14')) // C2 W1 Thu
  assert.equal(s.cycle, 2)
  assert.equal(s.slot, 'quality')
  assert.equal(s.runType, 'quality')
})

test('Saturday -> long run', () => {
  const s = runSlotFor(START, MACRO, parseLocalDate('2026-04-18'))
  assert.equal(s.runType, 'long')
  assert.equal(s.slot, 'long')
})

test('lift days and Sunday are not run days', () => {
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-04-13')), null) // Mon
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-04-15')), null) // Wed
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-04-17')), null) // Fri
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-04-19')), null) // Sun
})

test('testing week: Sat = 5k time trial, Tue/Thu = optional easy', () => {
  const sat = runSlotFor(START, MACRO, parseLocalDate('2026-07-11')) // W13 Sat
  assert.equal(sat.weekType, 'testing')
  assert.equal(sat.runType, 'tt')
  assert.equal(sat.optional, false)
  assert.equal(sat.cycle, null)
  const tue = runSlotFor(START, MACRO, parseLocalDate('2026-07-07'))
  assert.equal(tue.runType, 'easy')
  assert.equal(tue.optional, true)
})

test('deload W15: all runs optional short easy', () => {
  const s = runSlotFor(START, MACRO, parseLocalDate('2026-07-25')) // W15 Sat
  assert.equal(s.weekType, 'deload')
  assert.equal(s.runType, 'easy')
  assert.equal(s.optional, true)
})

test('before start / after macro complete -> null', () => {
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-04-07')), null)
  assert.equal(runSlotFor(START, MACRO, parseLocalDate('2026-07-28')), null) // week 16
})

test('runSlotsForWeek enumerates Tue/Thu/Sat of a program week', () => {
  const slots = runSlotsForWeek(START, MACRO, 0)
  assert.deepEqual(
    slots.map((s) => s.date),
    ['2026-04-14', '2026-04-16', '2026-04-18']
  )
  assert.deepEqual(
    slots.map((s) => s.slot),
    ['easy', 'quality', 'long']
  )
})

test('run id scheme: date + run-type letter', () => {
  assert.equal(runIdFor('2026-07-14', 'easy'), '2026-07-14-run-E')
  assert.equal(runIdFor('2026-07-11', 'tt'), '2026-07-11-run-T')
})

// ---- pace engine --------------------------------------------------------------

test('two-mode: no anchor -> talk-test mode', () => {
  assert.equal(runMode(null), 'talk')
  assert.equal(runMode(0), 'talk')
  assert.equal(runMode(300), 'pace')
})

test('pace cascade: easy = P+75, quality = P+15..P+40, rounded to 5 s/km', () => {
  assert.equal(easyPace(300), 375)
  assert.deepEqual(qualityRange(300), [315, 340])
  // Unrounded anchor: derived paces round, P itself never does.
  assert.equal(easyPace(302), 375) // 377 -> 375
  assert.deepEqual(qualityRange(302), [315, 340]) // 317 -> 315, 342 -> 340
  assert.equal(roundPace(377), 375)
  assert.equal(roundPace(378), 380)
})

test('derived pace = duration / distance, unrounded; null-safe', () => {
  assert.equal(derivedPaceS(5, 1500), 300)
  assert.equal(derivedPaceS(3, 1000), 1000 / 3)
  assert.equal(derivedPaceS(0, 1500), null)
  assert.equal(derivedPaceS(null, 1500), null)
  assert.equal(derivedPaceS(5, null), null)
})

test('fmtPace / fmtRunDuration / parseClock round-trip', () => {
  assert.equal(fmtPace(335), '5:35')
  assert.equal(fmtPace(1000 / 3), '5:33')
  assert.equal(fmtPace(null), '—')
  assert.equal(fmtRunDuration(2550), '42:30')
  assert.equal(fmtRunDuration(3730), '1:02:10')
  assert.equal(parseClock('5:35'), 335)
  assert.equal(parseClock('1:02:10'), 3730)
  assert.equal(parseClock('42'), 2520) // bare minutes
  assert.equal(parseClock(''), null)
  assert.equal(parseClock('abc'), null)
  assert.equal(parseClock('5:70'), null) // invalid seconds
})

// ---- run signals ----------------------------------------------------------------

function run(id, { date = '2026-04-21', type = 'easy', completion = 'completed', km = null, s = null, hr = null } = {}) {
  return {
    id,
    macroId: 'm',
    date,
    cycle: 1,
    week: 2,
    weekType: 'training',
    runType: type,
    distanceKm: km,
    durationS: s,
    avgHr: hr,
    completion,
    notes: '',
  }
}

test('R1/R2 from the completion control; cut_schedule is NOT a signal', () => {
  const hits = computeRunSignalHits([
    run('a', { completion: 'cut_fatigue' }),
    run('b', { completion: 'felt_heavy' }),
    run('c', { completion: 'cut_schedule' }),
    run('d', { completion: 'completed' }),
  ])
  assert.deepEqual([...hits.types].sort(), ['R1', 'R2'])
  assert.equal(hits.occurrences, 2)
  assert.equal(hits.runIds.size, 2)
})

test('R3: pace-at-HR degraded on 2+ runs = ONE week-level occurrence', () => {
  const prior = [
    run('p1', { date: '2026-04-14', type: 'easy', km: 5, s: 1800, hr: 150 }), // 360 s/km
    run('p2', { date: '2026-04-18', type: 'long', km: 5, s: 1900, hr: 148 }), // 380 s/km
  ]
  const week = [
    run('w1', { date: '2026-04-21', type: 'easy', km: 5, s: 1855, hr: 152 }), // 371 ≥ 360+10, HR up
    run('w2', { date: '2026-04-25', type: 'long', km: 5, s: 1955, hr: 148 }), // 391 ≥ 380+10, HR same
  ]
  const hits = computeRunSignalHits(week, prior)
  assert.deepEqual([...hits.types], ['R3'])
  assert.equal(hits.occurrences, 1)
  assert.equal(hits.runIds.size, 2)
})

test('R3 needs 2+ degraded runs, and skips runs without HR data', () => {
  const prior = [run('p1', { date: '2026-04-14', type: 'easy', km: 5, s: 1800, hr: 150 })]
  // Only one degraded run -> no R3.
  const one = computeRunSignalHits([run('w1', { date: '2026-04-21', type: 'easy', km: 5, s: 1855, hr: 152 })], prior)
  assert.equal(one.occurrences, 0)
  // Slower but NO HR logged -> skipped, never guessed.
  const noHr = computeRunSignalHits(
    [
      run('w1', { date: '2026-04-21', type: 'easy', km: 5, s: 1855 }),
      run('w2', { date: '2026-04-23', type: 'easy', km: 5, s: 1900 }),
    ],
    prior
  )
  assert.equal(noHr.occurrences, 0)
  // Slower at LOWER HR -> not degraded (could just be an honest easy day).
  const lowerHr = computeRunSignalHits(
    [
      run('w1', { date: '2026-04-21', type: 'easy', km: 5, s: 1855, hr: 140 }),
      run('w2', { date: '2026-04-23', type: 'easy', km: 5, s: 1900, hr: 141 }),
    ],
    prior
  )
  assert.equal(lowerHr.occurrences, 0)
})

test('parseClock: iOS decimal-keypad forms — "." "," separators + bare digits', () => {
  assert.equal(parseClock('5.35'), 335)
  assert.equal(parseClock('5,35'), 335)
  assert.equal(parseClock('535'), 335) // last two digits = seconds
  assert.equal(parseClock('4230'), 2550) // 42:30
  assert.equal(parseClock('10230'), 3750) // 1:02:30
  assert.equal(parseClock('120'), 80) // 1:20 (3+ digits are m:ss, not minutes)
  assert.equal(parseClock('6'), 360) // 1–2 bare digits stay whole minutes
  assert.equal(parseClock('575'), null) // "75 seconds" is invalid
  assert.equal(parseClock('5.75'), null)
})

// ---- structure descriptions -----------------------------------------------------
import { runStructureKey, runStructureText } from './runs'
import { RUN_STRUCTURE } from './constants'

test('runStructureKey: resolves by run type; deload overrides (W15 + reactive)', () => {
  const c1Thu = runSlotFor(START, MACRO, parseLocalDate('2026-04-16')) // quality slot, resolves easy
  assert.equal(runStructureKey(c1Thu, false), 'easy')
  const c2Thu = runSlotFor(START, MACRO, parseLocalDate('2026-05-14'))
  assert.equal(runStructureKey(c2Thu, false), 'quality')
  const sat = runSlotFor(START, MACRO, parseLocalDate('2026-04-18'))
  assert.equal(runStructureKey(sat, false), 'long')
  const ttSat = runSlotFor(START, MACRO, parseLocalDate('2026-07-11'))
  assert.equal(runStructureKey(ttSat, false), 'tt')
  const w15 = runSlotFor(START, MACRO, parseLocalDate('2026-07-25'))
  assert.equal(runStructureKey(w15, false), 'deload')
  // Reactive deload collapses a normal training run day to the deload text.
  assert.equal(runStructureKey(sat, true), 'deload')
})

test('runStructureText: verbatim in talk mode; pace appended in pace mode; tt/deload never', () => {
  // Talk mode (no anchor): texts exactly as authored.
  assert.equal(runStructureText('easy', null), RUN_STRUCTURE.easy)
  assert.equal(runStructureText('quality', 0), RUN_STRUCTURE.quality)
  // Pace mode, P = 312 (5:12): easy 387→385=6:25; quality 327→325=5:25, 352→350=5:50.
  assert.equal(runStructureText('easy', 312), `${RUN_STRUCTURE.easy} Easy pace: ~6:25 /km.`)
  assert.equal(runStructureText('long', 312), `${RUN_STRUCTURE.long} Easy pace: ~6:25 /km.`)
  assert.equal(runStructureText('quality', 312), `${RUN_STRUCTURE.quality} Quality pace: 5:25–5:50 /km.`)
  assert.equal(runStructureText('tt', 312), RUN_STRUCTURE.tt)
  assert.equal(runStructureText('deload', 312), RUN_STRUCTURE.deload)
})
