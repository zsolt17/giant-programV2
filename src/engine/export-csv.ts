// Pure CSV serialization of all logged sessions, for the Data page's "Download
// all data" export. Framework-agnostic and unit-tested. The macro NUMBER is
// resolved from the macros list (sessions only carry macroId).
import type { Session, Macro } from './types'

// Column order = header order. Each entry maps a Session to its cell value.
const COLUMNS: { header: string; value: (s: Session, macroNumber: number | '') => unknown }[] = [
  { header: 'date', value: (s) => s.date },
  { header: 'macro', value: (_s, n) => n },
  { header: 'cycle', value: (s) => s.cycle },
  { header: 'week', value: (s) => s.week },
  { header: 'week_type', value: (s) => s.weekType },
  { header: 'day_type', value: (s) => s.dayType },
  { header: 'difficulty', value: (s) => s.difficulty },
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

export function sessionsToCsv(sessions: Session[], macros: Macro[]): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const header = COLUMNS.map((c) => c.header).join(',')
  const rows = sessions.map((s) => {
    const n = numberById.get(s.macroId) ?? ''
    return COLUMNS.map((c) => csvCell(c.value(s, n))).join(',')
  })
  return [header, ...rows].join('\n')
}
