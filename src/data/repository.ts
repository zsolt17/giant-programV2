// The ONLY module (besides supabase.ts) that talks to the database. Everything
// above this works with plain app objects, so swapping the backend is a
// single-file change. All functions throw on error; callers handle it.
import { supabase, assertWritable, DEV_WRITES_BLOCKED } from './supabase'
import * as M from './mappers'
import * as queue from './offline-queue'
import type { QueueExecutors } from './offline-queue'
import type {
  Macro,
  MacroStatus,
  Session,
  SessionDraft,
  WeightsByCycle,
  LiftWeightsInput,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  TestingResult,
  MacroBundle,
  TrendsData,
  RecoveryProtocol,
  RecoveryLogMap,
  Run,
  RunDraft,
  RunTargetsByCycle,
  CapacityVariant,
  CapacityConfig,
  CapacityLog,
  CapacityLogDraft,
  GiantAccessoryReps,
  Giant2DifficultyConfig,
  HypertrophyLog,
  HypertrophyLogDraft,
  OlyLog,
  OlyLogDraft,
  Lift,
} from '../engine/types'
import type { Joint, Phase } from '../engine/recovery-content'
import type { Movement } from '../engine/movements'
import {
  SEED_MOVEMENTS,
  SEED_CAPACITY_KEYS,
  SEED_ACTIVATION_KEYS,
  SEED_BULLETPROOF_KEYS,
  SEED_BULLETPROOF_OPTIONAL,
  SEED_GIANT2_PRIMER_KEYS,
  SEED_GIANT2_HYPERTROPHY_KEYS,
  SEED_GIANT2_OLY_KEYS,
} from '../engine/movements'
import type { ProgramVersion, ProgramSlot } from '../engine/program'
import { buildSeedSlots, buildGiant2SeedSlots, SEED_CARRY_KEYS } from '../engine/program'
import { CAPACITY_VARIANTS } from '../engine/capacity'
import {
  ANCHOR_LIFTS,
  GIANTFIT_ACC_ITEMS,
  GIANTFIT_START_DATE,
  GIANTFIT_GB_ACCESSORY,
  GIANT2_START_DATE,
  GIANT2_GB_ACCESSORY,
} from '../engine/constants'

// Browser-only offline handling (Node smoke test has no navigator/window).
const isBrowser = typeof navigator !== 'undefined' && typeof window !== 'undefined'
const isOffline = (): boolean => isBrowser && navigator.onLine === false
function isNetworkError(e: unknown): boolean {
  if (isOffline()) return true
  const err = e as { message?: string; name?: string }
  const m = String(err?.message || e).toLowerCase()
  return err?.name === 'TypeError' || m.includes('fetch') || m.includes('network') || m.includes('timeout')
}

// ---- macros ----------------------------------------------------------------
export async function getMacros(): Promise<Macro[]> {
  const { data, error } = await supabase.from('macros').select('*').order('number', { ascending: true })
  if (error) throw error
  return (data || []).map(M.rowToMacro)
}

export async function getMacroByNumber(number: number): Promise<Macro | null> {
  const { data, error } = await supabase.from('macros').select('*').eq('number', number).maybeSingle()
  if (error) throw error
  return data ? M.rowToMacro(data) : null
}

export async function getActiveMacro(): Promise<Macro | null> {
  const { data, error } = await supabase
    .from('macros')
    .select('*')
    .eq('status', 'active')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? M.rowToMacro(data) : null
}

export async function createMacro({
  number,
  startISO,
  weeks = 13, // 12 training + 1 deload (extendable); legacy 15-week macros predate 0013
  status = 'active',
}: {
  number: number
  startISO: string
  weeks?: number
  status?: MacroStatus
}): Promise<Macro> {
  assertWritable()
  const { data, error } = await supabase
    .from('macros')
    .insert({ number, start_date: startISO, weeks, status })
    .select()
    .single()
  if (error) throw error
  return M.rowToMacro(data)
}

export async function setMacroStatus(id: string, status: MacroStatus): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('macros').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateMacro(
  id: string,
  {
    number,
    startISO,
    weeks,
    status,
    refPaceS,
    deloadExtended,
  }: { number?: number; startISO?: string; weeks?: number; status?: MacroStatus; refPaceS?: number | null; deloadExtended?: boolean } = {}
): Promise<Macro> {
  assertWritable()
  const patch: Record<string, unknown> = {}
  if (number !== undefined) patch.number = number
  if (startISO !== undefined) patch.start_date = startISO
  if (weeks !== undefined) patch.weeks = weeks
  if (status !== undefined) patch.status = status
  if (refPaceS !== undefined) patch.ref_pace_s = refPaceS
  if (deloadExtended !== undefined) patch.deload_extended = deloadExtended
  const { data, error } = await supabase.from('macros').update(patch).eq('id', id).select().single()
  if (error) throw error
  return M.rowToMacro(data)
}

