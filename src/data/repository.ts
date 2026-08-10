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
  MacroBundle,
  TrendsData,
  RecoveryProtocol,
  RecoveryLogMap,
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
import { SEED_MOVEMENTS, SEED_PRIMER_KEYS, SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS } from '../engine/movements'
import type { ProgramVersion, ProgramSlot } from '../engine/program'
import { buildSeedSlots, SEED_CARRY_KEYS } from '../engine/program'
import { ANCHOR_LIFTS, ACC_ITEMS, GB_ACCESSORY } from '../engine/constants'

// Effective-from date for the seeded program version. Kept as a constant here
// (not engine/constants.ts) since it's a one-time seeding detail, not a
// domain rule anything branches on.
const PROGRAM_SEED_DATE = '2026-08-10'

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
  weeks = 13, // 12 training + 1 deload (extendable)
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
  { number, startISO, weeks, status, deloadExtended }: { number?: number; startISO?: string; weeks?: number; status?: MacroStatus; deloadExtended?: boolean } = {}
): Promise<Macro> {
  assertWritable()
  const patch: Record<string, unknown> = {}
  if (number !== undefined) patch.number = number
  if (startISO !== undefined) patch.start_date = startISO
  if (weeks !== undefined) patch.weeks = weeks
  if (status !== undefined) patch.status = status
  if (deloadExtended !== undefined) patch.deload_extended = deloadExtended
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

// byItem = { carry_deadlift: 60, ... } for a single cycle.
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

// Idempotent: upsert on the human-readable id (date-lift). Offline (or on a
// network failure), the write is queued and the call resolves optimistically
// so the UI updates; it replays on reconnect via flushQueue().
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
// since renamed or archived movements is never overwritten.
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
// new content was added. Safe to call every boot: existing rows (renamed,
// archived, whatever) are never touched, only missing keys are inserted.
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

// Seed the program version for a user who has none yet, with today's
// hardcoded occupants. Idempotent: only writes when the user has no versions.
export async function ensureSeedProgramVersion(): Promise<{ versions: ProgramVersion[]; slots: ProgramSlot[] }> {
  const existing = await listProgramVersions()
  if (existing.length) return { versions: existing, slots: await listProgramSlots() }

  assertWritable()
  const movements = await syncSeedMovements()

  const { data: vRow, error: vErr } = await supabase
    .from('program_versions')
    .insert({ number: 1, effective_from: PROGRAM_SEED_DATE, note: 'Giant 2.0' })
    .select()
    .single()
  if (vErr) throw vErr
  const version = M.rowToProgramVersion(vRow)

  const gbAccessoryKeys = Object.fromEntries(Object.entries(GB_ACCESSORY).map(([day, m]) => [day, m.key])) as Partial<Record<Lift, string>>
  const slots = buildSeedSlots(version.id, movements, {
    gbAccessoryKeys,
    primerKeys: SEED_PRIMER_KEYS,
    hypertrophyKeys: SEED_HYPERTROPHY_KEYS,
    olyKeys: SEED_OLY_KEYS,
    carryKeys: SEED_CARRY_KEYS,
  })

  const { error: sErr } = await supabase.from('program_slots').insert(slots.map(M.programSlotToRow))
  if (sErr) throw sErr
  return { versions: [version], slots: await listProgramSlots() }
}

// ---- Giant Block accessory rep targets (user-scoped, capacity-config pattern)
export async function getGiantAccessoryConfig(): Promise<GiantAccessoryReps> {
  const { data, error } = await supabase.from('giant_accessory_config').select('*')
  if (error) throw error
  return M.rowsToGiantAccessory(data || [])
}

// byKey = { ab_rollout: 10, leg_raises: 12, ... }
export async function saveGiantAccessoryConfig(byKey: Record<string, number | string | null>): Promise<void> {
  assertWritable()
  const rows = M.giantAccessoryToRows(byKey)
  const { error } = await supabase.from('giant_accessory_config').upsert(rows, { onConflict: 'user_id,movement_key' })
  if (error) throw error
}

// ---- weekly Giant-difficulty rotation (user-scoped, capacity-config pattern)
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

// ---- Capability block logs (C1 Hypertrophy, C2 Oly) -------------------------
// One row per (session, movement) — the dedupe key is composite. No delete: a
// blanked weight/reps/quality on the next save is how an entry is cleared.
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
  const dedupeId = `hyp-${row.session_id}-${row.movement_id}-${row.set_number}`
  if (isOffline()) {
    queue.enqueue({ kind: 'saveHypertrophyLog', payload: { id: dedupeId, row } })
    return M.rowToHypertrophyLog(row)
  }
  try {
    const { data, error } = await supabase.from('hypertrophy_logs').upsert(row, { onConflict: 'session_id,movement_id,set_number' }).select().single()
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
  async saveHypertrophyLog({ row }) {
    const { error } = await supabase.from('hypertrophy_logs').upsert(row, { onConflict: 'session_id,movement_id,set_number' })
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
  assertWritable()
  const [w, acc] = await Promise.all([getWorkingWeights(currentMacroId), getAccessoryWeights(currentMacroId)])
  await setMacroStatus(currentMacroId, 'completed')
  const next = await createMacro({ number: currentMacroNumber + 1, startISO: newStartISO, status: 'active' })
  if (w[3]) {
    const carried: (typeof w)[3] = {}
    for (const lift of ANCHOR_LIFTS) if (w[3][lift]) carried[lift] = w[3][lift]
    if (Object.keys(carried).length) await saveWorkingWeights(next.id, 1, carried)
  }
  if (acc[3]) {
    const carriedAcc: Record<string, number | null> = {}
    for (const item of ACC_ITEMS) if (acc[3][item] != null) carriedAcc[item] = acc[3][item]
    if (Object.keys(carriedAcc).length) await saveAccessoryWeights(next.id, 1, carriedAcc)
  }
  return next
}

// ---- trends (all macros, for the Trends tab) ------------------------------
// One round-trip of RLS-scoped reads (every table is owned by the user, so an
// unfiltered select returns only their rows across all macros). Per-macro weight
// grids are grouped by macro_id; deload week_keys are globally unique.
export async function loadTrends(): Promise<TrendsData> {
  const [macros, sess, wRows, aRows, dRows, breakDays] = await Promise.all([
    getMacros(),
    supabase.from('sessions').select('*'),
    supabase.from('working_weights').select('*'),
    supabase.from('accessory_weights').select('*'),
    supabase.from('deloads').select('*'),
    getBreakDays(),
  ])
  for (const r of [sess, wRows, aRows, dRows]) if (r.error) throw r.error

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
    deloads: M.rowsToDeloads(dRows.data || []),
    breakDays,
  }
}

// All-macro Capability logs (RLS-scoped) — the Data page's CSV export.
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
// the Data page's session summary resolves the carry weight per (macro, cycle).
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
  const [weights, accessory, sessions, deloads, breakDays, giantAccessory, giant2Difficulty, hypertrophyLogs, olyLogs] = await Promise.all([
    getWorkingWeights(macroId),
    getAccessoryWeights(macroId),
    getSessions(macroId),
    getDeloads(macroId),
    getBreakDays(),
    getGiantAccessoryConfig(),
    getGiant2DifficultyConfig(),
    getHypertrophyLogs(macroId),
    getOlyLogs(macroId),
  ])
  return { weights, accessory, sessions, deloads, breakDays, giantAccessory, giant2Difficulty, hypertrophyLogs, olyLogs }
}
