// Pure row <-> app-object coercion. NO database calls live here.
// App objects use camelCase; DB rows use snake_case. Unset form selects come
// through as "" — we normalize "" -> NULL on the way to the DB so the columns
// stay clean (the schema deliberately has no CHECK on those loose text fields).
import type {
  Macro,
  MacroStatus,
  Session,
  WeekType,
  Lift,
  Difficulty,
  SessionDraft,
  WeightsByCycle,
  LiftWeightsInput,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  TestingResult,
} from '../engine/types'

const blankToNull = (v: string | null | undefined): string | null => (v === '' || v === undefined ? null : v)
const toNum = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : Number(v))

// ---- DB row shapes (snake_case) -------------------------------------------
export interface MacroRow {
  id: string
  number: number
  start_date: string
  weeks: number
  status: MacroStatus
}
export interface WorkingWeightRow {
  macro_id: string
  cycle: number
  lift: string
  hard: number | null
  medium: number | null
  light: number | null
}
export interface AccessoryRow {
  macro_id: string
  cycle: number
  item: string
  weight: number | null
}
export interface SessionRow {
  id: string
  macro_id: string
  date: string
  cycle: number | null
  week: number | null
  week_type: WeekType
  day_type: string | null
  difficulty: string | null
  top_reps: number | null
  top_weight: number | null
  rpe: string | null
  bar_speed: string | null
  clean_load: number | null
  clean_rounds: number | null
  clean_speed: string | null
  cardio_cals: (number | null)[] | null
  vol_done: boolean | null
  vol_rpe: string | null
  vol_speed: string | null
  pullup_cluster: string | null
  carry_skipped: boolean | null
  carry_skip_reason: string | null
  carry_rounds: number | null
  carry_distance: number | null
  carry_rpe: string | null
  notes: string | null
  started_at: string | null
  ended_at: string | null
  updated_at?: string
}
export interface TestingRow {
  id?: string
  macro_id: string
  lift: string
  weight: number | null
  reps: number | null
  notes: string | null
  tested_on: string | null
}

// ---- macro -----------------------------------------------------------------
export function rowToMacro(r: MacroRow): Macro {
  return { id: r.id, number: r.number, startISO: r.start_date, weeks: r.weeks, status: r.status }
}

// ---- working weights -------------------------------------------------------
export function rowsToWeights(rows: WorkingWeightRow[]): WeightsByCycle {
  const out: WeightsByCycle = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    out[r.cycle][r.lift] = { hard: toNum(r.hard), medium: toNum(r.medium), light: toNum(r.light) }
  })
  return out
}
// { [lift]: { hard, medium, light } } for one cycle -> rows[]. Accepts the loose
// Setup-form cell (LiftWeightsInput); toNum coerces the string inputs.
export function weightsToRows(macroId: string, cycle: number, byLift: Record<string, LiftWeightsInput>): WorkingWeightRow[] {
  return Object.keys(byLift).map((lift) => ({
    macro_id: macroId,
    cycle: Number(cycle),
    lift,
    hard: toNum(byLift[lift].hard),
    medium: toNum(byLift[lift].medium),
    light: toNum(byLift[lift].light),
  }))
}

// ---- accessory weights -----------------------------------------------------
export function rowsToAccessory(rows: AccessoryRow[]): AccessoryByCycle {
  const out: AccessoryByCycle = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    out[r.cycle][r.item] = toNum(r.weight)
  })
  return out
}
export function accessoryToRows(macroId: string, cycle: number, byItem: Record<string, unknown>): AccessoryRow[] {
  return Object.keys(byItem).map((item) => ({
    macro_id: macroId,
    cycle: Number(cycle),
    item,
    weight: toNum(byItem[item]),
  }))
}

// Per-round cardio cals <-> a fixed 4-cell array. DB stores int[] (or NULL when
// no round was logged); the UI always works with exactly 4 ordered cells.
const CARDIO_ROUNDS = 4
function rowToCardio(v: (number | null)[] | null | undefined): (number | null)[] {
  const a = Array.isArray(v) ? v : []
  return Array.from({ length: CARDIO_ROUNDS }, (_, i) => (a[i] == null ? null : Number(a[i])))
}
function cardioToRow(v: (number | string | null)[] | null | undefined): (number | null)[] | null {
  if (!Array.isArray(v)) return null
  const nums = Array.from({ length: CARDIO_ROUNDS }, (_, i) => toNum(v[i]))
  return nums.some((n) => n != null) ? nums : null // all-blank -> NULL column
}

