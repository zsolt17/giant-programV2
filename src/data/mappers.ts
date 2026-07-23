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
  RecoveryProtocol,
  RecoveryLogMap,
  Run,
  RunDraft,
  RunType,
  RunSlotKey,
  RunTargetsByCycle,
  Terrain,
  CapacityVariant,
  CapacityMovementConfig,
  CapacityConfig,
  CapacityLog,
  CapacityLogDraft,
} from '../engine/types'
import type { Joint, Phase } from '../engine/recovery-content'
import { expandDayTops } from '../engine/loading'
import { mergeCapacityConfig } from '../engine/capacity'

const blankToNull = (v: string | null | undefined): string | null => (v === '' || v === undefined ? null : v)
const toNum = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : Number(v))

// ---- DB row shapes (snake_case) -------------------------------------------
export interface MacroRow {
  id: string
  number: number
  start_date: string
  weeks: number
  status: MacroStatus
  ref_pace_s: number | null // Giant Run reference pace P (s/km); null = talk-test mode
  deload_extended: boolean | null // athlete extended the deload by one week (null = no)
}
// Single-anchor model: only the Hard top set is stored. Medium/Light day tops and
// the within-day ladder are computed live (see rowsToWeights / engine/loading.ts).
export interface WorkingWeightRow {
  macro_id: string
  cycle: number
  lift: string
  hard: number | null
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
  cardio_cals: (number | null)[] | null
  block_completion: string | null
  vol_done: boolean | null
  vol_rpe: string | null
  vol_speed: string | null
  pullup_cluster: string | null
  dips_cluster: string | null
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
  return {
    id: r.id,
    number: r.number,
    startISO: r.start_date,
    weeks: r.weeks,
    status: r.status,
    refPaceS: toNum(r.ref_pace_s),
    deloadExtended: !!r.deload_extended,
  }
}

// ---- working weights -------------------------------------------------------
// Expand each stored Hard anchor into the {hard, medium, light} day-top grid the UI
// reads (so Today/Calendar consumers are unchanged). The computed grid is never
// persisted — it's regenerated here on every load, so editing the anchor is
// instantly correct everywhere. A null anchor yields a null grid (prescription
// shows "—" until it's set in Setup).
export function rowsToWeights(rows: WorkingWeightRow[]): WeightsByCycle {
  const out: WeightsByCycle = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    const anchor = toNum(r.hard)
    out[r.cycle][r.lift] = anchor == null ? { hard: null, medium: null, light: null } : expandDayTops(anchor)
  })
  return out
}
// { [lift]: { hard, ... } } for one cycle -> rows[]. Persists ONLY the Hard anchor;
// medium/light are computed, never stored. Accepts the loose Setup-form cell
// (LiftWeightsInput) and the full computed grid (LiftWeights) — both carry `hard`.
export function weightsToRows(macroId: string, cycle: number, byLift: Record<string, LiftWeightsInput>): WorkingWeightRow[] {
  return Object.keys(byLift).map((lift) => ({
    macro_id: macroId,
    cycle: Number(cycle),
    lift,
    hard: toNum(byLift[lift].hard),
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
    cardioCals: rowToCardio(r.cardio_cals),
    blockCompletion: r.block_completion || 'completed', // legacy null → treated as completed
    volDone: r.vol_done ?? true,
    volRpe: r.vol_rpe || '',
    volSpeed: r.vol_speed || '',
    pullupCluster: r.pullup_cluster || '',
    dipsCluster: r.dips_cluster || '',
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
    cardio_cals: cardioToRow(s.cardioCals),
    block_completion: blankToNull(s.blockCompletion),
    vol_done: s.volDone ?? true,
    vol_rpe: blankToNull(s.volRpe),
    vol_speed: blankToNull(s.volSpeed),
    pullup_cluster: blankToNull(s.pullupCluster),
    dips_cluster: blankToNull(s.dipsCluster),
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

// ---- runs (The Giant Run) ---------------------------------------------------
export interface RunRow {
  id: string
  macro_id: string
  date: string
  cycle: number | null
  week: number | null
  week_type: WeekType
  run_type: string
  distance_km: number | null
  duration_s: number | null
  avg_hr: number | null
  completion: string | null
  terrain: string | null
  bulletproof: boolean | null
  notes: string | null
  updated_at?: string
}
export function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    macroId: r.macro_id,
    date: r.date,
    cycle: r.cycle,
    week: r.week,
    weekType: r.week_type,
    runType: r.run_type as RunType,
    distanceKm: toNum(r.distance_km),
    durationS: toNum(r.duration_s),
    avgHr: toNum(r.avg_hr),
    completion: r.completion || 'completed', // legacy null → treated as completed
    terrain: (r.terrain as Terrain) || 'road', // legacy null → road
    bulletproof: !!r.bulletproof, // legacy null → not done
    notes: r.notes || '',
    updatedAt: r.updated_at,
  }
}
export function runToRow(r: RunDraft): RunRow {
  return {
    id: r.id,
    macro_id: r.macroId,
    date: r.date,
    cycle: r.cycle ?? null,
    week: r.week ?? null,
    week_type: r.weekType,
    run_type: r.runType,
    distance_km: toNum(r.distanceKm),
    duration_s: toNum(r.durationS),
    avg_hr: toNum(r.avgHr),
    completion: blankToNull(r.completion),
    terrain: r.terrain || 'road',
    bulletproof: !!r.bulletproof,
    notes: blankToNull(r.notes),
  }
}

// ---- run targets (per-cycle distance guidance, accessory-weights pattern) ---
export interface RunTargetRow {
  macro_id: string
  cycle: number
  run_type: string
  km: number | null
}
export function rowsToRunTargets(rows: RunTargetRow[]): RunTargetsByCycle {
  const out: RunTargetsByCycle = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    out[r.cycle][r.run_type as RunSlotKey] = toNum(r.km)
  })
  return out
}
export function runTargetsToRows(macroId: string, cycle: number, bySlot: Record<string, unknown>): RunTargetRow[] {
  return Object.keys(bySlot).map((run_type) => ({
    macro_id: macroId,
    cycle: Number(cycle),
    run_type,
    km: toNum(bySlot[run_type]),
  }))
}

