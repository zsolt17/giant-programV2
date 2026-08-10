import { test } from 'vitest'
import assert from 'node:assert/strict'
import { corePosition, computePosition, nextSessionFrom, enumerateMacro, parseLocalDate, mondayOf, isoLocal, giant2GiantDifficultyFor, giant2VolumeDifficultyFor, capabilityProgramFor } from './date-engine'

const START = '2026-08-10' // a Monday
const MACRO = 4

// Add n calendar days to an ISO date and return a local Date.
function dayAfterStart(n) {
  const d = parseLocalDate(START)
  d.setDate(d.getDate() + n)
  return d
}

test('anchor: 2026-08-10 -> M4 C1 W1 Squat Hard', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-08-10'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.macro, 4)
  assert.equal(p.meso, 1)
  assert.equal(p.week, 1)
  assert.equal(p.difficulty, 'hard')
  assert.equal(p.dayType, 'squat')
  assert.equal(p.isSessionDay, true)
  assert.equal(p.weekIndex, 0)
  assert.equal(p.displayWeekGlobal, 1)
})

test('fixed Mon/Tue/Thu/Fri day->lift, no rotation, Wed/Sat/Sun rest', () => {
  const mon = corePosition(START, MACRO, parseLocalDate('2026-08-10'))
  const tue = corePosition(START, MACRO, parseLocalDate('2026-08-11'))
  const wed = corePosition(START, MACRO, parseLocalDate('2026-08-12'))
  const thu = corePosition(START, MACRO, parseLocalDate('2026-08-13'))
  const fri = corePosition(START, MACRO, parseLocalDate('2026-08-14'))
  const sat = corePosition(START, MACRO, parseLocalDate('2026-08-15'))
  const sun = corePosition(START, MACRO, parseLocalDate('2026-08-16'))
  assert.equal(mon.dayType, 'squat')
  assert.equal(tue.dayType, 'bench')
  assert.equal(thu.dayType, 'deadlift')
  assert.equal(fri.dayType, 'ohp')
  for (const p of [wed, sat, sun]) {
    assert.equal(p.isSessionDay, false)
    assert.equal(p.dayType, null)
  }
})

test('before macro start -> beforeStart', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-08-09'))
  assert.equal(p.beforeStart, true)
  assert.equal(p.phase, 'upcoming')
})

// ---- 13-week macro (default shape) ------------------------------------------
test('13-week default: weekIndex 12 = deload, complete after it', () => {
  const deload = corePosition(START, MACRO, dayAfterStart(12 * 7))
  assert.equal(deload.weekType, 'deload')
  assert.equal(deload.meso, null)
  assert.equal(deload.week, null)
  assert.equal(deload.totalWeeks, 13)
  const done = corePosition(START, MACRO, dayAfterStart(13 * 7))
  assert.equal(done.complete, true)
  assert.equal(done.phase, 'complete')
})

test('deload extension: week 13 is a second deload week, complete after 14', () => {
  const ext = { deloadExtended: true }
  const second = corePosition(START, MACRO, dayAfterStart(13 * 7), ext)
  assert.equal(second.weekType, 'deload')
  assert.equal(second.totalWeeks, 14)
  assert.equal(corePosition(START, MACRO, dayAfterStart(14 * 7), ext).complete, true)
  // Without the extension the same date is past the macro.
  assert.equal(corePosition(START, MACRO, dayAfterStart(13 * 7)).complete, true)
})

test('start date is snapped to its Monday', () => {
  // Passing a Wednesday start still anchors to Monday 2026-08-10.
  const p = corePosition('2026-08-12', MACRO, parseLocalDate('2026-08-10'))
  assert.equal(p.weekIndex, 0)
  assert.equal(p.dayType, 'squat')
})

test('computePosition attaches nextSession; from Wed -> Thu Deadlift', () => {
  const p = computePosition(START, MACRO, parseLocalDate('2026-08-12'))
  assert.ok(p.nextSession)
  assert.equal(p.nextSession.date, '2026-08-13')
  assert.equal(p.nextSession.dayType, 'deadlift')
  assert.equal(p.nextSession.difficulty, 'light')
})

test('nextSessionFrom on a session day returns that same day', () => {
  const ns = nextSessionFrom(START, MACRO, parseLocalDate('2026-08-10'))
  assert.equal(ns.date, '2026-08-10')
  assert.equal(ns.dayType, 'squat')
})

test('helpers: mondayOf + isoLocal round-trip', () => {
  assert.equal(isoLocal(mondayOf(parseLocalDate('2026-06-23'))), '2026-06-22')
})

// ---- weekly Giant-difficulty rotation ---------------------------------------