// ---- session ---------------------------------------------------------------
export function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    macroId: r.macro_id,
    date: r.date,
    cycle: r.cycle,
    week: r.week,
    weekType: r.week_type,
    dayType: r.day_type as Lift | null,
    difficulty: r.difficulty as Difficulty | null,
    topReps: r.top_reps,
    topWeight: toNum(r.top_weight),
    rpe: r.rpe || '',
    barSpeed: r.bar_speed || '',
    cleanLoad: toNum(r.clean_load),
    cleanRounds: r.clean_rounds ?? null,
    cleanSpeed: r.clean_speed || '',
    cardioCals: rowToCardio(r.cardio_cals),
    volDone: r.vol_done ?? true,
    volRpe: r.vol_rpe || '',
    volSpeed: r.vol_speed || '',
    pullupCluster: r.pullup_cluster || '',
    carrySkipped: !!r.carry_skipped,
    carrySkipReason: r.carry_skip_reason || '',
    carryRounds: r.carry_rounds ?? null,
    carryDistance: toNum(r.carry_distance),
    carryRpe: r.carry_rpe || '',
    notes: r.notes || '',
    startedAt: r.started_at || null,
    endedAt: r.ended_at || null,
    updatedAt: r.updated_at,
  }
}
export function sessionToRow(s: SessionDraft): SessionRow {
  return {
    id: s.id,
    macro_id: s.macroId,
    date: s.date,
    cycle: s.cycle ?? null,
    week: s.week ?? null,
    week_type: s.weekType,
    day_type: blankToNull(s.dayType),
    difficulty: blankToNull(s.difficulty),
    top_reps: s.topReps ?? null,
    top_weight: toNum(s.topWeight),
    rpe: blankToNull(s.rpe),
    bar_speed: blankToNull(s.barSpeed),
    clean_load: toNum(s.cleanLoad),
    clean_rounds: toNum(s.cleanRounds),
    clean_speed: blankToNull(s.cleanSpeed),
    cardio_cals: cardioToRow(s.cardioCals),
    vol_done: s.volDone ?? true,
    vol_rpe: blankToNull(s.volRpe),
    vol_speed: blankToNull(s.volSpeed),
    pullup_cluster: blankToNull(s.pullupCluster),
    carry_skipped: !!s.carrySkipped,
    carry_skip_reason: blankToNull(s.carrySkipReason),
    carry_rounds: toNum(s.carryRounds),
    carry_distance: toNum(s.carryDistance),
    carry_rpe: blankToNull(s.carryRpe),
    notes: blankToNull(s.notes),
    started_at: s.startedAt ?? null,
    ended_at: s.endedAt ?? null,
  }
}

// ---- deloads / break days --------------------------------------------------
export function rowsToDeloads(rows: { week_key: string }[]): DeloadMap {
  const o: DeloadMap = {}
  ;(rows || []).forEach((r) => {
    o[r.week_key] = true
  })
  return o
}
export function rowsToBreakDays(rows: { date: string }[]): BreakDayMap {
  const o: BreakDayMap = {}
  ;(rows || []).forEach((r) => {
    o[r.date] = true
  })
  return o
}

// ---- testing results -------------------------------------------------------
export function rowToTesting(r: TestingRow): TestingResult {
  return {
    id: r.id,
    macroId: r.macro_id,
    lift: r.lift,
    weight: toNum(r.weight),
    reps: r.reps,
    notes: r.notes || '',
    testedOn: r.tested_on,
  }
}
export function testingToRow(t: TestingResult): TestingRow {
  const row: TestingRow = {
    macro_id: t.macroId,
    lift: t.lift,
    weight: toNum(t.weight),
    reps: t.reps ?? null,
    notes: blankToNull(t.notes),
    tested_on: t.testedOn || null,
  }
  if (t.id) row.id = t.id
  return row
}