// Giant Run reference pace P (s/km; null = talk-test mode) — the TT confirm flow
// and Setup both land here. Stored exactly as given (never rounded).
export async function setMacroRefPace(id: string, refPaceS: number | null): Promise<Macro> {
  return updateMacro(id, { refPaceS })
}

// ---- working weights (per-cycle H/M/L) ------------------------------------
export async function getWorkingWeights(macroId: string): Promise<WeightsByCycle> {
  const { data, error } = await supabase.from('working_weights').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToWeights(data || [])
}

// byLift = { deadlift: {hard,medium,light}, ... } for a single cycle.
export async function saveWorkingWeights(macroId: string, cycle: number, byLift: Record<string, LiftWeightsInput>): Promise<void> {
  assertWritable()
  const rows = M.weightsToRows(macroId, cycle, byLift)
  const { error } = await supabase.from('working_weights').upsert(rows, { onConflict: 'macro_id,cycle,lift' })
  if (error) throw error
}

// ---- accessory weights (per-cycle single values) --------------------------
export async function getAccessoryWeights(macroId: string): Promise<AccessoryByCycle> {
  const { data, error } = await supabase.from('accessory_weights').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToAccessory(data || [])
}

// byItem = { clean: 70, carry_deadlift: 60, ... } for a single cycle.
export async function saveAccessoryWeights(macroId: string, cycle: number, byItem: Record<string, unknown>): Promise<void> {
  assertWritable()
  const rows = M.accessoryToRows(macroId, cycle, byItem)
  const { error } = await supabase.from('accessory_weights').upsert(rows, { onConflict: 'macro_id,cycle,item' })
  if (error) throw error
}

// ---- sessions --------------------------------------------------------------
export async function getSessions(macroId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('macro_id', macroId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(M.rowToSession)
}

// All sessions across every macro (RLS-scoped — an unfiltered select returns only
// the user's rows), newest first. Powers the Data page (CSV export + session picker).
export async function getAllSessions(): Promise<Session[]> {
  const { data, error } = await supabase.from('sessions').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(M.rowToSession)
}

// Idempotent: upsert on the human-readable id (date-lift-difficulty).
// Offline (or on a network failure), the write is queued and the call resolves
// optimistically so the UI updates; it replays on reconnect via flushQueue().
export async function saveSession(session: SessionDraft): Promise<Session> {
  assertWritable()
  const row = M.sessionToRow(session)
  if (isOffline()) {
    queue.enqueue({ kind: 'saveSession', payload: row })
    return M.rowToSession(row)
  }
  try {
    const { data, error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' }).select().single()
    if (error) throw error
    return M.rowToSession(data)
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'saveSession', payload: row })
      return M.rowToSession(row)
    }
    throw e
  }
}

export async function deleteSession(id: string): Promise<void> {
  assertWritable()
  if (isOffline()) {
    queue.enqueue({ kind: 'deleteSession', payload: { id } })
    return
  }
  try {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'deleteSession', payload: { id } })
      return
    }
    throw e
  }
}

// ---- runs (The Giant Run) ---------------------------------------------------
export async function getRuns(macroId: string): Promise<Run[]> {
  const { data, error } = await supabase.from('runs').select('*').eq('macro_id', macroId).order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(M.rowToRun)
}

// All runs across every macro (RLS-scoped), newest first — Data page + Trends.
export async function getAllRuns(): Promise<Run[]> {
  const { data, error } = await supabase.from('runs').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data || []).map(M.rowToRun)
}

// Idempotent (upsert on the human-readable id) and offline-queued, exactly like
// saveSession: offline or on a network failure the write is queued and resolves
// optimistically; flushQueue() replays it on reconnect.
export async function saveRun(run: RunDraft): Promise<Run> {
  assertWritable()
  const row = M.runToRow(run)
  if (isOffline()) {
    queue.enqueue({ kind: 'saveRun', payload: row })
    return M.rowToRun(row)
  }
  try {
    const { data, error } = await supabase.from('runs').upsert(row, { onConflict: 'id' }).select().single()
    if (error) throw error
    return M.rowToRun(data)
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'saveRun', payload: row })
      return M.rowToRun(row)
    }
    throw e
  }
}

export async function deleteRun(id: string): Promise<void> {
  assertWritable()
  if (isOffline()) {
    queue.enqueue({ kind: 'deleteRun', payload: { id } })
    return
  }
  try {
    const { error } = await supabase.from('runs').delete().eq('id', id)
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'deleteRun', payload: { id } })
      return
    }
    throw e
  }
}

// ---- run targets (per-cycle distance guidance) ------------------------------
export async function getRunTargets(macroId: string): Promise<RunTargetsByCycle> {
  const { data, error } = await supabase.from('run_targets').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToRunTargets(data || [])
}

// bySlot = { easy: 3, quality: 3, long: 5 } for a single cycle.
export async function saveRunTargets(macroId: string, cycle: number, bySlot: Record<string, unknown>): Promise<void> {
  assertWritable()
  const rows = M.runTargetsToRows(macroId, cycle, bySlot)
  const { error } = await supabase.from('run_targets').upsert(rows, { onConflict: 'macro_id,cycle,run_type' })
  if (error) throw error
}

