// MACRO DATE ENGINE — battle-tested; preserve this logic exactly. Strict-date
// model: position is computed from the macro start date, never set manually.
// Miss a session and you rejoin where the calendar says.
//
// WEEKS-DRIVEN (since the 13-week restructure): every entry point takes the
// macro's shape ({ weeks, deloadExtended }). Training is ALWAYS weeks 0–11
// (three 4-week mesocycles); the deload is the FINAL week (`weeks - 1`), plus
// one identical week when the athlete extended it.
//
// Critical: corePosition does the position math ONLY and never computes the next
// session, so it cannot recurse. computePosition and nextSessionFrom both call
// corePosition. Keep that separation (an early version recursed infinitely).
import {
  MACRO_WEEKS,
  GIANT2_DAY_LIFT,
  GIANT2_SESSION_DAYS,
  GIANT2_GIANT_DEFAULT_ROTATION,
  GIANT2_WEEK4_DIFFICULTY,
  GIANT2_VOLUME_DIFFICULTY_BY_CYCLE,
  GIANT2_CAPABILITY_BY_CYCLE,
} from './constants'
import type { Difficulty, Lift, WeekType, Position, NextSession, MacroCell, MacroShape, MacroWeekRow, Giant2DifficultyConfig, CapabilityProgram } from './types'

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
// Returns a normal training/deload Position, or a special-state object
// ({ beforeStart } / { complete }). `shape` = the macro's stored weeks +
// deload extension (defaults: 13 weeks, not extended). `giant2Config` = the
// athlete's Setup override for the weekly Giant-difficulty rotation (optional
// — undefined falls back to the code default, GIANT2_GIANT_DEFAULT_ROTATION).
export function corePosition(startISO: string, macroNumber: number, target: Date, shape: MacroShape = {}, giant2Config?: Giant2DifficultyConfig): Position {
  const totalWeeks = totalWeeksOf(shape)
  const weeks = shape.weeks ?? MACRO_WEEKS
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
  const isSessionDay = GIANT2_SESSION_DAYS.includes(weekday)
  const weekType: WeekType = weekIndex >= weeks - 1 ? 'deload' : 'training'
  let meso: number | null = null
  let weekInMeso: number | null = null
  if (weekType === 'training') {
    meso = Math.floor(weekIndex / 4) + 1
    weekInMeso = (weekIndex % 4) + 1
  }
  // Fixed day->lift, no rotation. The deload week DOES carry a dayType (Mon
  // is always Squat, deload or not) — just no Giant/Volume difficulty (deload
  // runs a flat ~70%, not H/M/L).
  let dayType: Lift | null = null
  let difficulty: Difficulty | null = null
  let volumeDifficulty: Difficulty | null = null
  if ((weekType === 'training' || weekType === 'deload') && isSessionDay) {
    dayType = GIANT2_DAY_LIFT[weekday] ?? null
  }
  if (weekType === 'training' && dayType) {
    difficulty = giant2GiantDifficultyFor(meso as number, weekInMeso as number, dayType, giant2Config)
    volumeDifficulty = giant2VolumeDifficultyFor(meso as number, weekInMeso as number)
  }
  return {
    macro: macroNumber,
    meso,
    week: weekInMeso,
    dayType,
    difficulty,
    volumeDifficulty,
    weekType,
    isSessionDay,
    weekIndex,
    daysSinceStart,
    displayWeekGlobal: weekIndex + 1,
    totalWeeks,
    phase: weekType,
  }
}

export function computePosition(startISO: string, macroNumber: number, target: Date, shape: MacroShape = {}, giant2Config?: Giant2DifficultyConfig): Position {
  const base = corePosition(startISO, macroNumber, target, shape, giant2Config)
  if (base.beforeStart || base.complete) return base
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  base.nextSession = nextSessionFrom(startISO, macroNumber, t, shape, giant2Config)
  return base
}

// Walk forward from a date to the next session within the macro (Mon/Tue/Thu/Fri
// — corePosition's own isSessionDay already knows the schedule). Uses
// corePosition (not computePosition) so there is no recursion.
export function nextSessionFrom(startISO: string, macroNumber: number, fromDate: Date, shape: MacroShape = {}, giant2Config?: Giant2DifficultyConfig): NextSession | null {
  for (let i = 0; i < 10; i++) {
    const d = new Date(fromDate)
    d.setDate(fromDate.getDate() + i)
    const p = corePosition(startISO, macroNumber, d, shape, giant2Config)
    if (p.complete || p.beforeStart) return null
    if (!p.isSessionDay) continue
    if (p.weekType === 'training' && p.dayType) {
      return { date: isoLocal(d), dayType: p.dayType, difficulty: p.difficulty, volumeDifficulty: p.volumeDifficulty, meso: p.meso, week: p.week }
    }
    if (p.weekType === 'deload') {
      return p.dayType
        ? { date: isoLocal(d), deload: true, dayType: p.dayType, difficulty: p.difficulty, volumeDifficulty: p.volumeDifficulty, meso: p.meso, week: p.week }
        : { date: isoLocal(d), deload: true }
    }
  }
  return null
}

// Enumerate every program week (13 rows; 14 extended), each with its
// Mon/Tue/Thu/Fri session-day cells.
export function enumerateMacro(startISO: string, macroNumber: number, shape: MacroShape = {}, giant2Config?: Giant2DifficultyConfig): MacroWeekRow[] {
  const start = mondayOf(parseLocalDate(startISO))
  const rows: MacroWeekRow[] = []
  for (let wi = 0; wi < totalWeeksOf(shape); wi++) {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + wi * 7)
    const cells: MacroCell[] = []
    GIANT2_SESSION_DAYS.forEach((offsetDow) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + (offsetDow - 1)) // Mon=+0, Tue=+1, Wed=+2, Thu=+3, Fri=+4
      const p = corePosition(startISO, macroNumber, d, shape, giant2Config)
      cells.push({
        date: isoLocal(d),
        dow: offsetDow,
        weekType: p.weekType as WeekType,
        meso: p.meso ?? null,
        week: p.week ?? null,
        dayType: p.dayType ?? null,
        difficulty: p.difficulty ?? null,
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
