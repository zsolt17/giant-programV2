import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  corePosition,
  computePosition,
  nextSessionFrom,
  enumerateMacro,
  parseLocalDate,
  mondayOf,
  isoLocal,
  isGiantFitDate,
  rotationLiftFor,
  strengthSlotIndex,
  capacityVariantFor,
} from './date-engine'

const START = '2026-04-13' // Macro 2 began Monday 13 Apr 2026
const MACRO = 2

// Add n calendar days to an ISO date and return a local Date.
function dayAfterStart(n) {
  const d = parseLocalDate(START)
  d.setDate(d.getDate() + n)
  return d
}

test('anchor: 2026-04-13 -> M2 C1 W1 Deadlift Hard', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.macro, 2)
  assert.equal(p.meso, 1)
  assert.equal(p.week, 1)
  assert.equal(p.difficulty, 'hard')
  assert.equal(p.dayType, 'deadlift')
  assert.equal(p.isSessionDay, true)
  assert.equal(p.weekIndex, 0)
  assert.equal(p.displayWeekGlobal, 1)
})

test('anchor: 2026-06-22 -> M2 C3 W3 Squat Hard', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-06-22'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.meso, 3)
  assert.equal(p.week, 3)
  assert.equal(p.difficulty, 'hard')
  assert.equal(p.dayType, 'squat')
  assert.equal(p.weekIndex, 10)
})

test('rotation: W1 Wed = OHP Medium, Fri = Squat Light', () => {
  const wed = corePosition(START, MACRO, parseLocalDate('2026-04-15'))
  assert.equal(wed.difficulty, 'medium')
  assert.equal(wed.dayType, 'ohp')
  const fri = corePosition(START, MACRO, parseLocalDate('2026-04-17'))
  assert.equal(fri.difficulty, 'light')
  assert.equal(fri.dayType, 'squat')
})

test('non-session day (Tue) is not a session', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-14'))
  assert.equal(p.isSessionDay, false)
  assert.equal(p.dayType, null)
  assert.equal(p.weekType, 'training')
})

test('before macro start -> beforeStart', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-12'))
  assert.equal(p.beforeStart, true)
  assert.equal(p.phase, 'upcoming')
})

// ---- 13-week macro (default shape) ------------------------------------------
test('13-week default: weekIndex 12 = deload, complete after it', () => {
  const deload = corePosition(START, MACRO, dayAfterStart(12 * 7))
  assert.equal(deload.weekType, 'deload')
  assert.equal(deload.meso, null)
  assert.equal(deload.week, null)
  assert.equal(deload.testRole, null) // no testing weeks in the 13-week schedule
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

// ---- ACCEPTANCE (13-week restructure) ----------------------------------------
test('acceptance: 2026-07-20 under M2 (weeks 15) -> deload week', () => {
  const p = corePosition('2026-04-13', 2, parseLocalDate('2026-07-20'), { weeks: 15 })
  assert.equal(p.weekType, 'deload')
  assert.equal(p.displayWeekGlobal, 15)
  assert.equal(p.totalWeeks, 15)
  // Macro completes after that week.
  assert.equal(corePosition('2026-04-13', 2, parseLocalDate('2026-07-27'), { weeks: 15 }).complete, true)
})

test('acceptance: 2026-07-27 under a new M3 anchor -> M3 C1 W1 Deadlift MEDIUM (GiantFit C1 override)', () => {
  const p = corePosition('2026-07-27', 3, parseLocalDate('2026-07-27'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.macro, 3)
  assert.equal(p.meso, 1)
  assert.equal(p.week, 1)
  assert.equal(p.dayType, 'deadlift') // the lift stays deadlift…
  assert.equal(p.difficulty, 'medium') // …only the difficulty drops (C1W1D1 override)
  assert.equal(p.giantfit, true)
  assert.equal(p.capacityVariant, 'A') // slot index 0 = even = A
  assert.equal(p.totalWeeks, 13)
})

// ---- legacy 15-week macros (lived testing weeks stay renderable) --------------
const LEGACY = { weeks: 15 }

test('legacy weeks=15: testing weeks (index 12-13): Mon/Fri = test, Wed = light', () => {
  const mon = corePosition(START, MACRO, dayAfterStart(12 * 7), LEGACY) // week 13 Monday
  assert.equal(mon.weekType, 'testing')
  assert.equal(mon.testRole, 'test')
  const wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2), LEGACY)
  assert.equal(wed.weekType, 'testing')
  assert.equal(wed.testRole, 'light')
  assert.equal(mon.meso, null) // no meso/week in special weeks
  assert.equal(mon.week, null)
})

test('legacy weeks=15: testing schedule W13 Mon=DL/Fri=Dips, W14 Mon=Squat/Fri=OHP', () => {
  const w13mon = corePosition(START, MACRO, dayAfterStart(12 * 7), LEGACY) // W13 Mon
  assert.equal(w13mon.testRole, 'test')
  assert.equal(w13mon.testLift, 'deadlift')
  const w13fri = corePosition(START, MACRO, dayAfterStart(12 * 7 + 4), LEGACY)
  assert.equal(w13fri.testLift, 'dips')
  const w13wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2), LEGACY)
  assert.equal(w13wed.testRole, 'light')
  assert.equal(w13wed.testLift, null)
  const w14mon = corePosition(START, MACRO, dayAfterStart(13 * 7), LEGACY)
  assert.equal(w14mon.testLift, 'squat')
  const w14fri = corePosition(START, MACRO, dayAfterStart(13 * 7 + 4), LEGACY)
  assert.equal(w14fri.testLift, 'ohp')
})

