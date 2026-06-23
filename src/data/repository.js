// The ONLY module (besides supabase.js) that talks to the database. Everything
// above this works with plain app objects, so swapping the backend is a
// single-file change. All functions throw on error; callers handle it.
import { supabase } from './supabase.js'
import * as M from './mappers.js'

// ---- macros ----------------------------------------------------------------
export async function getMacros() {
  const { data, error } = await supabase.from('macros').select('*').order('number', { ascending: true })
  if (error) throw error
  return data.map(M.rowToMacro)
}

export async function getMacroByNumber(number) {
  const { data, error } = await supabase.from('macros').select('*').eq('number', number).maybeSingle()
  if (error) throw error
  return data ? M.rowToMacro(data) : null
}

export async function getActiveMacro() {
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

export async function createMacro({ number, startISO, weeks = 15, status = 'active' }) {
  const { data, error } = await supabase
    .from('macros')
    .insert({ number, start_date: startISO, weeks, status })
    .select()
    .single()
  if (error) throw error
  return M.rowToMacro(data)
}

export async function setMacroStatus(id, status) {
  const { error } = await supabase.from('macros').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateMacro(id, { number, startISO, weeks, status } = {}) {
  const patch = {}
  if (number !== undefined) patch.number = number
  if (startISO !== undefined) patch.start_date = startISO
  if (weeks !== undefined) patch.weeks = weeks
  if (status !== undefined) patch.status = status
  const { data, error } = await supabase.from('macros').update(patch).eq('id', id).select().single()
  if (error) throw error
  return M.rowToMacro(data)
}

// ---- working weights (per-cycle H/M/L) ------------------------------------
export async function getWorkingWeights(macroId) {
  const { data, error } = await supabase.from('working_weights').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToWeights(data)
}

// byLift = { deadlift: {hard,medium,light}, ... } for a single cycle.
export async function saveWorkingWeights(macroId, cycle, byLift) {
  const rows = M.weightsToRows(macroId, cycle, byLift)
  const { error } = await supabase.from('working_weights').upsert(rows, { onConflict: 'macro_id,cycle,lift' })
  if (error) throw error
}

// ---- accessory weights (per-cycle single values) --------------------------
export async function getAccessoryWeights(macroId) {
  const { data, error } = await supabase.from('accessory_weights').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToAccessory(data)
}

// byItem = { clean: 70, carry_deadlift: 60, ... } for a single cycle.
export async function saveAccessoryWeights(macroId, cycle, byItem) {
  const rows = M.accessoryToRows(macroId, cycle, byItem)
  const { error } = await supabase.from('accessory_weights').upsert(rows, { onConflict: 'macro_id,cycle,item' })
  if (error) throw error
}

// ---- sessions --------------------------------------------------------------
export async function getSessions(macroId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('macro_id', macroId)
    .order('date', { ascending: false })
  if (error) throw error
  return data.map(M.rowToSession)
}

// Idempotent: upsert on the human-readable id (date-lift-difficulty).
export async function saveSession(session) {
  const row = M.sessionToRow(session)
  const { data, error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' }).select().single()
  if (error) throw error
  return M.rowToSession(data)
}

export async function deleteSession(id) {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

// ---- deloads ---------------------------------------------------------------
export async function getDeloads(macroId) {
  const { data, error } = await supabase.from('deloads').select('*').eq('macro_id', macroId)
  if (error) throw error
  return M.rowsToDeloads(data)
}

export async function setDeload(macroId, weekKey, on) {
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
export async function getBreakDays() {
  const { data, error } = await supabase.from('break_days').select('*')
  if (error) throw error
  return M.rowsToBreakDays(data)
}

export async function setBreakDay(dateISO, on) {
  if (on) {
    const { error } = await supabase.from('break_days').upsert({ date: dateISO }, { onConflict: 'user_id,date' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('break_days').delete().eq('date', dateISO)
    if (error) throw error
  }
}

// ---- testing results -------------------------------------------------------
export async function getTestingResults(macroId) {
  const { data, error } = await supabase.from('testing_results').select('*').eq('macro_id', macroId)
  if (error) throw error
  return data.map(M.rowToTesting)
}

export async function saveTestingResult(result) {
  const row = M.testingToRow(result)
  const q = row.id
    ? supabase.from('testing_results').upsert(row, { onConflict: 'id' })
    : supabase.from('testing_results').insert(row)
  const { data, error } = await q.select().single()
  if (error) throw error
  return M.rowToTesting(data)
}

export async function deleteTestingResult(id) {
  const { error } = await supabase.from('testing_results').delete().eq('id', id)
  if (error) throw error
}

// ---- multi-macro archiving -------------------------------------------------
// Complete the current macro and start the next one, carrying the current
// macro's C3 working + accessory weights forward as the new macro's C1
// (start-of-macro rule). The old macro and all its data are preserved.
export async function rollToNextMacro({ currentMacroId, currentMacroNumber, newStartISO }) {
  const [w, acc] = await Promise.all([getWorkingWeights(currentMacroId), getAccessoryWeights(currentMacroId)])
  await setMacroStatus(currentMacroId, 'completed')
  const next = await createMacro({ number: currentMacroNumber + 1, startISO: newStartISO, status: 'active' })
  if (w[3]) await saveWorkingWeights(next.id, 1, w[3])
  if (acc[3]) await saveAccessoryWeights(next.id, 1, acc[3])
  return next
}

// ---- bundle (one round-trip for app boot) ---------------------------------
export async function loadMacroBundle(macroId) {
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
