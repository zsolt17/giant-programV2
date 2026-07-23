// MACRO DATE ENGINE — battle-tested; preserve this logic exactly. Strict-date
// model: position is computed from the macro start date, never set manually.
// Miss a session and you rejoin where the calendar says.
//
// WEEKS-DRIVEN (since the 13-week restructure): every entry point takes the
// macro's shape ({ weeks, deloadExtended }). Training is ALWAYS weeks 0–11
// (three 4-week mesocycles); the deload is the FINAL week (`weeks - 1`), plus
// one identical week when the athlete extended it. Any gap between week 12 and
// the deload exists only on legacy weeks=15 macros and keeps the old TESTING
// logic, so lived testing history stays renderable — new macros (weeks=13)
// never compute a testing week.
//
// Critical: corePosition does the position math ONLY and never computes the next
// session, so it cannot recurse. computePosition and nextSessionFrom both call
// corePosition. Keep that separation (an early version recursed infinitely).
import { ROTATION, GIANTFIT_ROTATION, GIANTFIT_START_DATE, MACRO_WEEKS, DAY_SLOT, TESTING_SCHEDULE } from './constants'
import type { Difficulty, Lift, WeekType, TestRole, Position, NextSession, MacroCell, MacroShape, MacroWeekRow, CapacityVariant } from './types'