test('legacy weeks=15: deload week (index 14), complete after 15', () => {
  const p = corePosition(START, MACRO, dayAfterStart(14 * 7), LEGACY)
  assert.equal(p.weekType, 'deload')
  const done = corePosition(START, MACRO, dayAfterStart(15 * 7), LEGACY)
  assert.equal(done.complete, true)
  assert.equal(done.phase, 'complete')
})

test('start date is snapped to its Monday', () => {
  // Passing a Wednesday start still anchors to Monday 2026-04-13.
  const p = corePosition('2026-04-15', MACRO, parseLocalDate('2026-04-13'))
  assert.equal(p.weekIndex, 0)
  assert.equal(p.dayType, 'deadlift')
})

test('computePosition attaches nextSession; from Tue -> Wed OHP Medium', () => {
  const p = computePosition(START, MACRO, parseLocalDate('2026-04-14'))
  assert.ok(p.nextSession)
  assert.equal(p.nextSession.date, '2026-04-15')
  assert.equal(p.nextSession.dayType, 'ohp')
  assert.equal(p.nextSession.difficulty, 'medium')
})

test('nextSessionFrom on a session day returns that same day', () => {
  const ns = nextSessionFrom(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(ns.date, '2026-04-13')
  assert.equal(ns.dayType, 'deadlift')
})

test('enumerateMacro: 13 rows by default, 14 extended, legacy 15 keeps testing rows', () => {
  const rows = enumerateMacro(START, MACRO)
  assert.equal(rows.length, 13)
  assert.equal(rows[0].cells.length, 3)
  assert.equal(rows[0].cells[0].date, '2026-04-13')
  assert.equal(rows[0].cells[0].dayType, 'deadlift')
  assert.equal(rows[0].cells[0].difficulty, 'hard')
  assert.equal(rows[11].weekType, 'training')
  assert.equal(rows[12].weekType, 'deload')

  const ext = enumerateMacro(START, MACRO, { deloadExtended: true })
  assert.equal(ext.length, 14)
  assert.equal(ext[13].weekType, 'deload')

  const legacy = enumerateMacro(START, MACRO, { weeks: 15 })
  assert.equal(legacy.length, 15)
  assert.equal(legacy[12].weekType, 'testing')
  assert.equal(legacy[14].weekType, 'deload')
})

test('helpers: mondayOf + isoLocal round-trip', () => {
  assert.equal(isoLocal(mondayOf(parseLocalDate('2026-06-23'))), '2026-06-22')
})

// ---- GiantFit era (dates on/after GIANTFIT_START_DATE = 2026-07-27) ---------
// The DATE decides the era: legacy Giant rules before the cutover (read-only
// history), GiantFit rotation + C1 override + capacity alternation after it.
const GF = '2026-07-27' // M3 anchor = the cutover Monday

test('cutover: date decides the era; pre-cutover positions are unchanged legacy', () => {
  assert.equal(isGiantFitDate('2026-07-26'), false)
  assert.equal(isGiantFitDate('2026-07-27'), true)
  const legacy = corePosition(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(legacy.giantfit, false)
  assert.equal(legacy.capacityVariant, null)
  assert.equal(legacy.dayType, 'deadlift') // legacy golden intact
  assert.equal(legacy.difficulty, 'hard') // no C1 override before the cutover
})

test('GiantFit W1: DL Medium (override) / OHP Medium / Squat Light', () => {
  const mon = corePosition(GF, 3, parseLocalDate('2026-07-27'))
  assert.deepEqual([mon.dayType, mon.difficulty], ['deadlift', 'medium'])
  const wed = corePosition(GF, 3, parseLocalDate('2026-07-29'))
  assert.deepEqual([wed.dayType, wed.difficulty], ['ohp', 'medium'])
  const fri = corePosition(GF, 3, parseLocalDate('2026-07-31'))
  assert.deepEqual([fri.dayType, fri.difficulty], ['squat', 'light'])
})

test('GiantFit rotation: bench replaces dips in W2/W3/W4 slots', () => {
  const w2mon = corePosition(GF, 3, parseLocalDate('2026-08-03'))
  assert.deepEqual([w2mon.dayType, w2mon.difficulty], ['bench', 'hard'])
  const w3wed = corePosition(GF, 3, parseLocalDate('2026-08-12'))
  assert.deepEqual([w3wed.dayType, w3wed.difficulty], ['bench', 'medium'])
  const w4fri = corePosition(GF, 3, parseLocalDate('2026-08-21'))
  assert.deepEqual([w4fri.dayType, w4fri.difficulty], ['bench', 'light'])
})

test('C1 override applies ONLY to C1 W1 Day 1', () => {
  // C1 W2 Monday is a normal Hard slot (bench) — not overridden.
  const c1w2 = corePosition(GF, 3, parseLocalDate('2026-08-03'))
  assert.equal(c1w2.difficulty, 'hard')
  // C2 W1 Monday: Hard deadlift — C2/C3 untouched, so DL has no Hard day only in C1.
  const c2w1 = corePosition(GF, 3, parseLocalDate('2026-08-24'))
  assert.equal(c2w1.meso, 2)
  assert.equal(c2w1.week, 1)
  assert.deepEqual([c2w1.dayType, c2w1.difficulty], ['deadlift', 'hard'])
})

test('capacity variant alternates by SCHEDULED slot index since the cutover', () => {
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-27')), 0)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-29')), 1)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-31')), 2)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-08-03')), 3)
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-27')), 'A')
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-29')), 'B')
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-31')), 'A')
  assert.equal(capacityVariantFor(parseLocalDate('2026-08-03')), 'B')
  // Off-slot (Tue) and pre-cutover dates have no slot index / variant.
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-28')), null)
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-20')), null)
  // Stamped on the position for session days.
  assert.equal(corePosition(GF, 3, parseLocalDate('2026-08-03')).capacityVariant, 'B')
})