// ---- GiantFit capacity (config + settings + per-session logs) ---------------
export interface CapacityConfigRow {
  variant: string
  movement_key: string
  rep_target: number | null
  weight: number | null
}
// capacity_config rows + the capacity_settings rounds value -> a full config
// with the app defaults (engine/capacity.ts) merged in.
export function rowsToCapacityConfig(rows: CapacityConfigRow[], rounds?: number | null): CapacityConfig {
  const stored: Partial<Record<CapacityVariant, Record<string, CapacityMovementConfig>>> = {}
  ;(rows || []).forEach((r) => {
    const v = r.variant as CapacityVariant
    ;(stored[v] ||= {})[r.movement_key] = { reps: toNum(r.rep_target), weight: toNum(r.weight) }
  })
  return mergeCapacityConfig(stored, toNum(rounds))
}
// { [movementKey]: {reps, weight} } for one variant -> rows[] (user_id defaults
// to auth.uid() at the DB, like break_days).
export function capacityConfigToRows(
  variant: CapacityVariant,
  byMovement: Record<string, { reps: number | string | null; weight: number | string | null }>
): CapacityConfigRow[] {
  return Object.keys(byMovement).map((movement_key) => ({
    variant,
    movement_key,
    rep_target: toNum(byMovement[movement_key].reps),
    weight: toNum(byMovement[movement_key].weight),
  }))
}

export interface CapacityLogRow {
  id?: string
  session_id: string
  variant: string
  rounds_completed: number | null
  total_time_seconds: number | null
  calories: number | null
  rpe: string | null
  notes: string | null
  updated_at?: string
}
export function rowToCapacityLog(r: CapacityLogRow): CapacityLog {
  return {
    id: r.id,
    sessionId: r.session_id,
    variant: r.variant as CapacityVariant,
    roundsCompleted: toNum(r.rounds_completed),
    totalTimeSeconds: toNum(r.total_time_seconds),
    calories: toNum(r.calories),
    rpe: r.rpe || '',
    notes: r.notes || '',
    updatedAt: r.updated_at,
  }
}
export function capacityLogToRow(l: CapacityLogDraft): CapacityLogRow {
  const row: CapacityLogRow = {
    session_id: l.sessionId,
    variant: l.variant,
    rounds_completed: toNum(l.roundsCompleted),
    total_time_seconds: toNum(l.totalTimeSeconds),
    calories: toNum(l.calories),
    rpe: blankToNull(l.rpe),
    notes: blankToNull(l.notes),
  }
  if (l.id) row.id = l.id
  return row
}

// ---- recovery (protocols + per-tendon daily logs) --------------------------
export interface RecoveryProtocolRow {
  id: string
  joint: string
  start_date: string
  phase_override: string | null
  status: 'active' | 'completed'
  closed_early: boolean | null
  end_date: string | null
}
export function rowToProtocol(r: RecoveryProtocolRow): RecoveryProtocol {
  return {
    id: r.id,
    joint: r.joint as Joint,
    startISO: r.start_date,
    phaseOverride: (r.phase_override as Phase) || null,
    status: r.status,
    closedEarly: !!r.closed_early,
    endISO: r.end_date || null,
  }
}
// Tendon-log rows for one (protocol, date) -> set of done tendon keys.
export function rowsToRecoveryLogs(rows: { tendon_key: string }[]): RecoveryLogMap {
  const o: RecoveryLogMap = {}
  ;(rows || []).forEach((r) => {
    o[r.tendon_key] = true
  })
  return o
}
