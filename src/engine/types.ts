// Shared domain types for The Giant Program. Used across the engine and the data
// layer so the row<->app boundary and the program logic stay in sync.

export type Difficulty = 'hard' | 'medium' | 'light'
export type Lift = 'deadlift' | 'ohp' | 'squat' | 'dips'
export type WeekType = 'training' | 'testing' | 'deload'
export type TestRole = 'test' | 'light'

export interface Scheme {
  sets: number[]
  pct: number[]
  vol: number
}

export interface CarryMeta {
  name: string
  load: string
  dist: string
  sets: string
}
export interface DayMeta {
  antag: string
  antagType: 'hold' | 'hold20' | 'pullup' | 'ringrow'
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
  cleanLoad: number | null
  cleanRounds: number | null
  cleanSpeed: string
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
export interface SessionDraft extends Omit<Session, 'cleanLoad' | 'cleanRounds' | 'cardioCals' | 'carryRounds' | 'carryDistance'> {
  cleanLoad: number | string | null
  cleanRounds: number | string | null
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
// Loose H/M/L cell as held in the Setup form — inputs hold strings until the
// mappers coerce them. LiftWeights is assignable to this (number|null ⊆ here).
export interface LiftWeightsInput {
  hard: number | string | null
  medium: number | string | null
  light: number | string | null
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