// ---- GiantFit capacity config (user-scoped, like break_days) ----------------
// Reads both capacity_config (per-movement rep/weight overrides) and
// capacity_settings (rounds), returning a full config with app defaults merged.
export async function getCapacityConfig(): Promise<CapacityConfig> {
  const [cfg, settings] = await Promise.all([
    supabase.from('capacity_config').select('*'),
    supabase.from('capacity_settings').select('rounds').maybeSingle(),
  ])
  if (cfg.error) throw cfg.error
  if (settings.error) throw settings.error
  return M.rowsToCapacityConfig(cfg.data || [], settings.data?.rounds)
}

// byMovement = { db_snatch: {reps: 4, weight: 17.5}, ... } for one variant.
export async function saveCapacityConfig(
  variant: CapacityVariant,
  byMovement: Record<string, { reps: number | string | null; weight: number | string | null }>
): Promise<void> {
  assertWritable()
  const rows = M.capacityConfigToRows(variant, byMovement)
  const { error } = await supabase.from('capacity_config').upsert(rows, { onConflict: 'user_id,variant,movement_key' })
  if (error) throw error
}

export async function setCapacityRounds(rounds: number): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('capacity_settings').upsert({ rounds }, { onConflict: 'user_id' })
  if (error) throw error
}

// ---- movement library (USER-scoped, not macro-scoped: loaded alongside
// ---- getBreakDays, never inside loadMacroBundle) ----------------------------
export async function listMovements(): Promise<Movement[]> {
  const { data, error } = await supabase.from('movements').select('*').order('name')
  if (error) throw error
  return (data || []).map(M.rowToMovement)
}

// Insert (no id) or update (id) one movement. The `key` is the stable identity —
// callers set it once at create time and never change it after.
export async function saveMovement(m: Movement): Promise<Movement> {
  assertWritable()
  const row = M.movementToRow(m)
  const { data, error } = await supabase.from('movements').upsert(row).select().single()
  if (error) throw error
  return M.rowToMovement(data)
}

// Archive, never delete — a slot that referenced this movement must keep
// resolving (deprecate-never-delete).
export async function archiveMovement(id: string, archived = true): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('movements').update({ archived }).eq('id', id)
  if (error) throw error
}

// Seed the library for a user who has none. Idempotent and safe to call every
// boot: it only writes when the user's library is EMPTY, so an athlete who has
// since renamed or archived movements is never overwritten. This is how a second
// account bootstraps itself with no migration and no code change.
export async function ensureSeedMovements(): Promise<Movement[]> {
  const existing = await listMovements()
  if (existing.length) return existing
  assertWritable()
  const rows = SEED_MOVEMENTS.map((m) => M.movementToRow(m))
  const { data, error } = await supabase.from('movements').insert(rows).select()
  if (error) throw error
  return (data || []).map(M.rowToMovement)
}

// Insert any code-side SEED_MOVEMENTS entries the user doesn't have yet, by
// key — unlike ensureSeedMovements (which only fires for a completely EMPTY
// library), this reaches an athlete who already had a movement library before
// new content was added (e.g. Giant 2.0's Hypertrophy/Oly/Primer movements,
// 2026-08-09 — an existing GiantFit user's library predates them). Safe to
// call every boot: existing rows (renamed, archived, whatever) are never
// touched, only missing keys are inserted.
export async function syncSeedMovements(): Promise<Movement[]> {
  const existing = await listMovements()
  const existingKeys = new Set(existing.map((m) => m.key))
  const missing = SEED_MOVEMENTS.filter((m) => !existingKeys.has(m.key))
  if (!missing.length) return existing
  assertWritable()
  const rows = missing.map((m) => M.movementToRow(m))
  const { data, error } = await supabase.from('movements').insert(rows).select()
  if (error) throw error
  return [...existing, ...(data || []).map(M.rowToMovement)]
}

// ---- program versions + slots (user-scoped; nothing reads these for
// ---- prescription yet — the data path is proven against the constants first)
export async function listProgramVersions(): Promise<ProgramVersion[]> {
  const { data, error } = await supabase.from('program_versions').select('*').order('effective_from')
  if (error) throw error
  return (data || []).map(M.rowToProgramVersion)
}

export async function listProgramSlots(): Promise<ProgramSlot[]> {
  const { data, error } = await supabase.from('program_slots').select('*').order('order_index')
  if (error) throw error
  return (data || []).map(M.rowToProgramSlot)
}

