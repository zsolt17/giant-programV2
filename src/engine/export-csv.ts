// Pure CSV serialization of all logged sessions, for the Data page's export.
// Framework-agnostic and unit-tested. The macro NUMBER is resolved from the
// macros list (rows only carry macroId).
import type { Session, Macro, DeloadMap, HypertrophyLog, OlyLog } from './types'
import type { Movement } from './movements'

// Column order = header order. Each entry maps a Session to its cell value.
const COLUMNS: { header: string; value: (s: Session, macroNumber: number | '') => unknown }[] = [
  { header: 'date', value: (s) => s.date },
  { header: 'macro', value: (_s, n) => n },
  { header: 'cycle', value: (s) => s.cycle },
  { header: 'week', value: (s) => s.week },
  { header: 'week_type', value: (s) => s.weekType },
  { header: 'day_type', value: (s) => s.dayType },
  { header: 'difficulty', value: (s) => s.difficulty },
  // The Volume block's OWN difficulty, independent of `difficulty` above —
  // blank on any session with no Volume block that week (C3 week 4, or deload).
  { header: 'volume_difficulty', value: (s) => s.volumeDifficulty },
  { header: 'top_weight', value: (s) => s.topWeight },
  { header: 'top_reps', value: (s) => s.topReps },
  { header: 'rpe', value: (s) => s.rpe },
  { header: 'bar_speed', value: (s) => s.barSpeed },
  // Per-round cardio cals collapsed into one cell, e.g. "15/14/15/15" (blank round → "").
  { header: 'cardio_cals', value: (s) => s.cardioCals.map((c) => (c == null ? '' : c)).join('/') },
  { header: 'block_completion', value: (s) => s.blockCompletion },
  { header: 'vol_done', value: (s) => s.volDone },
  { header: 'vol_rpe', value: (s) => s.volRpe },
  { header: 'vol_speed', value: (s) => s.volSpeed },
  { header: 'pullup_cluster', value: (s) => s.pullupCluster },
  { header: 'carry_skipped', value: (s) => s.carrySkipped },
  { header: 'carry_skip_reason', value: (s) => s.carrySkipReason },
  { header: 'carry_rounds', value: (s) => s.carryRounds },
  { header: 'carry_distance', value: (s) => s.carryDistance },
  { header: 'carry_rpe', value: (s) => s.carryRpe },
  { header: 'started_at', value: (s) => s.startedAt },
  { header: 'ended_at', value: (s) => s.endedAt },
  { header: 'notes', value: (s) => s.notes },
]

// RFC-4180-ish field escaping: render null/undefined as empty; quote and double
// any field that contains a comma, quote, or newline.
function csvCell(v: unknown): string {
  if (v == null) return ''
  const str = String(v)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// `deloads` (weekKey -> true) marks reactive-deload weeks in a trailing
// deload_week column (blank when the row has no computable week key).
export function sessionsToCsv(sessions: Session[], macros: Macro[], deloads?: DeloadMap): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const header = [...COLUMNS.map((c) => c.header), 'deload_week'].join(',')
  const rows = sessions.map((s) => {
    const n = numberById.get(s.macroId) ?? ''
    const deloadCell =
      deloads && n !== '' && s.cycle != null && s.week != null ? String(!!deloads[`M${n}C${s.cycle}W${s.week}`]) : ''
    return [...COLUMNS.map((c) => csvCell(c.value(s, n))), deloadCell].join(',')
  })
  return [header, ...rows].join('\n')
}

// Hypertrophy export (C1) — one row per movement per session (unlike
// capacity_logs' one row per session), positioned via its session, movement
// name resolved from the athlete's library.
export function hypertrophyToCsv(logs: HypertrophyLog[], sessions: Session[], movements: Movement[], macros: Macro[]): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const movementById = new Map(movements.map((m) => [m.id, m]))
  const header = 'date,macro,cycle,week,day_type,movement,weight,reps_done,notes'
  const rows = logs
    .map((l) => ({ l, s: sessionById.get(l.sessionId), m: movementById.get(l.movementId) }))
    .sort((a, b) => ((a.s?.date || '') < (b.s?.date || '') ? -1 : 1))
    .map(({ l, s, m }) =>
      [s?.date, s ? numberById.get(s.macroId) ?? '' : '', s?.cycle, s?.week, s?.dayType, m?.name ?? l.movementId, l.weight, l.repsDone, l.notes]
        .map(csvCell)
        .join(',')
    )
  return [header, ...rows].join('\n')
}

// Oly export (C2) — same shape as Hypertrophy's, but logs a quality mark
// (Q1/Q2/Q3) instead of reps.
export function olyToCsv(logs: OlyLog[], sessions: Session[], movements: Movement[], macros: Macro[]): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const movementById = new Map(movements.map((m) => [m.id, m]))
  const header = 'date,macro,cycle,week,day_type,movement,weight,quality,notes'
  const rows = logs
    .map((l) => ({ l, s: sessionById.get(l.sessionId), m: movementById.get(l.movementId) }))
    .sort((a, b) => ((a.s?.date || '') < (b.s?.date || '') ? -1 : 1))
    .map(({ l, s, m }) =>
      [s?.date, s ? numberById.get(s.macroId) ?? '' : '', s?.cycle, s?.week, s?.dayType, m?.name ?? l.movementId, l.weight, l.quality, l.notes]
        .map(csvCell)
        .join(',')
    )
  return [header, ...rows].join('\n')
}
