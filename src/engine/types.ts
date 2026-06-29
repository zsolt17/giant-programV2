// Shared domain types for The Giant Program. Used across the engine and the data
// layer so the row<->app boundary and the program logic stay in sync.

export type Difficulty = 'hard' | 'medium' | 'light'
export type Lift = 'deadlift' | 'ohp' | 'squat' | 'dips'
export type WeekType = 'training' | 'testing' | 'deload'
export type TestRole = 'test' | 'light'

export interface Scheme {
  sets: number[]
  vol: number
}

export interface CarryMeta {
  name: string
  load: string // descriptive fallback shown only when no per-cycle weight is set in Setup
  perHand?: boolean // true = the Setup weight is per hand (Farmer/Suitcase/Overhead); display appends "/ hand"
  dist: string
  sets: string
}
export interface DayMeta {
  antag: string
  antagType: 'hold20' | 'pullup' | 'rdl' | 'dbrow'
  core: string
  carry: CarryMeta
}

// What the next scheduled session looks like (from nextSessionFrom).
export interface NextSession {
  date: string
  dayType?: Lift | null
  difficulty?: Difficulty | null
  meso?: number | null
  week?: number | null
  testing?: boolean
  deload?: boolean
}

// Result of the date engine's position math. Special states set beforeStart /
// complete; the normal training/testing/deload state fills the rest.
export interface Position {
  macro: number
  phase: string
  daysSinceStart: number
  beforeStart?: boolean
  complete?: boolean
  weekIndex?: number
  weekType?: WeekType
  meso?: number | null
  week?: number | null
  dayType?: Lift | null
  difficulty?: Difficulty | null
  testRole?: TestRole | null
  testLift?: Lift | null
  isSessionDay?: boolean
  displayWeekGlobal?: number
  nextSession?: NextSession | null
  startISO?: string
}

// One Mon/Wed/Fri cell in the calendar grid.
export interface MacroCell {
  date: string
  dow: number
  weekType: WeekType
  testRole: TestRole | null
  testLift: Lift | null
  meso: number | null
  week: number | null
  dayType: Lift | null
  difficulty: Difficulty | null
}
export interface MacroWeekRow {
  weekIndex: number
  displayWeek: number
  weekType: WeekType
  meso: number | null
  week: number | null
  cells: MacroCell[]
}

export interface GiantSet {
  set: number
  reps: number
  pct: number
  weight: number
  isTop: boolean
}
export interface WarmupSet {
  reps: number
  pct: number
  weight: number
}

// A logged session (app-object shape; mappers convert to/from DB rows).
export interface Session {
  id: string
  macroId: string
  date: string
  cycle: number | null
  week: number | null
  weekType: WeekType
  dayType: Lift | null
  difficulty: Difficulty | null
  topReps: number | null
  topWeight: number | null
  rpe: string
  barSpeed: string
  // Per-round Giant Block cardio calories, ordered [R1..R4]; null entry = unfilled round.
  cardioCals: (number | null)[]
  volDone: boolean
  volRpe: string
  volSpeed: string
  pullupCluster: string
  carrySkipped: boolean
  carrySkipReason: string
  carryRounds: number | null
  carryDistance: number | null
  carryRpe: string
  notes: string
  startedAt: string | null
  endedAt: string | null
  updatedAt?: string
}

// A session as held in the UI form state and handed to the persistence layer.
// Numeric inputs hold raw strings until the mappers coerce them (toNum/blankToNull),
// so the form-bound fields are looser than the canonical persisted Session.
export interface SessionDraft extends Omit<Session, 'cardioCals' | 'carryRounds' | 'carryDistance'> {
  cardioCals: (number | string | null)[]
  carryRounds: number | string | null
  carryDistance: number | string | null
}

export interface WeekSignals {
  types: Set<string>
  occurrences: number
  sessionCount: number
  fired: boolean
}

// ---- data-layer domain types ----------------------------------------------
export type MacroStatus = 'active' | 'completed'
export interface Macro {
  id: string
  number: number
  startISO: string
  weeks: number
  status: MacroStatus
}

