// Reactive deload rule (revised — brief §5; supersedes v7 book §7).
// Signals across a training week:
//   S1 any-day top set R9.5+         S2 volume block incomplete
//   S3 carry skipped due to fatigue  S5 bar speed ↓ on top set in 2+ sessions
//   S6 capacity not completed as prescribed (fatigue) — one occurrence per
//      fatigue-attributed capacity log in the week. GIANTFIT-ERA ONLY: Giant
//      2.0 has no Capacity block, so no capacity_logs row ever exists for a
//      Giant2 session — S6 simply never has anything to find there. Retired
//      for Giant 2.0 (2026-08-09), not replaced with a new signal — no code
//      change needed to make it go quiet, but it stays live for GiantFit.
//   S7 giant block not completed as prescribed
//   (S4 Set1>R7 retired. S7 was numbered S6 in the Giant era. S6 itself was the
//   capacity TIME trend until 2026-07-31 — retired because per-round time in an
//   uncapped circuit measures transitions and equipment, not the athlete, and
//   its rolling baseline was rarely earned. Signals are computed, never stored,
//   so history re-renders under the new definition with no migration.)
// Giant Run signals POOL into the same week (engine/runs.ts):
//   R1 run cut short (fatigue)       R2 felt heavy / talk test failed
//   R3 pace-at-HR degraded on 2+ runs (only when HR is logged)
// TRIGGER: 3+ total occurrences spanning at least 2 different sessions —
// lifts and runs counted together. (3 occurrences = severity; 2 sessions =
// a pattern, not one bad day.) UNCHANGED for Giant 2.0 despite its 4th weekly
// session (Mon/Tue/Thu/Fri vs GiantFit's Mon/Wed/Fri) — reused verbatim, not
// rescaled; the spec never asked for a new threshold.
import { computeRunSignalHits } from './runs'
import { isCapacityFatigue } from './constants'
import { isGiant2Date } from './date-engine'
import type { Run, Session, WeekSignals, CapacityLog } from './types'

export function rpeNum(r: string | null | undefined): number {
  if (!r) return 0
  return parseFloat(String(r).replace('R', '')) || 0
}

// `weekRuns` = the same week's logged runs; `priorRuns` = earlier runs (any
// weeks), the R3 pace-at-HR baseline pool. `weekCapacityLogs` = the capacity
// results logged in THIS week, for S6. All default empty so lift-only callers
// are unchanged.
export function computeWeekSignals(
  weekSessions: Session[],
  weekRuns: Run[] = [],
  priorRuns: Run[] = [],
  weekCapacityLogs: CapacityLog[] = []
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
    // Giant 2.0's C3 week 4 has no Volume block at all (volumeDifficulty
    // null that session) — nothing to be "incomplete", so S2 never evaluates
    // it. GiantFit sessions (volumeDifficulty always null, but NOT Giant2-era)
    // are unaffected — this only suppresses the Giant-2.0-specific no-block case.
    const noVolumeBlock = !!s.date && isGiant2Date(s.date) && s.volumeDifficulty == null
    if (!noVolumeBlock && s.volDone === false) {
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

  // S6 (capacity adherence): ONE occurrence per capacity log in the week the
  // athlete attributed to fatigue. No streak rule, no cold start — a single
  // session counts once, exactly like S2 and S3. Null/legacy and non-fatigue
  // values (cut short for time, scaled for equipment) contribute nothing.
  const sessionById = new Map(weekSessions.map((s) => [s.id, s]))
  const s6Dates: string[] = []
  for (const log of weekCapacityLogs) {
    if (!isCapacityFatigue(log.completion)) continue
    types.add('S6')
    occurrences++
    // The capacity session counts toward the "2+ different sessions" spread on
    // its own id — the same id the lift session uses, so a fatigue-attributed
    // capacity block on a day that already fired another signal is one session,
    // not two.
    sessionsWithSignal.add(log.sessionId)
    const date = sessionById.get(log.sessionId)?.date
    if (date && !s6Dates.includes(date)) s6Dates.push(date)
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

// The capacity logs belonging to a set of sessions — the S6 input. (Deload weeks
// carry no capacity block at all, ARCHITECTURE §2.8, so there is nothing to
// exclude: the week's own sessions are the whole filter.)
export function capacityLogsForSessions(logs: CapacityLog[], sessions: Session[]): CapacityLog[] {
  const ids = new Set(sessions.map((s) => s.id))
  return (logs || []).filter((l) => ids.has(l.sessionId))
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
  capacityLogs,
  alreadyDeloaded,
  usedThisMeso,
  breakComing,
}: {
  prevWeekSessions?: Session[]
  prevWeekRuns?: Run[]
  priorRuns?: Run[]
  capacityLogs?: CapacityLog[]
  alreadyDeloaded?: boolean
  usedThisMeso?: boolean
  breakComing?: boolean
}): boolean {
  if (alreadyDeloaded || usedThisMeso || breakComing) return false
  if ((!prevWeekSessions || !prevWeekSessions.length) && (!prevWeekRuns || !prevWeekRuns.length)) return false
  return computeWeekSignals(prevWeekSessions || [], prevWeekRuns || [], priorRuns || [], capacityLogs || []).fired
}
