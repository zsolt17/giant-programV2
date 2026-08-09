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
import {
  ROTATION,
  GIANTFIT_ROTATION,
  GIANTFIT_START_DATE,
  MACRO_WEEKS,
  DAY_SLOT,
  TESTING_SCHEDULE,
  GIANT2_START_DATE,
  GIANT2_DAY_LIFT,
  GIANT2_SESSION_DAYS,
  GIANT2_GIANT_DEFAULT_ROTATION,
  GIANT2_WEEK4_DIFFICULTY,
  GIANT2_VOLUME_DIFFICULTY_BY_CYCLE,
  GIANT2_CAPABILITY_BY_CYCLE,
} from './constants'
import type { Difficulty, Lift, WeekType, TestRole, Position, NextSession, MacroCell, MacroShape, MacroWeekRow, CapacityVariant, Giant2DifficultyConfig, CapabilityProgram } from './types'

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

// ---- Giant 2.0 cutover (from GIANT2_START_DATE) ------------------------------
// GiantFit is RETIRED, not run alongside — the date alone decides the era,
// mirroring isGiantFitDate exactly. isGiantFitDate itself is UNCHANGED (still
// true for Giant 2.0 dates too, chronologically) — callers must check
// isGiant2Date FIRST, since it's the more specific era.
export function isGiant2Date(d: Date | string): boolean {
  const t = typeof d === 'string' ? parseLocalDate(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return t.getTime() >= mondayOf(parseLocalDate(GIANT2_START_DATE)).getTime()
}

// The Giant block's difficulty for one lift on a training week. Week 4 always
// collapses to one difficulty for the whole cycle (GIANT2_WEEK4_DIFFICULTY) —
// never stored, never per-lift. Weeks 1-3 read the athlete's Setup override
// (`config`), falling back to the code default — capacity-config pattern, so
// an unconfigured athlete still gets a correct, internally-consistent rotation.
export function giant2GiantDifficultyFor(cycle: number, weekInCycle: number, lift: Lift, config?: Giant2DifficultyConfig): Difficulty {
  if (weekInCycle === 4) return GIANT2_WEEK4_DIFFICULTY[cycle]
  return (config?.[weekInCycle]?.[lift] as Difficulty | undefined) ?? (GIANT2_GIANT_DEFAULT_ROTATION[weekInCycle][lift] as Difficulty)
}

// The Volume block's difficulty for a training week: fixed per cycle,
// EXCEPT C3 week 4 where the Volume block doesn't run at all (null = skip,
// not "unset" — a semi-peak week, Giant and Capability still run that week).
export function giant2VolumeDifficultyFor(cycle: number, weekInCycle: number): Difficulty | null {
  if (cycle === 3 && weekInCycle === 4) return null
  return GIANT2_VOLUME_DIFFICULTY_BY_CYCLE[cycle]
}

// Which Capability sub-program a cycle reads — a pure function of the cycle
// number, never the week or session (GIANT2_CAPABILITY_BY_CYCLE, constants.ts).
export function capabilityProgramFor(cycle: number): CapabilityProgram {
  return GIANT2_CAPABILITY_BY_CYCLE[cycle]
}

// Core position math only — never computes nextSession, so it cannot recurse.
// Returns a normal training/testing/deload Position, or a special-state object
// ({ beforeStart } / { complete }). `shape` = the macro's stored weeks +
// deload extension (defaults: 13 weeks, not extended). `giant2Config` = the
// athlete's Setup override for the weekly Giant-difficulty rotation (optional
// — undefined falls back to the code default, GIANT2_GIANT_DEFAULT_ROTATION);
// ignored entirely for non-Giant-2.0 dates.
export function corePosition(
  startISO: string,
  macroNumber: number,
  target: Date,
  shape: MacroShape = {},
  giant2Config?: Giant2DifficultyConfig
): Position {
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
  const giant2 = isGiant2Date(t)
  const giantfit = isGiantFitDate(t)
  const isSessionDay = giant2 ? GIANT2_SESSION_DAYS.includes(weekday) : weekday === 1 || weekday === 3 || weekday === 5
  // Deload = the final week(s): weeks-1 (+ the extension week). The 12..deload
  // gap exists only on legacy weeks=15 macros (all pre-cutover) and keeps the
  // testing logic so lived history renders — GiantFit/Giant2 macros never
  // compute it.
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
  let volumeDifficulty: Difficulty | null = null
  if (giant2) {
    // Fixed day->lift, no rotation — unlike every era before it. Unlike
    // GiantFit, the deload week DOES carry a dayType (Mon is always Squat,
    // deload or not — the calendar confirms this, 2026-08-09), just no
    // Giant/Volume difficulty (deload runs a flat ~70%, not H/M/L).
    if ((weekType === 'training' || weekType === 'deload') && isSessionDay) {
      dayType = GIANT2_DAY_LIFT[weekday] ?? null
    }
    if (weekType === 'training' && dayType) {
      difficulty = giant2GiantDifficultyFor(meso as number, weekInMeso as number, dayType, giant2Config)
      volumeDifficulty = giant2VolumeDifficultyFor(meso as number, weekInMeso as number)
    }
  } else if (weekType === 'training' && isSessionDay) {
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
    volumeDifficulty,
    weekType,
    testRole,
    testLift,
    isSessionDay,
    weekIndex,
    daysSinceStart,
    displayWeekGlobal: weekIndex + 1,
    totalWeeks,
    giantfit,
    giant2,
    // Capacity variant for post-cutover GiantFit strength slots only (training
    // + deload — the slot is scheduled either way). Giant 2.0 has no Capacity
    // block at all, regardless of weekday overlap with GiantFit's Mon/Wed/Fri.
    capacityVariant: !giant2 && giantfit && isSessionDay && weekType !== 'testing' ? capacityVariantFor(t) : null,
    phase: weekType,
  }
}

export function computePosition(
  startISO: string,
  macroNumber: number,
  target: Date,
  shape: MacroShape = {},
  giant2Config?: Giant2DifficultyConfig
): Position {
  const base = corePosition(startISO, macroNumber, target, shape, giant2Config)
  if (base.beforeStart || base.complete) return base
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  base.nextSession = nextSessionFrom(startISO, macroNumber, t, shape, giant2Config)
  return base
}

// Walk forward from a date to the next session within the macro (Mon/Wed/Fri
// pre-Giant-2.0, Mon/Tue/Thu/Fri from GIANT2_START_DATE — corePosition's own
// isSessionDay already knows which, so this just defers to it instead of
// duplicating the weekday set). Uses corePosition (not computePosition) so
// there is no recursion.
export function nextSessionFrom(
  startISO: string,
  macroNumber: number,
  fromDate: Date,
  shape: MacroShape = {},
  giant2Config?: Giant2DifficultyConfig
): NextSession | null {
  for (let i = 0; i < 10; i++) {
    const d = new Date(fromDate)
    d.setDate(fromDate.getDate() + i)
    const p = corePosition(startISO, macroNumber, d, shape, giant2Config)
    if (p.complete || p.beforeStart) return null
    if (!p.isSessionDay) continue
    if (p.weekType === 'training' && p.dayType) {
      return { date: isoLocal(d), dayType: p.dayType, difficulty: p.difficulty, volumeDifficulty: p.volumeDifficulty, meso: p.meso, week: p.week }
    }
    if (p.weekType === 'testing') return { date: isoLocal(d), testing: true }
    if (p.weekType === 'deload') {
      // Giant 2.0's deload carries a dayType (fixed day->lift, deload or not);
      // GiantFit/legacy deload never does — see corePosition.
      return p.dayType
        ? { date: isoLocal(d), deload: true, dayType: p.dayType, difficulty: p.difficulty, volumeDifficulty: p.volumeDifficulty, meso: p.meso, week: p.week }
        : { date: isoLocal(d), deload: true }
    }
  }
  return null
}

// Enumerate every program week (13 rows; 14 extended; legacy 15/16), each with
// its session-day cells — 3 (Mon/Wed/Fri) pre-Giant-2.0, 4 (Mon/Tue/Thu/Fri)
// from GIANT2_START_DATE. Decided PER WEEK off that week's own Monday, so a
// macro that happens to straddle the cutover renders correctly on both sides
// (in practice a fresh macro starts at the cutover, but this costs nothing).
export function enumerateMacro(
  startISO: string,
  macroNumber: number,
  shape: MacroShape = {},
  giant2Config?: Giant2DifficultyConfig
): MacroWeekRow[] {
  const start = mondayOf(parseLocalDate(startISO))
  const rows: MacroWeekRow[] = []
  for (let wi = 0; wi < totalWeeksOf(shape); wi++) {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + wi * 7)
    const offsets = isGiant2Date(weekStart) ? GIANT2_SESSION_DAYS : [1, 3, 5]
    const cells: MacroCell[] = []
    offsets.forEach((offsetDow) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + (offsetDow - 1)) // Mon=+0, Tue=+1, Wed=+2, Thu=+3, Fri=+4
      const p = corePosition(startISO, macroNumber, d, shape, giant2Config)
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
        volumeDifficulty: p.volumeDifficulty ?? null,
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
