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

test('testing weeks (index 12-13): Mon/Fri = test, Wed = light', () => {
  const mon = corePosition(START, MACRO, dayAfterStart(12 * 7)) // week 13 Monday
  assert.equal(mon.weekType, 'testing')
  assert.equal(mon.testRole, 'test')
  const wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2))
  assert.equal(wed.weekType, 'testing')
  assert.equal(wed.testRole, 'light')
  assert.equal(mon.meso, null) // no meso/week in special weeks
  assert.equal(mon.week, null)
})

test('testing schedule: W13 Mon=DL/Fri=Dips, W14 Mon=Squat/Fri=OHP', () => {
  const w13mon = corePosition(START, MACRO, dayAfterStart(12 * 7)) // W13 Mon
  assert.equal(w13mon.testRole, 'test')
  assert.equal(w13mon.testLift, 'deadlift')
  const w13fri = corePosition(START, MACRO, dayAfterStart(12 * 7 + 4))
  assert.equal(w13fri.testLift, 'dips')
  const w13wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2))
  assert.equal(w13wed.testRole, 'light')
  assert.equal(w13wed.testLift, null)
  const w14mon = corePosition(START, MACRO, dayAfterStart(13 * 7))
  assert.equal(w14mon.testLift, 'squat')
  const w14fri = corePosition(START, MACRO, dayAfterStart(13 * 7 + 4))
  assert.equal(w14fri.testLift, 'ohp')
})

test('deload week (index 14) -> deload', () => {
  const p = corePosition(START, MACRO, dayAfterStart(14 * 7))
  assert.equal(p.weekType, 'deload')
})

test('past week 15 -> complete', () => {
  const p = corePosition(START, MACRO, dayAfterStart(15 * 7))
  assert.equal(p.complete, true)
  assert.equal(p.phase, 'complete')
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

test('enumerateMacro: 15 weeks, correct boundaries', () => {
  const rows = enumerateMacro(START, MACRO)
  assert.equal(rows.length, 15)
  assert.equal(rows[0].cells.length, 3)
  assert.equal(rows[0].cells[0].date, '2026-04-13')
  assert.equal(rows[0].cells[0].dayType, 'deadlift')
  assert.equal(rows[0].cells[0].difficulty, 'hard')
  assert.equal(rows[12].weekType, 'testing')
  assert.equal(rows[14].weekType, 'deload')
})

test('helpers: mondayOf + isoLocal round-trip', () => {
  assert.equal(isoLocal(mondayOf(parseLocalDate('2026-06-23'))), '2026-06-22')
})
