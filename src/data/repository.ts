// The ONLY module (besides supabase.ts) that talks to the database. Everything
// above this works with plain app objects, so swapping the backend is a
// single-file change. All functions throw on error; callers handle it.
import { supabase } from './supabase'
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
} from '../engine/types'

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
  weeks = 15,
  status = 'active',
}: {
  number: number
  startISO: string
  weeks?: number
  status?: MacroStatus
}): Promise<Macro> {
  const { data, error } = await supabase
    .from('macros')
    .insert({ number, start_date: startISO, weeks, status })
    .select()
    .single()
  if (error) throw error
  return M.rowToMacro(data)
}

export async function setMacroStatus(id: string, status: MacroStatus): Promise<void> {
  const { error } = await supabase.from('macros').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateMacro(
  id: string,
  { number, startISO, weeks, status }: { number?: number; startISO?: string; weeks?: number; status?: MacroStatus } = {}
): Promise<Macro> {
  const patch: Record<string, unknown> = {}
  if (number !== undefined) patch.number = number
  if (startISO !== undefined) patch.start_date = startISO
  if (weeks !== undefined) patch.weeks = weeks
  if (status !== undefined) patch.status = status
  const { data, error } = await supabase.from('macros').update(patch).eq('id', id).select().single()
  if (error) throw error
  return M.rowToMacro(data)
}

// ---- working weights (per-cycle H/M/L) ------------------------------------
export async function getWorkingWeights(macroId: string): Promise<WeightsByCycle> {
  const { data, error } = await supabase.from('working_weights').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToWeights(data || [])
}

// byLift = { deadlift: {hard,medium,light}, ... } for a single cycle.
export async function saveWorkingWeights(macroId: string, cycle: number, byLift: Record<string, LiftWeightsInput>): Promise<void> {
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

// Idempotent: upsert on the human-readable id (date-lift-difficulty).
// Offline (or on a network failure), the write is queued and the call resolves
// optimistically so the UI updates; it replays on reconnect via flushQueue().
export async function saveSession(session: SessionDraft): Promise<Session> {
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
}
export function flushQueue(): Promise<number> {
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
  const row = M.testingToRow(result)
  const q = row.id
    ? supabase.from('testing_results').upsert(row, { onConflict: 'id' })
    : supabase.from('testing_results').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return M.rowToTesting(data)
}

export async function deleteTestingResult(id: string): Promise<void> {
  const { error } = await supabase.from('testing_results').delete().eq('id', id)
  if (error) throw error
}

// ---- multi-macro archiving -------------------------------------------------
// Complete the current macro and start the next one, carrying the current
// macro's C3 working + accessory weights forward as the new macro's C1
// (start-of-macro rule). The old macro and all its data are preserved.
export async function rollToNextMacro({
  currentMacroId,
  currentMacroNumber,
  newStartISO,
}: {
  currentMacroId: string
  currentMacroNumber: number
  newStartISO: string
}): Promise<Macro> {
  const [w, acc] = await Promise.all([getWorkingWeights(currentMacroId), getAccessoryWeights(currentMacroId)])
  await setMacroStatus(currentMacroId, 'completed')
  const next = await createMacro({ number: currentMacroNumber + 1, startISO: newStartISO, status: 'active' })
  if (w[3]) await saveWorkingWeights(next.id, 1, w[3])
  if (acc[3]) await saveAccessoryWeights(next.id, 1, acc[3])
  return next
}

// ---- bundle (one round-trip for app boot) ---------------------------------
export async function loadMacroBundle(macroId: string): Promise<MacroBundle> {
  const [weights, accessory, sessions, deloads, breakDays, testing] = await Promise.all([
    getWorkingWeights(macroId),
    getAccessoryWeights(macroId),
    getSessions(macroId),
    getDeloads(macroId),
    getBreakDays(),
    getTestingResults(macroId),
  ])
  return { weights, accessory, sessions, deloads, breakDays, testing }
}