// Parse a YYYY-MM-DD string to a LOCAL Date at midnight (no UTC drift).
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// LOCAL YYYY-MM-DD for a Date.
export function isoLocal(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Today's LOCAL date string (Brașov timezone of the host) — never UTC.
export function todayISO(): string {
  return isoLocal(new Date())
}

// The macro start is anchored to a Monday. Snap any given start to its Monday.
export function mondayOf(dt: Date): Date {
  const day = dt.getDay() // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day // move back to Monday
  const m = new Date(dt)
  m.setDate(dt.getDate() + diff)
  return m
}

// The macro's total weeks incl. the athlete's deload extension.
export function totalWeeksOf(shape: MacroShape = {}): number {
  return (shape.weeks ?? MACRO_WEEKS) + (shape.deloadExtended ? 1 : 0)
}

// ---- GiantFit cutover -------------------------------------------------------
// The DATE decides the era: on/after GIANTFIT_START_DATE a day schedules with
// the GiantFit rules (rotation with Bench, C1 override, no skill days, capacity
// alternation); before it, the legacy Giant rules render read-only history.
export function isGiantFitDate(d: Date | string): boolean {
  const t = typeof d === 'string' ? parseLocalDate(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return t.getTime() >= mondayOf(parseLocalDate(GIANTFIT_START_DATE)).getTime()
}

// The lift occupying a week's slot in either era — the UI's difficulty-peek
// uses this; the actual day comes from corePosition (which also applies the
// C1 override, so on an override day peek by rotation, render by position).
export function rotationLiftFor(weekInMeso: number, difficulty: Difficulty, giantfit: boolean): Lift {
  return (giantfit ? GIANTFIT_ROTATION : ROTATION)[weekInMeso - 1][difficulty]
}

// GiantFit capacity alternation: the index of a strength SLOT since the cutover
// (Mon=0 / Wed=1 / Fri=2 each week). Counts SCHEDULED slots, not completed
// sessions, so missed or edited days never desync the A/B alternation.
const STRENGTH_DAY_IDX: Record<number, number> = { 1: 0, 3: 1, 5: 2 }
export function strengthSlotIndex(target: Date): number | null {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const idx = STRENGTH_DAY_IDX[t.getDay()]
  if (idx === undefined || !isGiantFitDate(t)) return null
  const start = mondayOf(parseLocalDate(GIANTFIT_START_DATE))
  const days = Math.floor((t.getTime() - start.getTime()) / 86400000)
  return Math.floor(days / 7) * 3 + idx
}
// Even slot index = variant A, odd = B. Null off-slot / pre-cutover.
export function capacityVariantFor(target: Date): CapacityVariant | null {
  const i = strengthSlotIndex(target)
  return i == null ? null : i % 2 === 0 ? 'A' : 'B'
}

// Core position math only — never computes nextSession, so it cannot recurse.
// Returns a normal training/testing/deload Position, or a special-state object
// ({ beforeStart } / { complete }). `shape` = the macro's stored weeks +
// deload extension (defaults: 13 weeks, not extended).
export function corePosition(startISO: string, macroNumber: number, target: Date, shape: MacroShape = {}): Position {
  const weeks = shape.weeks ?? MACRO_WEEKS
  const totalWeeks = totalWeeksOf(shape)
  const start = mondayOf(parseLocalDate(startISO))
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const daysSinceStart = Math.floor((t.getTime() - start.getTime()) / 86400000)

  if (daysSinceStart < 0) {
    return { macro: macroNumber, beforeStart: true, daysSinceStart, phase: 'upcoming', totalWeeks }
  }
  const weekIndex = Math.floor(daysSinceStart / 7)
  if (weekIndex >= totalWeeks) {
    return { macro: macroNumber, complete: true, weekIndex, daysSinceStart, phase: 'complete', totalWeeks }
  }
  const weekday = t.getDay()
  const isSessionDay = weekday === 1 || weekday === 3 || weekday === 5
  const giantfit = isGiantFitDate(t)
  // Deload = the final week(s): weeks-1 (+ the extension week). The 12..deload
  // gap exists only on legacy weeks=15 macros (all pre-cutover) and keeps the
  // testing logic so lived history renders — GiantFit macros never compute it.
  let weekType: WeekType = 'training'
  if (weekIndex >= weeks - 1) weekType = 'deload'
  else if (weekIndex >= 12) weekType = 'testing'
  let meso: number | null = null
  let weekInMeso: number | null = null
  if (weekType === 'training') {
    meso = Math.floor(weekIndex / 4) + 1
    weekInMeso = (weekIndex % 4) + 1
  }
  let dayType: Lift | null = null
  let difficulty: Difficulty | null = null
  if (weekType === 'training' && isSessionDay) {
    difficulty = DAY_SLOT[weekday]
    dayType = (giantfit ? GIANTFIT_ROTATION : ROTATION)[(weekInMeso as number) - 1][difficulty]
    // GiantFit C1 override: each macro's very first slot (C1 W1 Day 1) runs
    // MEDIUM instead of Hard. The lift stays deadlift (the W1 hard-slot lift);
    // only the difficulty drops — so deadlift deliberately has no Hard day in
    // C1 (M/M/L). C2 and C3 follow the normal slot difficulties.
    if (giantfit && meso === 1 && weekInMeso === 1 && weekday === 1) difficulty = 'medium'
  }
  // Legacy testing weeks: Mon & Fri were test sessions, Wed an optional light day.
  let testRole: TestRole | null = null
  let testLift: Lift | null = null
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
    totalWeeks,
    giantfit,
    // Capacity variant for post-cutover strength slots (training + deload —
    // the slot is scheduled either way; Phase 3 decides what deload days show).
    capacityVariant: giantfit && isSessionDay && weekType !== 'testing' ? capacityVariantFor(t) : null,
    phase: weekType,
  }
}

export function computePosition(startISO: string, macroNumber: number, target: Date, shape: MacroShape = {}): Position {
  const base = corePosition(startISO, macroNumber, target, shape)
  if (base.beforeStart || base.complete) return base
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  base.nextSession = nextSessionFrom(startISO, macroNumber, t, shape)
  return base
}

// Walk forward from a date to the next Mon/Wed/Fri session within the macro.
// Uses corePosition (not computePosition) so there is no recursion.
export function nextSessionFrom(startISO: string, macroNumber: number, fromDate: Date, shape: MacroShape = {}): NextSession | null {
  for (let i = 0; i < 10; i++) {
    const d = new Date(fromDate)
    d.setDate(fromDate.getDate() + i)
    const wd = d.getDay()
    if (wd === 1 || wd === 3 || wd === 5) {
      const p = corePosition(startISO, macroNumber, d, shape)
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

// Enumerate every program week (13 rows; 14 extended; legacy 15/16), each with
// its 3 Mon/Wed/Fri cells.
export function enumerateMacro(startISO: string, macroNumber: number, shape: MacroShape = {}): MacroWeekRow[] {
  const start = mondayOf(parseLocalDate(startISO))
  const rows: MacroWeekRow[] = []
  for (let wi = 0; wi < totalWeeksOf(shape); wi++) {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + wi * 7)
    const cells: MacroCell[] = []
    ;[1, 3, 5].forEach((offsetDow) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + (offsetDow - 1)) // Mon=+0, Wed=+2, Fri=+4
      const p = corePosition(startISO, macroNumber, d, shape)
      cells.push({
        date: isoLocal(d),
        dow: offsetDow,
        weekType: p.weekType as WeekType,
        testRole: p.testRole ?? null,
        testLift: p.testLift ?? null,
        meso: p.meso ?? null,
        week: p.week ?? null,
        dayType: p.dayType ?? null,
        difficulty: p.difficulty ?? null,
        capacityVariant: p.capacityVariant ?? null,
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
