// Pure CSV serialization of all logged sessions (+ a separate testing-results
// CSV — tests live in testing_results, not sessions), for the Data page's
// export. Framework-agnostic and unit-tested. The macro NUMBER is resolved from
// the macros list (rows only carry macroId).
import { derivedPaceS } from './runs'
import type { Session, Macro, TestingResult, DeloadMap, Run } from './types'

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
  { header: 'dips_cluster', value: (s) => s.dipsCluster },
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

// Testing results live in their own table — exported as a second CSV file so the
// export's promise ("all data") holds.
export function testingToCsv(results: TestingResult[], macros: Macro[]): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const header = 'tested_on,macro,lift,weight,reps,notes'
  const rows = results
    .slice()
    .sort((a, b) => ((a.testedOn || '') < (b.testedOn || '') ? -1 : 1))
    .map((r) => [r.testedOn, numberById.get(r.macroId) ?? '', r.lift, r.weight, r.reps, r.notes].map(csvCell).join(','))
  return [header, ...rows].join('\n')
}

// Giant Run export — third CSV file (runs have their own column set). The
// pace_s_per_km column is DERIVED at export time (duration/distance, whole
// seconds) for analysis convenience; it is never stored.
export function runsToCsv(runs: Run[], macros: Macro[]): string {
  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const header = 'date,macro,cycle,week,week_type,run_type,terrain,distance_km,duration_s,pace_s_per_km,avg_hr,completion,bulletproof,notes'
  const rows = runs
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => {
      const pace = derivedPaceS(r.distanceKm, r.durationS)
      return [
        r.date,
        numberById.get(r.macroId) ?? '',
        r.cycle,
        r.week,
        r.weekType,
        r.runType,
        r.terrain || 'road',
        r.distanceKm,
        r.durationS,
        pace != null ? Math.round(pace) : null,
        r.avgHr,
        r.completion,
        !!r.bulletproof,
        r.notes,
      ]
        .map(csvCell)
        .join(',')
    })
  return [header, ...rows].join('\n')
}
