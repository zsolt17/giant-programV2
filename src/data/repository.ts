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
} from '../engine/types'
import type { Joint, Phase } from '../engine/recovery-content'
import { ANCHOR_LIFTS } from '../engine/constants'

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

// byMovement = { db_snatch: {reps: 8, weight: 17.5}, ... } for one variant.
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

// ---- capacity logs (one per session; no UI until Phase 3) -------------------
export async function getCapacityLog(sessionId: string): Promise<CapacityLog | null> {
  const { data, error } = await supabase.from('capacity_logs').select('*').eq('session_id', sessionId).maybeSingle()
  if (error) throw error
  return data ? M.rowToCapacityLog(data) : null
}

// Idempotent: upsert on session_id (one capacity result per session).
export async function saveCapacityLog(log: CapacityLogDraft): Promise<CapacityLog> {
  assertWritable()
  const row = M.capacityLogToRow(log)
  const { data, error } = await supabase.from('capacity_logs').upsert(row, { onConflict: 'session_id' }).select().single()
  if (error) throw error
  return M.rowToCapacityLog(data)
}

export async function deleteCapacityLog(sessionId: string): Promise<void> {
  assertWritable()
  const { error } = await supabase.from('capacity_logs').delete().eq('session_id', sessionId)
  if (error) throw error
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
  if (acc[3]) await saveAccessoryWeights(next.id, 1, acc[3])
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
  const [macros, sess, wRows, aRows, tRows, dRows, breakDays, rRows] = await Promise.all([
    getMacros(),
    supabase.from('sessions').select('*'),
    supabase.from('working_weights').select('*'),
    supabase.from('accessory_weights').select('*'),
    supabase.from('testing_results').select('*'),
    supabase.from('deloads').select('*'),
    getBreakDays(),
    supabase.from('runs').select('*'),
  ])
  for (const r of [sess, wRows, aRows, tRows, dRows, rRows]) if (r.error) throw r.error

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
  }
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
  const [weights, accessory, sessions, deloads, breakDays, testing, runs, runTargets, capacity] = await Promise.all([
    getWorkingWeights(macroId),
    getAccessoryWeights(macroId),
    getSessions(macroId),
    getDeloads(macroId),
    getBreakDays(),
    getTestingResults(macroId),
    getRuns(macroId),
    getRunTargets(macroId),
    getCapacityConfig(),
  ])
  return { weights, accessory, sessions, deloads, breakDays, testing, runs, runTargets, capacity }
}