// Seed version 1 for a user who has none: effective from the GiantFit cutover,
// with today's hardcoded occupants — but the athlete's OWN numbers wherever
// they've set them (capacity_config / capacity_settings / giant_accessory_config),
// so their current program survives verbatim. Those three tables stay in place
// and keep being written; they're absorbed only after the switchover is proven.
// Idempotent: only writes when the user has no versions.
export async function ensureSeedProgramVersion(): Promise<{ versions: ProgramVersion[]; slots: ProgramSlot[] }> {
  const existing = await listProgramVersions()
  if (existing.length) return { versions: existing, slots: await listProgramSlots() }

  assertWritable()
  const [movements, capacity, gbAccessory] = await Promise.all([ensureSeedMovements(), getCapacityConfig(), getGiantAccessoryConfig()])

  const { data: vRow, error: vErr } = await supabase
    .from('program_versions')
    .insert({ number: 1, effective_from: GIANTFIT_START_DATE, note: 'Seeded from the built-in GiantFit program' })
    .select()
    .single()
  if (vErr) throw vErr
  const version = M.rowToProgramVersion(vRow)

  // The athlete's per-movement capacity reps, keyed the way the seed expects.
  const capacityReps: Partial<Record<CapacityVariant, Record<string, number | null>>> = {}
  for (const v of CAPACITY_VARIANTS) {
    capacityReps[v] = Object.fromEntries(Object.entries(capacity.movements[v] || {}).map(([k, cfg]) => [k, cfg.reps ?? null]))
  }
  const gbAccessoryKeys = Object.fromEntries(
    Object.entries(GIANTFIT_GB_ACCESSORY).map(([day, m]) => [day, m.key])
  ) as Partial<Record<Lift, string>>

  const slots = buildSeedSlots(version.id, movements, {
    gbAccessoryReps: gbAccessory,
    gbAccessoryKeys,
    capacityReps,
    capacityRounds: capacity.rounds,
    capacityKeys: SEED_CAPACITY_KEYS,
    activationKeys: SEED_ACTIVATION_KEYS,
    bulletproofKeys: SEED_BULLETPROOF_KEYS,
    optionalKeys: SEED_BULLETPROOF_OPTIONAL,
  })

  const { error: sErr } = await supabase.from('program_slots').insert(slots.map(M.programSlotToRow))
  if (sErr) throw sErr
  return { versions: [version], slots: await listProgramSlots() }
}

// Seed version 2 for a user who has none yet: Giant 2.0, effective from
// GIANT2_START_DATE. versionForDate picks the greatest effective_from <= the
// target date, so once this exists, Giant2-era dates resolve here and
// GiantFit-era dates keep resolving to version 1 — no other change needed to
// make the two eras coexist in history. Idempotent: only writes when the user
// has exactly the version-1 seed (or none) — never runs twice.
export async function ensureSeedGiant2ProgramVersion(): Promise<{ versions: ProgramVersion[]; slots: ProgramSlot[] }> {
  const existing = await listProgramVersions()
  if (existing.some((v) => v.number === 2)) return { versions: existing, slots: await listProgramSlots() }

  assertWritable()
  const movements = await syncSeedMovements()

  const { data: vRow, error: vErr } = await supabase
    .from('program_versions')
    .insert({ number: 2, effective_from: GIANT2_START_DATE, note: 'Giant 2.0 — replaces GiantFit' })
    .select()
    .single()
  if (vErr) throw vErr
  const version = M.rowToProgramVersion(vRow)

  const giant2GbAccessoryKeys = Object.fromEntries(Object.entries(GIANT2_GB_ACCESSORY).map(([day, m]) => [day, m.key])) as Partial<Record<Lift, string>>
  const slots = buildGiant2SeedSlots(version.id, movements, {
    gbAccessoryKeys: giant2GbAccessoryKeys,
    primerKeys: SEED_GIANT2_PRIMER_KEYS,
    hypertrophyKeys: SEED_GIANT2_HYPERTROPHY_KEYS,
    olyKeys: SEED_GIANT2_OLY_KEYS,
    carryKeys: SEED_CARRY_KEYS,
  })

  const { error: sErr } = await supabase.from('program_slots').insert(slots.map(M.programSlotToRow))
  if (sErr) throw sErr
  return { versions: await listProgramVersions(), slots: await listProgramSlots() }
}

// ---- Giant Block accessory rep targets (user-scoped, capacity-config pattern)
export async function getGiantAccessoryConfig(): Promise<GiantAccessoryReps> {
  const { data, error } = await supabase.from('giant_accessory_config').select('*')
  if (error) throw error
  return M.rowsToGiantAccessory(data || [])
}

// byKey = { ab_rollout: 10, toes_to_bar: 12, ... }
export async function saveGiantAccessoryConfig(byKey: Record<string, number | string | null>): Promise<void> {
  assertWritable()
  const rows = M.giantAccessoryToRows(byKey)
  const { error } = await supabase.from('giant_accessory_config').upsert(rows, { onConflict: 'user_id,movement_key' })
  if (error) throw error
}

// ---- Giant 2.0 weekly Giant-difficulty rotation (user-scoped, capacity-config pattern)
export async function getGiant2DifficultyConfig(): Promise<Giant2DifficultyConfig> {
  const { data, error } = await supabase.from('giant2_giant_difficulty').select('*')
  if (error) throw error
  return M.rowsToGiant2Difficulty(data || [])
}

