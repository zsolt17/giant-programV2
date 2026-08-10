// Shared domain types for The Giant Program (Giant 2.0). Used across the
// engine and the data layer so the row<->app boundary and the program logic
// stay in sync.

export type Difficulty = 'hard' | 'medium' | 'light'
export type Lift = 'deadlift' | 'ohp' | 'squat' | 'bench'
// Lifts that can hold a per-cycle Hard-top anchor in working_weights. Anchors
// are DL/OHP/Squat/Bench plus two anchored secondary lanes — the LANE keys
// 'db_row' (OHP day, holds BB Row) and 'pendlay_row' (bench day, holds
// Pull-ups, two-mode — see liftMode in engine/loading.ts).
export type AnchorLift = Lift | 'db_row' | 'pendlay_row'
export type WeekType = 'training' | 'deload'

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
  carry: CarryMeta
}

// What the next scheduled session looks like (from nextSessionFrom).
export interface NextSession {
  date: string
  dayType?: Lift | null
  difficulty?: Difficulty | null
  // The Volume block's own difficulty (null on weeks with no Volume block —
  // C3 week 4).
  volumeDifficulty?: Difficulty | null
  meso?: number | null
  week?: number | null
  deload?: boolean
}

// The per-macro structure the date engine computes against: total weeks as
// stored on the macro (13 by default) and the athlete's deload extension.
// Every engine entry point takes this as an optional trailing argument.
export interface MacroShape {
  weeks?: number
  deloadExtended?: boolean
}

// Result of the date engine's position math. Special states set beforeStart /
// complete; the normal training/deload state fills the rest.
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
  isSessionDay?: boolean
  displayWeekGlobal?: number
  // Total weeks of this macro incl. a deload extension (13/14) — drives every
  // "wk X/Y" label.
  totalWeeks?: number
  // The Volume block's own difficulty (fixed per cycle, null when there's no
  // Volume block that week — C3 week 4).
  volumeDifficulty?: Difficulty | null
  nextSession?: NextSession | null
  startISO?: string
}

