// Reactive deload rule (revised — brief §5; supersedes v7 book §7).
// Signals across a training week:
//   S1 any-day top set R9.5+         S2 volume block incomplete
//   S3 carry skipped due to fatigue  S5 bar speed ↓ on top set in 2+ sessions
//   S6 capacity time ↑ (GiantFit): per-round time > rolling same-variant avg ×
//      S6_THRESHOLD in 2+ CONSECUTIVE capacity sessions = ONE occurrence
//   S7 giant block not completed as prescribed
//   (S4 Set1>R7 retired. S7 was numbered S6 in the Giant era — renumbered when
//   GiantFit claimed S6 for the capacity trend; signals are computed, never
//   stored, so history re-renders under the new number with identical facts.)
// Giant Run signals POOL into the same week (engine/runs.ts):
//   R1 run cut short (fatigue)       R2 felt heavy / talk test failed
//   R3 pace-at-HR degraded on 2+ runs (only when HR is logged)
// TRIGGER: 3+ total occurrences spanning at least 2 different sessions —
// lifts and runs counted together. (3 occurrences = severity; 2 sessions =
// a pattern, not one bad day.)
import { computeRunSignalHits } from './runs'
import { buildCapacityPoints } from './capacity'
import type { CapacityPoint } from './capacity'
import type { Run, Session, WeekSignals, CapacityLog, DeloadMap } from './types'

export function rpeNum(r: string | null | undefined): number {
  if (!r) return 0
  return parseFloat(String(r).replace('R', '')) || 0
}

// `weekRuns` = the same week's logged runs; `priorRuns` = earlier runs (any
// weeks), the R3 pace-at-HR baseline pool. `capacityPoints` = the macro's full
// ordered capacity series (capacityPointsForSignals) for the S6 time trend.
// All default empty so lift-only callers are unchanged.
export function computeWeekSignals(
  weekSessions: Session[],
  weekRuns: Run[] = [],
  priorRuns: Run[] = [],
  capacityPoints: CapacityPoint[] = []
): WeekSignals {
  const types = new Set<string>()
  let occurrences = 0
  const sessionsWithSignal = new Set<string>()
  let downTopSets = 0

  for (const s of weekSessions) {
    let hit = false
    if (rpeNum(s.rpe) >= 9.5) {
      types.add('S1')
      occurrences++
      hit = true
    }
    if (s.blockCompletion && s.blockCompletion !== 'completed') {
      types.add('S7')
      occurrences++
      hit = true
    }
    if (s.volDone === false) {
      types.add('S2')
      occurrences++
      hit = true
    }
    if (s.carrySkipped && s.carrySkipReason === 'fatigue') {
      types.add('S3')
      occurrences++
      hit = true
    }
    if (s.barSpeed === 'down') downTopSets++
    if (hit) sessionsWithSignal.add(s.id)
  }

  // S5: top-set bar speed down in 2+ sessions this week (one week-level occurrence).
  if (downTopSets >= 2) {
    types.add('S5')
    occurrences++
    weekSessions.forEach((s) => {
      if (s.barSpeed === 'down') sessionsWithSignal.add(s.id)
    })
  }

  // S6 (GiantFit capacity time trend): 2+ CONSECUTIVE slow capacity sessions —
  // consecutive in the full series, any variant mix, each already judged
  // against its own variant's rolling average (the slow flag on the point) —
  // count as ONE week-level occurrence, attributed to the week holding the
  // streak's later session. A longer streak is still one occurrence.
  const weekIds = new Set(weekSessions.map((s) => s.id))
  const s6Dates: string[] = []
  for (let i = 1; i < capacityPoints.length; i++) {
    const prev = capacityPoints[i - 1]
    const cur = capacityPoints[i]
    if (prev.slow && cur.slow && weekIds.has(cur.sessionId)) {
      if (!types.has('S6')) {
        types.add('S6')
        occurrences++
      }
      // Both offending sessions count toward the "2+ different sessions" spread.
      sessionsWithSignal.add(prev.sessionId)
      sessionsWithSignal.add(cur.sessionId)
      for (const d of [prev.date, cur.date]) if (!s6Dates.includes(d)) s6Dates.push(d)
    }
  }

  // Pool the run-derived signals: occurrences add up, and run ids count toward
  // the "2+ different sessions" spread exactly like lift session ids.
  const runHits = computeRunSignalHits(weekRuns, priorRuns)
  runHits.types.forEach((t) => types.add(t))
  occurrences += runHits.occurrences
  runHits.runIds.forEach((id) => sessionsWithSignal.add(id))

  const fired = occurrences >= 3 && sessionsWithSignal.size >= 2
  return { types, occurrences, sessionCount: sessionsWithSignal.size, fired, s6Dates }
}

// The capacity series feeding the S6 signal: the macro's logs joined to their
// sessions, with deload weeks excluded on BOTH sides (never evaluated, never
// in the rolling averages) — end-of-macro deload weeks by weekType, reactive
// deload weeks by the applied-deload map.
export function capacityPointsForSignals(
  logs: CapacityLog[],
  sessions: Session[],
  macroNumber: number,
  deloads: DeloadMap = {}
): CapacityPoint[] {
  return buildCapacityPoints(logs, sessions, (s) => {
    if (s.weekType === 'deload') return true
    if (s.cycle != null && s.week != null) return !!deloads[weekKeyFor(macroNumber, s.cycle, s.week)]
    return false
  })
}

export function weekKeyFor(macroNumber: number, meso: number, week: number): string {
  return `M${macroNumber}C${meso}W${week}`
}

// Max one reactive deload per mesocycle.
export function usedDeloadThisMeso(deloads: Record<string, boolean>, macroNumber: number, meso: number): boolean {
  return Object.keys(deloads || {}).some((k) => k.startsWith(`M${macroNumber}C${meso}W`))
}

// Advise-and-confirm recommendation for the current week, based on the previous
// week's signals. Never fires if already deloaded, the meso cap is used, or a
// scheduled break is already covering this week (no deloading into a break).
export function shouldRecommendDeload({
  prevWeekSessions,
  prevWeekRuns,
  priorRuns,
  capacityPoints,
  alreadyDeloaded,
  usedThisMeso,
  breakComing,
}: {
  prevWeekSessions?: Session[]
  prevWeekRuns?: Run[]
  priorRuns?: Run[]
  capacityPoints?: CapacityPoint[]
  alreadyDeloaded?: boolean
  usedThisMeso?: boolean
  breakComing?: boolean
}): boolean {
  if (alreadyDeloaded || usedThisMeso || breakComing) return false
  if ((!prevWeekSessions || !prevWeekSessions.length) && (!prevWeekRuns || !prevWeekRuns.length)) return false
  return computeWeekSignals(prevWeekSessions || [], prevWeekRuns || [], priorRuns || [], capacityPoints || []).fired
}