// config = { 1: { squat: 'hard', ... }, 2: { ... }, 3: { ... } } (week_in_cycle -> lift -> difficulty)
export async function saveGiant2DifficultyConfig(config: Giant2DifficultyConfig): Promise<void> {
  assertWritable()
  const rows = M.giant2DifficultyToRows(config)
  const { error } = await supabase.from('giant2_giant_difficulty').upsert(rows, { onConflict: 'user_id,week_in_cycle,lift' })
  if (error) throw error
}

// ---- capacity logs (one per session) ----------------------------------------
export async function getCapacityLog(sessionId: string): Promise<CapacityLog | null> {
  const { data, error } = await supabase.from('capacity_logs').select('*').eq('session_id', sessionId).maybeSingle()
  if (error) throw error
  return data ? M.rowToCapacityLog(data) : null
}

// All capacity logs for one macro's sessions (inner-join on sessions.macro_id) —
// part of the boot bundle so the session views can show/backfill existing logs.
export async function getCapacityLogs(macroId: string): Promise<CapacityLog[]> {
  const { data, error } = await supabase
    .from('capacity_logs')
    .select('*, sessions!inner(macro_id)')
    .eq('sessions.macro_id', macroId)
  if (error) throw error
  return (data || []).map(M.rowToCapacityLog)
}

// Idempotent (upsert on session_id — one capacity result per session) and
// offline-queued like saveSession/saveRun. The queue dedupe key is prefixed so
// capacity ops can't collide with the session ops sharing the session id.
export async function saveCapacityLog(log: CapacityLogDraft): Promise<CapacityLog> {
  assertWritable()
  const row = M.capacityLogToRow(log)
  if (isOffline()) {
    queue.enqueue({ kind: 'saveCapacityLog', payload: { id: `cap-${row.session_id}`, row } })
    return M.rowToCapacityLog(row)
  }
  try {
    const { data, error } = await supabase.from('capacity_logs').upsert(row, { onConflict: 'session_id' }).select().single()
    if (error) throw error
    return M.rowToCapacityLog(data)
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'saveCapacityLog', payload: { id: `cap-${row.session_id}`, row } })
      return M.rowToCapacityLog(row)
    }
    throw e
  }
}

export async function deleteCapacityLog(sessionId: string): Promise<void> {
  assertWritable()
  if (isOffline()) {
    queue.enqueue({ kind: 'deleteCapacityLog', payload: { id: `cap-${sessionId}`, sessionId } })
    return
  }
  try {
    const { error } = await supabase.from('capacity_logs').delete().eq('session_id', sessionId)
    if (error) throw error
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'deleteCapacityLog', payload: { id: `cap-${sessionId}`, sessionId } })
      return
    }
    throw e
  }
}

// ---- Giant 2.0 Capability block logs (C1 Hypertrophy, C2 Oly) ---------------
// One row per (session, movement) — the dedupe key is composite, unlike
// capacity_logs' session-only key. No delete: a blanked weight/reps/quality
// on the next save is how an entry is cleared (matches the trim already made
// for the Volume block's bodyweight pull-ups — no separate delete UI either).
export async function getHypertrophyLogs(macroId: string): Promise<HypertrophyLog[]> {
  const { data, error } = await supabase
    .from('hypertrophy_logs')
    .select('*, sessions!inner(macro_id)')
    .eq('sessions.macro_id', macroId)
  if (error) throw error
  return (data || []).map(M.rowToHypertrophyLog)
}

export async function saveHypertrophyLog(log: HypertrophyLogDraft): Promise<HypertrophyLog> {
  assertWritable()
  const row = M.hypertrophyLogToRow(log)
  const dedupeId = `hyp-${row.session_id}-${row.movement_id}`
  if (isOffline()) {
    queue.enqueue({ kind: 'saveHypertrophyLog', payload: { id: dedupeId, row } })
    return M.rowToHypertrophyLog(row)
  }
  try {
    const { data, error } = await supabase.from('hypertrophy_logs').upsert(row, { onConflict: 'session_id,movement_id' }).select().single()
    if (error) throw error
    return M.rowToHypertrophyLog(data)
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'saveHypertrophyLog', payload: { id: dedupeId, row } })
      return M.rowToHypertrophyLog(row)
    }
    throw e
  }
}

export async function getOlyLogs(macroId: string): Promise<OlyLog[]> {
  const { data, error } = await supabase
    .from('oly_logs')
    .select('*, sessions!inner(macro_id)')
    .eq('sessions.macro_id', macroId)
  if (error) throw error
  return (data || []).map(M.rowToOlyLog)
}

export async function saveOlyLog(log: OlyLogDraft): Promise<OlyLog> {
  assertWritable()
  const row = M.olyLogToRow(log)
  const dedupeId = `oly-${row.session_id}-${row.movement_id}`
  if (isOffline()) {
    queue.enqueue({ kind: 'saveOlyLog', payload: { id: dedupeId, row } })
    return M.rowToOlyLog(row)
  }
  try {
    const { data, error } = await supabase.from('oly_logs').upsert(row, { onConflict: 'session_id,movement_id' }).select().single()
    if (error) throw error
    return M.rowToOlyLog(data)
  } catch (e) {
    if (isNetworkError(e)) {
      queue.enqueue({ kind: 'saveOlyLog', payload: { id: dedupeId, row } })
      return M.rowToOlyLog(row)
    }
    throw e
  }
}