// One Mon/Tue/Thu/Fri cell in the calendar grid.
export interface MacroCell {
  date: string
  dow: number
  weekType: WeekType
  meso: number | null
  week: number | null
  dayType: Lift | null
  difficulty: Difficulty | null
  // The Volume block's own difficulty (null on a week with no Volume block —
  // C3 week 4).
  volumeDifficulty: Difficulty | null
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
  // The Volume block's OWN difficulty (fixed per cycle — see
  // GIANT2_VOLUME_DIFFICULTY_BY_CYCLE). Null = no Volume block that session
  // (C3 week 4, or deload) — independent of `difficulty` above.
  volumeDifficulty: Difficulty | null
  topReps: number | null
  topWeight: number | null
  rpe: string
  barSpeed: string
  // Per-round Giant Block cardio calories, ordered [R1..R4]; null entry = unfilled round.
  cardioCals: (number | null)[]
  // Giant Block adherence: 'completed' (as prescribed) or a categorical fail reason.
  // Empty/null on legacy rows → treated as completed. Drives deload signal S7.
  blockCompletion: string
  volDone: boolean
  volRpe: string
  volSpeed: string
  // Bench day's two-mode secondary (Pull-ups, bodyweight mode): final-round cluster, e.g. "6+4".
  pullupCluster: string
  // Primer card completion (Today redesign) — the block is a checklist, not
  // numeric log entries, so this single flag IS the persisted "done" signal;
  // which individual items were checked is UI-only local state, never stored.
  primerDone: boolean
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

// ---- Giant 2.0 ---------------------------------------------------------------
// Which sub-program occupies the Capability block — a property of the CYCLE
// (GIANT2_CAPABILITY_BY_CYCLE), never the week or session. The slot inventory
// itself stays code (engine/program.ts); this only says which of the three
// slot groups a given cycle's sessions should read.
export type CapabilityProgram = 'hypertrophy' | 'oly' | 'carries'

// The athlete's per-cycle-week Giant-difficulty rotation override (Setup-
// editable — capacity-config pattern). week_in_cycle (1-3) -> lift ->
// difficulty; week 4 is never stored here (GIANT2_WEEK4_DIFFICULTY, a pure
// function of the cycle, always wins on week 4). Unset cells fall back to
// GIANT2_GIANT_DEFAULT_ROTATION on read.
export type Giant2DifficultyConfig = Record<number, Partial<Record<Lift, Difficulty>>>

// ---- Capability block logs (C1 Hypertrophy, C2 Oly) ------------------------
// One row PER MOVEMENT per session. Carries (C3) need no equivalent: they
// reuse Session's own carry_* fields.
export interface HypertrophyLog {
  id?: string
  sessionId: string
  movementId: string
  setNumber: number // 1..GIANT2_HYPERTROPHY_SETS — one row per set, not per movement
  weight: number | null
  repsDone: number | null
  rpe: string // "R6".."R10" | '' (unset) — optional, not required for Done
  notes: string
  updatedAt?: string
}
export interface HypertrophyLogDraft extends Omit<HypertrophyLog, 'weight' | 'repsDone'> {
  weight: number | string | null
  repsDone: number | string | null
}

// Oly logs a QUALITY MARK (Q1/Q2/Q3), never RPE — see OLY_QUALITY,
// constants.ts. Weight is the per-lane technical ceiling, found by feel.
export interface OlyLog {
  id?: string
  sessionId: string
  movementId: string
  weight: number | null
  quality: string // 'Q1' | 'Q2' | 'Q3' | '' (unset)
  notes: string
  updatedAt?: string
}
export interface OlyLogDraft extends Omit<OlyLog, 'weight'> {
  weight: number | string | null
}

// ---- data-layer domain types ----------------------------------------------
export type MacroStatus = 'active' | 'completed'
export interface Macro {
  id: string
  number: number
  startISO: string
  weeks: number
  status: MacroStatus
  // Athlete extended the deload by one identical week (decided during the
  // deload, never pre-planned). Adds one week to the macro's total.
  deloadExtended: boolean
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
// cycle -> item (carry_*) -> weight
export type AccessoryByCycle = Record<number, Record<string, number | null>>

export type DeloadMap = Record<string, boolean> // weekKey -> true
export type BreakDayMap = Record<string, boolean> // dateISO -> true

export interface MacroBundle {
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  sessions: Session[]
  deloads: DeloadMap
  breakDays: BreakDayMap
  // User-scoped Giant Block accessory rep targets (movement key → reps), app
  // defaults already merged in (GB_DEFAULT_REPS).
  giantAccessory: GiantAccessoryReps
  // User-scoped weekly Giant-difficulty rotation override, app default
  // (GIANT2_GIANT_DEFAULT_ROTATION) already merged in.
  giant2Difficulty: Giant2DifficultyConfig
  // Capability block logs for this macro's sessions (C1 Hypertrophy / C2 Oly
  // — one row per movement per session).
  hypertrophyLogs: HypertrophyLog[]
  olyLogs: OlyLog[]
}

// Giant Block bodyweight-accessory rep targets, keyed by movement key
// (ab_rollout / leg_raises), defaults merged on read.
export type GiantAccessoryReps = Record<string, number>

// ---- Trends tab ------------------------------------------------------------
// All of the user's data across every macro (RLS-scoped), loaded once when the
// Trends tab opens. Per-macro maps are keyed by macro id.
export interface TrendsData {
  macros: Macro[]
  sessions: Session[]
  weights: Record<string, WeightsByCycle>
  accessory: Record<string, AccessoryByCycle>
  deloads: DeloadMap // weekKey ("M2C3W4") is globally unique, so one map spans macros
  breakDays: BreakDayMap
}

// A training session flattened to the shape the Trends charts consume (mirrors the
// mockup's row model). Derived from Session via engine/trends.ts — not persisted.
export type TrendDay = 'DL' | 'OHP' | 'Squat' | 'Bench'
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
  S7: 0 | 1 // giant block not completed as prescribed
  volOk: boolean
  status: 'done' | 'deload'
  sets: number[] // per-round cardio kcal (cardio_cals)
}

// ---- Recovery > Tendon Health -----------------------------------------------
// An active or completed joint isometric-loading protocol. Joint/Phase live in
// engine/recovery-content.ts (the static content module).
export interface RecoveryProtocol {
  id: string
  joint: import('./recovery-content').Joint
  startISO: string
  phaseOverride: import('./recovery-content').Phase | null
  status: 'active' | 'completed'
  closedEarly: boolean
  endISO: string | null
}
// Which tendons are logged done for the viewed date: tendon_key -> true.
export type RecoveryLogMap = Record<string, boolean>

// Attendance grid (Session view). Columns are the Mon/Tue/Thu/Fri slots; each
// cell's status is derived from the schedule + what was logged.
export type AttStatus = 'done' | 'deload' | 'missed' | 'holiday' | 'upcoming' | null
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
  row: string // week label beyond the 3 cycles, e.g. "W13" ("W14" when extended)
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
