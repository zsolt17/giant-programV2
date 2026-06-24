// Pure row <-> app-object coercion. NO database calls live here.
// App objects use camelCase; DB rows use snake_case. Unset form selects come
// through as "" — we normalize "" -> NULL on the way to the DB so the columns
// stay clean (the schema deliberately has no CHECK on those loose text fields).

const blankToNull = (v) => (v === '' || v === undefined ? null : v)
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// ---- macro -----------------------------------------------------------------
export function rowToMacro(r) {
  return { id: r.id, number: r.number, startISO: r.start_date, weeks: r.weeks, status: r.status }
}

// ---- working weights -------------------------------------------------------
// rows[] -> { [cycle]: { [lift]: { hard, medium, light } } }
export function rowsToWeights(rows) {
  const out = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    out[r.cycle][r.lift] = { hard: toNum(r.hard), medium: toNum(r.medium), light: toNum(r.light) }
  })
  return out
}
// { [lift]: { hard, medium, light } } for one cycle -> rows[]
export function weightsToRows(macroId, cycle, byLift) {
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
// rows[] -> { [cycle]: { [item]: weight } }
export function rowsToAccessory(rows) {
  const out = {}
  ;(rows || []).forEach((r) => {
    out[r.cycle] = out[r.cycle] || {}
    out[r.cycle][r.item] = toNum(r.weight)
  })
  return out
}
export function accessoryToRows(macroId, cycle, byItem) {
  return Object.keys(byItem).map((item) => ({
    macro_id: macroId,
    cycle: Number(cycle),
    item,
    weight: toNum(byItem[item]),
  }))
}

// ---- session ---------------------------------------------------------------
export function rowToSession(r) {
  return {
    id: r.id,
    macroId: r.macro_id,
    date: r.date,
    cycle: r.cycle,
    week: r.week,
    weekType: r.week_type,
    dayType: r.day_type,
    difficulty: r.difficulty,
    topReps: r.top_reps,
    topWeight: toNum(r.top_weight),
    rpe: r.rpe || '',
    barSpeed: r.bar_speed || '',
    cleanLoad: toNum(r.clean_load),
    cleanSpeed: r.clean_speed || '',
    volDone: r.vol_done,
    volRpe: r.vol_rpe || '',
    volSpeed: r.vol_speed || '',
    pullupCluster: r.pullup_cluster || '',
    carrySkipped: !!r.carry_skipped,
    carrySkipReason: r.carry_skip_reason || '',
    carryRpe: r.carry_rpe || '',
    notes: r.notes || '',
    startedAt: r.started_at || null,
    endedAt: r.ended_at || null,
    updatedAt: r.updated_at,
  }
}
export function sessionToRow(s) {
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
    clean_speed: blankToNull(s.cleanSpeed),
    vol_done: s.volDone ?? true,
    vol_rpe: blankToNull(s.volRpe),
    vol_speed: blankToNull(s.volSpeed),
    pullup_cluster: blankToNull(s.pullupCluster),
    carry_skipped: !!s.carrySkipped,
    carry_skip_reason: blankToNull(s.carrySkipReason),
    carry_rpe: blankToNull(s.carryRpe),
    notes: blankToNull(s.notes),
    started_at: s.startedAt ?? null,
    ended_at: s.endedAt ?? null,
  }
}

// ---- deloads / break days --------------------------------------------------
export function rowsToDeloads(rows) {
  const o = {}
  ;(rows || []).forEach((r) => {
    o[r.week_key] = true
  })
  return o
}
export function rowsToBreakDays(rows) {
  const o = {}
  ;(rows || []).forEach((r) => {
    o[r.date] = true
  })
  return o
}

// ---- testing results -------------------------------------------------------
export function rowToTesting(r) {
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
export function testingToRow(t) {
  const row = {
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
