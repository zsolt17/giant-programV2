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
  cleanSpeed: string
  volDone: boolean
  volRpe: string
  volSpeed: string
  pullupCluster: string
  carrySkipped: boolean
  carrySkipReason: string
  carryRpe: string
  notes: string
  startedAt: string | null
  endedAt: string | null
  updatedAt?: string
}

export interface WeekSignals {
  types: Set<string>
  occurrences: number
  sessionCount: number
  fired: boolean
}