export interface LiftWeights {
  hard: number | null
  medium: number | null
  light: number | null
}
// Setup-form anchor cell — the Hard top set, held as a string until the mapper
// coerces it. medium/light are optional (computed now, not entered): the full
// computed LiftWeights grid is still assignable here, so rollToNextMacro can pass it.
export interface LiftWeightsInput {
  hard: number | string | null
  medium?: number | string | null
  light?: number | string | null
}
// cycle (1|2|3) -> lift -> H/M/L grid
export type WeightsByCycle = Record<number, Record<string, LiftWeights>>
// cycle -> item ('clean' | 'carry_*') -> weight
export type AccessoryByCycle = Record<number, Record<string, number | null>>

export type DeloadMap = Record<string, boolean> // weekKey -> true
export type BreakDayMap = Record<string, boolean> // dateISO -> true

export interface TestingResult {
  id?: string
  macroId: string
  lift: string
  weight: number | null
  reps: number | null
  notes: string
  testedOn: string | null
}

export interface MacroBundle {
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  sessions: Session[]
  deloads: DeloadMap
  breakDays: BreakDayMap
  testing: TestingResult[]
}

// ---- Trends tab ------------------------------------------------------------
// All of the user's data across every macro (RLS-scoped), loaded once when the
// Trends tab opens. Per-macro maps are keyed by macro id.
export interface TrendsData {
  macros: Macro[]
  sessions: Session[]
  weights: Record<string, WeightsByCycle>
  accessory: Record<string, AccessoryByCycle>
  testing: TestingResult[]
  deloads: DeloadMap // weekKey ("M2C3W4") is globally unique, so one map spans macros
  breakDays: BreakDayMap
}

// A training session flattened to the shape the Trends charts consume (mirrors the
// mockup's row model). Derived from Session via engine/trends.ts — not persisted.
export type TrendDay = 'DL' | 'OHP' | 'Squat' | 'Dips'
export interface TrendSession {
  macro: string // "M2"
  macroNumber: number
  cycle: string // "C1"
  week: string // "W1"
  day: TrendDay
  date: string
  weight: number | null
  rpe: number | null
  spd: 0 | 1 | 2 | null // 0 slow · 1 normal · 2 fast (from bar_speed)
  dur: number | null // minutes, derived from started/ended
  S1: 0 | 1
  S2: 0 | 1
  S3: 0 | 1
  S5: 0 | 1
  volOk: boolean
  status: 'done' | 'deload'
  sets: number[] // per-round cardio kcal (cardio_cals)
}

// Recorded accessory weight (one-arm DB row / B-stance RDL) per cycle, for the
// Accessories trend view. One point per (macro, cycle) that has a value logged.
export interface TrendAccessory {
  macro: string
  cycle: string
  label: string // "M2C1"
  weight: number
}

// Attendance grid (Session view). Columns are the Mon/Wed/Fri slots; each cell's
// status is derived from the schedule + what was logged.
export type AttStatus = 'done' | 'deload' | 'test' | 'missed' | 'holiday' | 'upcoming' | null
export interface AttWeek {
  week: string
  cells: AttStatus[]
}
export interface AttCycle {
  cycle: string
  weeks: AttWeek[]
  done: number
  deload: number
  missed: number
  holiday: number
  total: number
}
export interface AttEndRow {
  row: string // "T1" | "T2" | "W15"
  cells: AttStatus[]
}
export interface AttMacro {
  macro: string
  cycles: AttCycle[]
  endRows: AttEndRow[]
  epDone: number
  epMissed: number
  epHoliday: number
  epTotal: number
}

// One carry per training session, typed by the day's lift, for the Carries view.
export type CarryType = 'Farmer' | 'Suitcase' | 'Sandbag' | 'Overhead'
export interface TrendCarry {
  macro: string
  cycle: string
  week: string
  date: string
  type: CarryType
  weight: number | null // per-cycle carry load (from accessory_weights)
  distance: number | null // metres per round (from carry_distance)
}