// Replay queued offline writes. Call on reconnect and at startup.
const QUEUE_EXECUTORS: QueueExecutors = {
  async saveSession(row) {
    const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' })
    if (error) throw error
  },
  async deleteSession({ id }) {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) throw error
  },
  async saveRun(row) {
    const { error } = await supabase.from('runs').upsert(row, { onConflict: 'id' })
    if (error) throw error
  },
  async deleteRun({ id }) {
    const { error } = await supabase.from('runs').delete().eq('id', id)
    if (error) throw error
  },
  async saveCapacityLog({ row }) {
    const { error } = await supabase.from('capacity_logs').upsert(row, { onConflict: 'session_id' })
    if (error) throw error
  },
  async deleteCapacityLog({ sessionId }) {
    const { error } = await supabase.from('capacity_logs').delete().eq('session_id', sessionId)
    if (error) throw error
  },
  async saveHypertrophyLog({ row }) {
    const { error } = await supabase.from('hypertrophy_logs').upsert(row, { onConflict: 'session_id,movement_id' })
    if (error) throw error
  },
  async saveOlyLog({ row }) {
    const { error } = await supabase.from('oly_logs').upsert(row, { onConflict: 'session_id,movement_id' })
    if (error) throw error
  },
}
export function flushQueue(): Promise<number> {
  if (DEV_WRITES_BLOCKED) return Promise.resolve(0) // never replay queued writes to prod from the dev server
  return queue.flush(QUEUE_EXECUTORS)
}
export { pendingCount, onPendingChange } from './offline-queue'

// ---- deloads ---------------------------------------------------------------
export async function getDeloads(macroId: string): Promise<DeloadMap> {
  const { data, error } = await supabase.from('deloads').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToDeloads(data || [])
}

