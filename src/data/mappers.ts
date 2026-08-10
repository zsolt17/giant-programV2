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
  RecoveryProtocol,
  RecoveryLogMap,
  GiantAccessoryReps,
  Giant2DifficultyConfig,
  HypertrophyLog,
  HypertrophyLogDraft,
  OlyLog,
  OlyLogDraft,
} from '../engine/types'
import type { Joint, Phase } from '../engine/recovery-content'
import type { Movement, MovementSeed, LoadType, CountType } from '../engine/movements'
import type { ProgramVersion, ProgramSlot } from '../engine/program'
import { expandDayTops } from '../engine/loading'
import { GB_DEFAULT_REPS, GIANT2_GIANT_DEFAULT_ROTATION } from '../engine/constants'

const blankToNull = (v: string | null | undefined): string | null => (v === '' || v === undefined ? null : v)
const toNum = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : Number(v))

// ---- DB row shapes (snake_case) -------------------------------------------
export interface MacroRow {
  id: string
  number: number
  start_date: string
  weeks: number
  status: MacroStatus
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
  volume_difficulty: string | null
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

// ---- macro -----------------------------------------------------------------
export function rowToMacro(r: MacroRow): Macro {
  return {
    id: r.id,
    number: r.number,
    startISO: r.start_date,
    weeks: r.weeks,
    status: r.status,
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
    volumeDifficulty: r.volume_difficulty as Difficulty | null,
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
    volume_difficulty: blankToNull(s.volumeDifficulty),
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

// ---- movement library (user-scoped) ----------------------------------------
export interface MovementRow {
  id?: string
  key: string
  name: string
  load_type: string
  count_type: string
  default_reps: number | null
  rep_unit: string | null
  note: string | null
  archived?: boolean
  superset_group?: string | null
}
export function rowToMovement(r: MovementRow): Movement {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    loadType: r.load_type as LoadType,
    countType: r.count_type as CountType,
    defaultReps: toNum(r.default_reps),
    repUnit: blankToNull(r.rep_unit),
    note: blankToNull(r.note),
    archived: !!r.archived,
    supersetGroup: blankToNull(r.superset_group ?? null),
  }
}
// user_id defaults to auth.uid() at the DB (break_days pattern). The key is the
// identity — set once on create, never rewritten here.
export function movementToRow(m: Movement | MovementSeed): MovementRow {
  return {
    ...('id' in m && m.id ? { id: m.id } : {}),
    key: m.key,
    name: m.name,
    load_type: m.loadType,
    count_type: m.countType,
    default_reps: toNum(m.defaultReps),
    rep_unit: blankToNull(m.repUnit),
    note: blankToNull(m.note),
    archived: 'archived' in m ? !!m.archived : false,
    superset_group: m.supersetGroup ?? null,
  }
}

// ---- program versions + slots (the occupants of code-owned slots) ----------
export interface ProgramVersionRow {
  id?: string
  number: number
  effective_from: string
  note: string | null
}
export function rowToProgramVersion(r: ProgramVersionRow): ProgramVersion {
  return { id: r.id as string, number: r.number, effectiveFrom: r.effective_from, note: blankToNull(r.note) }
}

export interface ProgramSlotRow {
  id?: string
  version_id: string
  slot_key: string
  order_index: number
  movement_id: string | null
  reps: number | null
  rounds: number | null
  optional?: boolean
}
export function rowToProgramSlot(r: ProgramSlotRow): ProgramSlot {
  return {
    id: r.id,
    versionId: r.version_id,
    slotKey: r.slot_key,
    orderIndex: r.order_index,
    movementId: r.movement_id,
    reps: toNum(r.reps),
    rounds: toNum(r.rounds),
    optional: !!r.optional,
  }
}
export function programSlotToRow(s: ProgramSlot): ProgramSlotRow {
  return {
    ...(s.id ? { id: s.id } : {}),
    version_id: s.versionId,
    slot_key: s.slotKey,
    order_index: s.orderIndex,
    movement_id: s.movementId,
    reps: toNum(s.reps),
    rounds: toNum(s.rounds),
    optional: !!s.optional,
  }
}

// ---- Giant Block accessories (rep targets, user-scoped) --------------------
export interface GiantAccessoryRow {
  movement_key: string
  rep_target: number | null
}
// giant_accessory_config rows -> { key: reps } with the app defaults
// (GB_DEFAULT_REPS, constants.ts) merged in; unknown stored keys ignored,
// null rep targets fall back to the movement's default (capacity-config pattern).
export function rowsToGiantAccessory(rows: GiantAccessoryRow[]): GiantAccessoryReps {
  const out: GiantAccessoryReps = { ...GB_DEFAULT_REPS }
  ;(rows || []).forEach((r) => {
    const reps = toNum(r.rep_target)
    if (out[r.movement_key] != null && reps != null) out[r.movement_key] = reps
  })
  return out
}
// { key: reps } -> rows[] (user_id defaults to auth.uid() at the DB).
export function giantAccessoryToRows(byKey: Record<string, number | string | null>): GiantAccessoryRow[] {
  return Object.keys(byKey).map((movement_key) => ({ movement_key, rep_target: toNum(byKey[movement_key]) }))
}

// ---- weekly Giant-difficulty rotation (user-scoped, capacity-config pattern —
// ---- the app default merges under whatever's stored here) ------------------
export interface Giant2DifficultyRow {
  week_in_cycle: number
  lift: string
  difficulty: string
}
export function rowsToGiant2Difficulty(rows: Giant2DifficultyRow[]): Giant2DifficultyConfig {
  const out: Giant2DifficultyConfig = {}
  for (const [week, byLift] of Object.entries(GIANT2_GIANT_DEFAULT_ROTATION)) {
    out[Number(week)] = { ...byLift }
  }
  ;(rows || []).forEach((r) => {
    out[r.week_in_cycle] = out[r.week_in_cycle] || {}
    ;(out[r.week_in_cycle] as Record<string, Difficulty>)[r.lift] = r.difficulty as Difficulty
  })
  return out
}
// { [weekInCycle]: { [lift]: difficulty } } -> rows[] (user_id defaults to
// auth.uid() at the DB, break_days pattern).
export function giant2DifficultyToRows(config: Giant2DifficultyConfig): Giant2DifficultyRow[] {
  const rows: Giant2DifficultyRow[] = []
  Object.entries(config).forEach(([week, byLift]) => {
    Object.entries(byLift || {}).forEach(([lift, difficulty]) => {
      if (difficulty) rows.push({ week_in_cycle: Number(week), lift, difficulty })
    })
  })
  return rows
}

// ---- Capability block logs (C1 Hypertrophy, C2 Oly) ------------------------
export interface HypertrophyLogRow {
  id?: string
  session_id: string
  movement_id: string
  weight: number | null
  reps_done: number | null
  notes: string | null
  updated_at?: string
}
export function rowToHypertrophyLog(r: HypertrophyLogRow): HypertrophyLog {
  return {
    id: r.id,
    sessionId: r.session_id,
    movementId: r.movement_id,
    weight: toNum(r.weight),
    repsDone: toNum(r.reps_done),
    notes: r.notes || '',
    updatedAt: r.updated_at,
  }
}
export function hypertrophyLogToRow(l: HypertrophyLogDraft): HypertrophyLogRow {
  const row: HypertrophyLogRow = {
    session_id: l.sessionId,
    movement_id: l.movementId,
    weight: toNum(l.weight),
    reps_done: toNum(l.repsDone),
    notes: blankToNull(l.notes),
  }
  if (l.id) row.id = l.id
  return row
}

export interface OlyLogRow {
  id?: string
  session_id: string
  movement_id: string
  weight: number | null
  quality: string | null
  notes: string | null
  updated_at?: string
}
export function rowToOlyLog(r: OlyLogRow): OlyLog {
  return {
    id: r.id,
    sessionId: r.session_id,
    movementId: r.movement_id,
    weight: toNum(r.weight),
    quality: r.quality || '',
    notes: r.notes || '',
    updatedAt: r.updated_at,
  }
}
export function olyLogToRow(l: OlyLogDraft): OlyLogRow {
  const row: OlyLogRow = {
    session_id: l.sessionId,
    movement_id: l.movementId,
    weight: toNum(l.weight),
    quality: blankToNull(l.quality),
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