test('week 1-3 Giant-difficulty matches the confirmed rotation, week 4 collapses per cycle', () => {
  // C1 W1: Squat Hard, Bench Medium, Deadlift Light, OHP Hard.
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-10')).difficulty, 'hard') // squat
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-11')).difficulty, 'medium') // bench
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-13')).difficulty, 'light') // deadlift
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-14')).difficulty, 'hard') // ohp
  // C1 W4 (2026-08-31 Mon .. 2026-09-04 Fri): every lift collapses to Light.
  const w4 = ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-04'].map((d) => corePosition(START, MACRO, parseLocalDate(d)))
  assert.deepEqual(w4.map((p) => [p.week, p.difficulty]), [
    [4, 'light'],
    [4, 'light'],
    [4, 'light'],
    [4, 'light'],
  ])
  // C2 W4 collapses to Medium, C3 W4 to Hard.
  const c2w4mon = corePosition(START, MACRO, parseLocalDate('2026-09-28')) // meso 2 week 4 Monday
  assert.equal(c2w4mon.meso, 2)
  assert.equal(c2w4mon.week, 4)
  assert.equal(c2w4mon.difficulty, 'medium')
  const c3w4mon = corePosition(START, MACRO, parseLocalDate('2026-10-26')) // meso 3 week 4 Monday
  assert.equal(c3w4mon.meso, 3)
  assert.equal(c3w4mon.week, 4)
  assert.equal(c3w4mon.difficulty, 'hard')
})

test('the athlete Setup override wins on weeks 1-3, but NEVER on week 4 (always collapses)', () => {
  const config = { 1: { squat: 'light' } } // athlete overrides W1 squat away from the Hard default
  const w1 = corePosition(START, MACRO, parseLocalDate('2026-08-10'), {}, config)
  assert.equal(w1.difficulty, 'light')
  // An unconfigured lift in a configured week still falls back to the default.
  const w1bench = corePosition(START, MACRO, parseLocalDate('2026-08-11'), {}, config)
  assert.equal(w1bench.difficulty, 'medium')
  // Week 4 ignores the override entirely — GIANT2_WEEK4_DIFFICULTY always wins.
  const w4 = corePosition(START, MACRO, parseLocalDate('2026-08-31'), {}, { 4: { squat: 'hard' } })
  assert.equal(w4.difficulty, 'light')
})

test('Volume difficulty is fixed per cycle, independent of the Giant difficulty, and drops entirely in C3 week 4', () => {
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-10')).volumeDifficulty, 'light') // C1
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-08-31')).volumeDifficulty, 'light') // C1 W4 too — Volume still runs
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-09-07')).volumeDifficulty, 'medium') // C2
  assert.equal(corePosition(START, MACRO, parseLocalDate('2026-10-05')).volumeDifficulty, 'hard') // C3
  const c3w4 = corePosition(START, MACRO, parseLocalDate('2026-10-26'))
  assert.equal(c3w4.meso, 3)
  assert.equal(c3w4.week, 4)
  assert.equal(c3w4.difficulty, 'hard') // Giant still runs Hard...
  assert.equal(c3w4.volumeDifficulty, null) // ...but Volume is dropped entirely that week
})

test('deload week: DOES carry a dayType (fixed day->lift, deload or not), but no H/M/L difficulty', () => {
  const mon = corePosition(START, MACRO, parseLocalDate('2026-11-02')) // week 13 Monday
  assert.equal(mon.weekType, 'deload')
  assert.equal(mon.dayType, 'squat')
  assert.equal(mon.difficulty, null)
  assert.equal(mon.volumeDifficulty, null)
})

test('capabilityProgramFor: Hypertrophy C1, Oly C2, Carries C3', () => {
  assert.equal(capabilityProgramFor(1), 'hypertrophy')
  assert.equal(capabilityProgramFor(2), 'oly')
  assert.equal(capabilityProgramFor(3), 'carries')
})

test('giant2GiantDifficultyFor / giant2VolumeDifficultyFor: pure lookups match corePosition exactly', () => {
  assert.equal(giant2GiantDifficultyFor(1, 1, 'squat'), 'hard')
  assert.equal(giant2GiantDifficultyFor(1, 4, 'squat'), 'light') // week 4 collapse, ignores lift
  assert.equal(giant2GiantDifficultyFor(3, 4, 'ohp'), 'hard')
  assert.equal(giant2VolumeDifficultyFor(2, 1), 'medium')
  assert.equal(giant2VolumeDifficultyFor(3, 4), null)
})

test('nextSessionFrom into a deload week surfaces the dayType', () => {
  const p = nextSessionFrom(START, MACRO, parseLocalDate('2026-10-31')) // Saturday before deload week
  assert.equal(p.date, '2026-11-02')
  assert.equal(p.deload, true)
  assert.equal(p.dayType, 'squat')
  assert.equal(p.difficulty, null)
})

test('enumerateMacro: 13 rows by default, 14 extended, 4 cells/week (Mon/Tue/Thu/Fri)', () => {
  const rows = enumerateMacro(START, MACRO)
  assert.equal(rows.length, 13)
  assert.deepEqual(
    rows[0].cells.map((c) => c.dayType),
    ['squat', 'bench', 'deadlift', 'ohp']
  )
  assert.deepEqual(
    rows[0].cells.map((c) => c.difficulty),
    ['hard', 'medium', 'light', 'hard']
  )
  assert.equal(rows[0].cells[0].volumeDifficulty, 'light')
  assert.equal(rows[11].weekType, 'training')
  assert.equal(rows[12].weekType, 'deload')
  // Deload week (last row) still carries dayType.
  assert.equal(rows[12].cells[0].dayType, 'squat')
  assert.equal(rows[12].cells[0].difficulty, null)

  const ext = enumerateMacro(START, MACRO, { deloadExtended: true })
  assert.equal(ext.length, 14)
  assert.equal(ext[13].weekType, 'deload')
})