export async function setDeload(macroId: string, weekKey: string, on: boolean): Promise<void> {
  assertWritable()
  if (on) {
    const { error } = await supabase
      .from('deloads')
      .upsert({ macro_id: macroId, week_key: weekKey }, { onConflict: 'macro_id,week_key' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('deloads').delete().eq('macro_id', macroId).eq('week_key', weekKey)
    if (error) throw error
  }
}

// ---- break days (user-scoped, not macro-scoped) ---------------------------
export async function getBreakDays(): Promise<BreakDayMap> {
  const { data, error } = await supabase.from('break_days').select('*')
  if (error) throw error
  return M.rowsToBreakDays(data || [])
}

export async function setBreakDay(dateISO: string, on: boolean): Promise<void> {
  assertWritable()
  if (on) {
    const { error } = await supabase.from('break_days').upsert({ date: dateISO }, { onConflict: 'user_id,date' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('break_days').delete().eq('date', dateISO)
    if (error) throw error
  }
}

// ---- testing results -------------------------------------------------------
export async function getTestingResults(macroId: string): Promise<TestingResult[]> {
  const { data, error } = await supabase.from('testing_results').select('*').eq('macro_id', macroId)
  if (error) throw error
  return (data || []).map(M.rowToTesting)
}

export async function saveTestingResult(result: TestingResult): Promise<TestingResult> {
  assertWritable()
  const row = M.testingToRow(result)
  // Editing an existing row upserts by id; a brand-new row upserts on the natural
  // key (macro_id, lift, tested_on) so a re-submit UPDATES the same result instead
  // of inserting a duplicate — matches the 0003 unique index (NULLS NOT DISTINCT,
  // so a date-less re-save also dedupes).
  const q = row.id
    ? supabase.from('testing_results').upsert(row, { onConflict: 'id' })
    : supabase.from('testing_results').upsert(row, { onConflict: 'macro_id,lift,tested_on' })
  const { data, error } = await q.select().single()
  if (error) throw error
  return M.rowToTesting(data)
}

export async function deleteTestingResult(id: string): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('testing_results').delete().eq('id', id)
  if (error) throw error
}

// ---- multi-macro archiving -------------------------------------------------
// Complete the current macro and start the next one, carrying the current
// macro's C3 working + accessory weights forward as the new macro's C1
// (start-of-macro rule), plus the Giant Run anchor state: the reference pace P
// (already updated by the TT confirm flow when taken) and the C3 run targets.
// The old macro and all its data are preserved.
export async function rollToNextMacro({
  currentMacroId,
  currentMacroNumber,
  newStartISO,
}: {
  currentMacroId: string
  currentMacroNumber: number
  newStartISO: string
}): Promise<Macro> {
  assertWritable()
  const [w, acc, rt, current] = await Promise.all([
    getWorkingWeights(currentMacroId),
    getAccessoryWeights(currentMacroId),
    getRunTargets(currentMacroId),
    supabase.from('macros').select('*').eq('id', currentMacroId).single(),
  ])
  if (current.error) throw current.error
  await setMacroStatus(currentMacroId, 'completed')
  const next = await createMacro({ number: currentMacroNumber + 1, startISO: newStartISO, status: 'active' })
  // Carry only the GiantFit anchors forward — deprecated Giant-era anchors
  // (dips/pullup) stay on the old macro for history but are never written again.
  if (w[3]) {
    const carried: typeof w[3] = {}
    for (const lift of ANCHOR_LIFTS) if (w[3][lift]) carried[lift] = w[3][lift]
    if (Object.keys(carried).length) await saveWorkingWeights(next.id, 1, carried)
  }
  // Accessories: carry only the GiantFit items (the four per-day carries) —
  // legacy secondaries/carry_dips stay on the old macro for history.
  if (acc[3]) {
    const carriedAcc: Record<string, number | null> = {}
    for (const item of GIANTFIT_ACC_ITEMS) if (acc[3][item] != null) carriedAcc[item] = acc[3][item]
    if (Object.keys(carriedAcc).length) await saveAccessoryWeights(next.id, 1, carriedAcc)
  }
  if (rt[3]) await saveRunTargets(next.id, 1, rt[3])
  const refPaceS = M.rowToMacro(current.data).refPaceS
  if (refPaceS != null) return updateMacro(next.id, { refPaceS })
  return next
}

// ---- trends (all macros, for the Trends tab) ------------------------------
// One round-trip of RLS-scoped reads (every table is owned by the user, so an
// unfiltered select returns only their rows across all macros). Per-macro weight
// grids are grouped by macro_id; deload week_keys are globally unique.
export async function loadTrends(): Promise<TrendsData> {
  const [macros, sess, wRows, aRows, tRows, dRows, breakDays, rRows, cRows] = await Promise.all([
    getMacros(),
    supabase.from('sessions').select('*'),
    supabase.from('working_weights').select('*'),
    supabase.from('accessory_weights').select('*'),
    supabase.from('testing_results').select('*'),
    supabase.from('deloads').select('*'),
    getBreakDays(),
    supabase.from('runs').select('*'),
    supabase.from('capacity_logs').select('*'),
  ])
  for (const r of [sess, wRows, aRows, tRows, dRows, rRows, cRows]) if (r.error) throw r.error

  const byMacro = <T extends { macro_id: string }>(rows: T[]) => {
    const out: Record<string, T[]> = {}
    rows.forEach((r) => (out[r.macro_id] ||= []).push(r))
    return out
  }
  const wByMacro = byMacro((wRows.data || []) as { macro_id: string }[])
  const aByMacro = byMacro((aRows.data || []) as { macro_id: string }[])
  const weights: TrendsData['weights'] = {}
  const accessory: TrendsData['accessory'] = {}
  for (const m of macros) {
    weights[m.id] = M.rowsToWeights((wByMacro[m.id] || []) as Parameters<typeof M.rowsToWeights>[0])
    accessory[m.id] = M.rowsToAccessory((aByMacro[m.id] || []) as Parameters<typeof M.rowsToAccessory>[0])
  }

  return {
    macros,
    sessions: (sess.data || []).map(M.rowToSession),
    weights,
    accessory,
    testing: (tRows.data || []).map(M.rowToTesting),
    deloads: M.rowsToDeloads(dRows.data || []),
    breakDays,
    runs: (rRows.data || []).map(M.rowToRun),
    capacityLogs: (cRows.data || []).map(M.rowToCapacityLog),
  }
}

// All capacity logs across every macro (RLS-scoped via the session→macro chain) —
// the Data page's capacity CSV + copy-summary capacity lines.
export async function getAllCapacityLogs(): Promise<CapacityLog[]> {
  const { data, error } = await supabase.from('capacity_logs').select('*')
  if (error) throw error
  return (data || []).map(M.rowToCapacityLog)
}

// All-macro Capability logs (RLS-scoped) — Giant 2.0's equivalent of
// getAllCapacityLogs, for the Data page's CSV export.
export async function getAllHypertrophyLogs(): Promise<HypertrophyLog[]> {
  const { data, error } = await supabase.from('hypertrophy_logs').select('*')
  if (error) throw error
  return (data || []).map(M.rowToHypertrophyLog)
}
export async function getAllOlyLogs(): Promise<OlyLog[]> {
  const { data, error } = await supabase.from('oly_logs').select('*')
  if (error) throw error
  return (data || []).map(M.rowToOlyLog)
}

// All testing results across every macro (RLS-scoped) — tests live only in
// testing_results (no sessions row), so the Data page merges these into its list.
export async function getAllTestingResults(): Promise<TestingResult[]> {
  const { data, error } = await supabase.from('testing_results').select('*')
  if (error) throw error
  return (data || []).map(M.rowToTesting)
}

// All reactive-deload week flags across every macro (weekKey "M2C3W2" is
// globally unique, so one map spans macros) — labels deload sessions in Data.
export async function getAllDeloads(): Promise<DeloadMap> {
  const { data, error } = await supabase.from('deloads').select('*')
  if (error) throw error
  return M.rowsToDeloads(data || [])
}

// All working-weight anchors across every macro (RLS-scoped), grouped by macro id —
// the Data page's session summary resolves the weighted pull-up ladder per (macro, cycle).
export async function getAllWorkingWeights(): Promise<Record<string, WeightsByCycle>> {
  const { data, error } = await supabase.from('working_weights').select('*')
  if (error) throw error
  const byMacro: Record<string, Parameters<typeof M.rowsToWeights>[0]> = {}
  ;((data || []) as (Parameters<typeof M.rowsToWeights>[0][number] & { macro_id: string })[]).forEach((r) => {
    ;(byMacro[r.macro_id] ||= []).push(r)
  })
  const out: Record<string, WeightsByCycle> = {}
  for (const id of Object.keys(byMacro)) out[id] = M.rowsToWeights(byMacro[id])
  return out
}

// All accessory weights across every macro (RLS-scoped), grouped by macro id —
// the Data page's session summary resolves secondary/carry weights per (macro, cycle).
export async function getAllAccessoryWeights(): Promise<Record<string, AccessoryByCycle>> {
  const { data, error } = await supabase.from('accessory_weights').select('*')
  if (error) throw error
  const byMacro: Record<string, Parameters<typeof M.rowsToAccessory>[0]> = {}
  ;((data || []) as (Parameters<typeof M.rowsToAccessory>[0][number] & { macro_id: string })[]).forEach((r) => {
    ;(byMacro[r.macro_id] ||= []).push(r)
  })
  const out: Record<string, AccessoryByCycle> = {}
  for (const id of Object.keys(byMacro)) out[id] = M.rowsToAccessory(byMacro[id])
  return out
}

// ---- recovery (Tendon Health) ----------------------------------------------
export async function getActiveProtocol(): Promise<RecoveryProtocol | null> {
  const { data, error } = await supabase.from('recovery_protocols').select('*').eq('status', 'active').maybeSingle()
  if (error) throw error
  return data ? M.rowToProtocol(data) : null
}

export async function startProtocol(joint: Joint, startISO: string): Promise<RecoveryProtocol> {
  assertWritable()
  const { data, error } = await supabase.from('recovery_protocols').insert({ joint, start_date: startISO }).select().single()
  if (error) throw error
  return M.rowToProtocol(data)
}

export async function setPhaseOverride(id: string, phase: Phase | null): Promise<RecoveryProtocol> {
  assertWritable()
  const { data, error } = await supabase.from('recovery_protocols').update({ phase_override: phase }).eq('id', id).select().single()
  if (error) throw error
  return M.rowToProtocol(data)
}

// Close the active protocol (v1 has no natural completion — every close is early).
export async function closeProtocol(id: string, endISO: string): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('recovery_protocols').update({ status: 'completed', closed_early: true, end_date: endISO }).eq('id', id)
  if (error) throw error
}

export async function getTendonLogsForDate(protocolId: string, dateISO: string): Promise<RecoveryLogMap> {
  const { data, error } = await supabase.from('recovery_tendon_logs').select('tendon_key').eq('protocol_id', protocolId).eq('log_date', dateISO)
  if (error) throw error
  return M.rowsToRecoveryLogs(data || [])
}

// A log row's existence is the signal: upsert to mark done, delete to unmark.
export async function setTendonLog(protocolId: string, tendonKey: string, dateISO: string, on: boolean): Promise<void> {
  assertWritable()
  if (on) {
    const { error } = await supabase
      .from('recovery_tendon_logs')
      .upsert({ protocol_id: protocolId, tendon_key: tendonKey, log_date: dateISO }, { onConflict: 'protocol_id,tendon_key,log_date' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('recovery_tendon_logs').delete().eq('protocol_id', protocolId).eq('tendon_key', tendonKey).eq('log_date', dateISO)
    if (error) throw error
  }
}

// ---- bundle (one round-trip for app boot) ---------------------------------
export async function loadMacroBundle(macroId: string): Promise<MacroBundle> {
  const [
    weights,
    accessory,
    sessions,
    deloads,
    breakDays,
    testing,
    runs,
    runTargets,
    capacity,
    capacityLogs,
    giantAccessory,
    giant2Difficulty,
    hypertrophyLogs,
    olyLogs,
  ] = await Promise.all([
    getWorkingWeights(macroId),
    getAccessoryWeights(macroId),
    getSessions(macroId),
    getDeloads(macroId),
    getBreakDays(),
    getTestingResults(macroId),
    getRuns(macroId),
    getRunTargets(macroId),
    getCapacityConfig(),
    getCapacityLogs(macroId),
    getGiantAccessoryConfig(),
    getGiant2DifficultyConfig(),
    getHypertrophyLogs(macroId),
    getOlyLogs(macroId),
  ])
  return {
    weights,
    accessory,
    sessions,
    deloads,
    breakDays,
    testing,
    runs,
    runTargets,
    capacity,
    capacityLogs,
    giantAccessory,
    giant2Difficulty,
    hypertrophyLogs,
    olyLogs,
  }
}
