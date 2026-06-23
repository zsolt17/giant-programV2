// MACRO DATE ENGINE — ported verbatim from the working index.html. Battle-tested;
// preserve this logic exactly. Strict-date model: position is computed from the
// macro start date, never set manually. Miss a session and you rejoin where the
// calendar says.
//
// Critical: corePosition does the position math ONLY and never computes the next
// session, so it cannot recurse. computePosition and nextSessionFrom both call
// corePosition. Keep that separation (an early version recursed infinitely).
import { ROTATION, MACRO_WEEKS, DAY_SLOT, TESTING_SCHEDULE } from './constants.js'

// Parse a YYYY-MM-DD string to a LOCAL Date at midnight (no UTC drift).
export function parseLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// LOCAL YYYY-MM-DD for a Date.
export function isoLocal(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Today's LOCAL date string (Brașov timezone of the host) — never UTC.
export function todayISO() {
  return isoLocal(new Date())
}

// The macro start is anchored to a Monday. Snap any given start to its Monday.
export function mondayOf(dt) {
  const day = dt.getDay() // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day // move back to Monday
  const m = new Date(dt)
  m.setDate(dt.getDate() + diff)
  return m
}

// Core position math only — never computes nextSession, so it cannot recurse.
// Returns { macro, meso, week, dayType, difficulty, weekType, testRole,
//           isSessionDay, weekIndex, daysSinceStart, displayWeekGlobal, phase }
// or a special-state object { beforeStart } / { complete }.
export function corePosition(startISO, macroNumber, target) {
  const start = mondayOf(parseLocalDate(startISO))
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const daysSinceStart = Math.floor((t - start) / 86400000)

  if (daysSinceStart < 0) {
    return { macro: macroNumber, beforeStart: true, daysSinceStart, phase: 'upcoming' }
  }
  const weekIndex = Math.floor(daysSinceStart / 7)
  if (weekIndex >= MACRO_WEEKS) {
    return { macro: macroNumber, complete: true, weekIndex, daysSinceStart, phase: 'complete' }
  }
  const weekday = t.getDay()
  const isSessionDay = weekday === 1 || weekday === 3 || weekday === 5
  let weekType = 'training'
  if (weekIndex >= 12 && weekIndex <= 13) weekType = 'testing'
  else if (weekIndex === 14) weekType = 'deload'
  let meso, weekInMeso
  if (weekType === 'training') {
    meso = Math.floor(weekIndex / 4) + 1
    weekInMeso = (weekIndex % 4) + 1
  } else {
    meso = null
    weekInMeso = null
  }
  let dayType = null
  let difficulty = null
  if (weekType === 'training' && isSessionDay) {
    difficulty = DAY_SLOT[weekday]
    dayType = ROTATION[weekInMeso - 1][difficulty]
  }
  // In testing weeks: Mon & Fri are test sessions, Wed is an optional light day.
  let testRole = null
  let testLift = null
  if (weekType === 'testing' && isSessionDay) {
    testRole = weekday === 3 ? 'light' : 'test'
    if (testRole === 'test') testLift = (TESTING_SCHEDULE[weekIndex] || {})[weekday] || null
  }
  return {
    macro: macroNumber,
    meso,
    week: weekInMeso,
    dayType,
    difficulty,
    weekType,
    testRole,
    testLift,
    isSessionDay,
    weekIndex,
    daysSinceStart,
    displayWeekGlobal: weekIndex + 1,
    phase: weekType,
  }
}

export function computePosition(startISO, macroNumber, target) {
  const base = corePosition(startISO, macroNumber, target)
  if (base.beforeStart || base.complete) return base
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  base.nextSession = nextSessionFrom(startISO, macroNumber, t)
  return base
}

// Walk forward from a date to the next Mon/Wed/Fri session within the macro.
// Uses corePosition (not computePosition) so there is no recursion.
export function nextSessionFrom(startISO, macroNumber, fromDate) {
  for (let i = 0; i < 10; i++) {
    const d = new Date(fromDate)
    d.setDate(fromDate.getDate() + i)
    const wd = d.getDay()
    if (wd === 1 || wd === 3 || wd === 5) {
      const p = corePosition(startISO, macroNumber, d)
      if (p.complete || p.beforeStart) return null
      if (p.weekType === 'training' && p.dayType) {
        return { date: isoLocal(d), dayType: p.dayType, difficulty: p.difficulty, meso: p.meso, week: p.week }
      }
      if (p.weekType === 'testing') return { date: isoLocal(d), testing: true }
      if (p.weekType === 'deload') return { date: isoLocal(d), deload: true }
    }
  }
  return null
}

// Enumerate every program week (15 rows), each with its 3 Mon/Wed/Fri cells.
export function enumerateMacro(startISO, macroNumber) {
  const start = mondayOf(parseLocalDate(startISO))
  const rows = []
  for (let wi = 0; wi < MACRO_WEEKS; wi++) {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + wi * 7)
    const cells = []
    ;[1, 3, 5].forEach((offsetDow) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + (offsetDow - 1)) // Mon=+0, Wed=+2, Fri=+4
      const p = corePosition(startISO, macroNumber, d)
      cells.push({
        date: isoLocal(d),
        dow: offsetDow,
        weekType: p.weekType,
        testRole: p.testRole,
        testLift: p.testLift,
        meso: p.meso,
        week: p.week,
        dayType: p.dayType,
        difficulty: p.difficulty,
      })
    })
    rows.push({
      weekIndex: wi,
      displayWeek: wi + 1,
      weekType: cells[0].weekType,
      meso: cells[0].meso,
      week: cells[0].week,
      cells,
    })
  }
  return rows
}