test('GiantFit deload week: no day types (unchanged), but slots keep a variant', () => {
  const p = corePosition(GF, 3, parseLocalDate('2026-10-19')) // weekIndex 12 Monday
  assert.equal(p.weekType, 'deload')
  assert.equal(p.dayType, null)
  assert.equal(p.capacityVariant, 'A') // slot index 36 — alternation never desyncs
})

test('rotationLiftFor: era-aware peek helper', () => {
  assert.equal(rotationLiftFor(2, 'hard', true), 'bench')
  assert.equal(rotationLiftFor(2, 'hard', false), 'dips')
  assert.equal(rotationLiftFor(1, 'medium', true), 'ohp')
})

test('nextSession crosses into GiantFit lifts (Sun 2026-08-02 -> Mon bench Hard)', () => {
  const p = computePosition(GF, 3, parseLocalDate('2026-08-02'))
  assert.equal(p.nextSession.date, '2026-08-03')
  assert.equal(p.nextSession.dayType, 'bench')
  assert.equal(p.nextSession.difficulty, 'hard')
})

test('enumerateMacro post-cutover: GiantFit lifts + per-cell capacity variant', () => {
  const rows = enumerateMacro(GF, 3)
  assert.equal(rows.length, 13)
  assert.deepEqual(
    rows[0].cells.map((c) => [c.dayType, c.difficulty, c.capacityVariant]),
    [
      ['deadlift', 'medium', 'A'],
      ['ohp', 'medium', 'B'],
      ['squat', 'light', 'A'],
    ]
  )
  assert.equal(rows[1].cells[0].dayType, 'bench')
  assert.equal(rows[1].cells[0].capacityVariant, 'B')
  // No testing rows ever — 12 training weeks then the deload.
  assert.ok(rows.every((r) => r.weekType !== 'testing'))
  // Legacy enumeration carries no variant.
  assert.equal(enumerateMacro(START, MACRO)[0].cells[0].capacityVariant, null)
})
