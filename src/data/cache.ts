// Last-known app data snapshot, so reopening the app offline shows real data
// instead of a "couldn't load" screen. Browser-only; best-effort (ignores quota
// or serialization errors). Not the source of truth — Supabase is.
import type { Macro, WeightsByCycle, AccessoryByCycle, Session, DeloadMap, BreakDayMap, TestingResult, Run, RunTargetsByCycle, CapacityConfig, CapacityLog, GiantAccessoryReps, Giant2DifficultyConfig } from '../engine/types'
import type { Movement } from '../engine/movements'

export interface Snapshot {
  macros: Macro[]
  viewedMacroId: string | null
  macro: Macro | null
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  sessions: Session[]
  deloads: DeloadMap
  breakDays: BreakDayMap
  testing: TestingResult[]
  // Optional so a pre-Giant-Run cached snapshot still parses (offline reopen).
  runs?: Run[]
  runTargets?: RunTargetsByCycle
  // Optional so a pre-GiantFit cached snapshot still parses.
  capacity?: CapacityConfig
  capacityLogs?: CapacityLog[]
  // Optional so a pre-revision cached snapshot still parses (2026-07-30).
  giantAccessory?: GiantAccessoryReps
  // Optional so a pre-Giant-2.0 cached snapshot still parses (2026-08-09).
  giant2Difficulty?: Giant2DifficultyConfig
  // The movement library (user-scoped) — cached so the offline shell can still
  // render movement labels.
  movements?: Movement[]
}

const KEY = 'giant_bundle_cache_v1'
const isBrowser = typeof localStorage !== 'undefined'

export function saveSnapshot(snap: Snapshot): void {
  if (!isBrowser) return
  try {
    localStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    /* quota / serialization — ignore */
  }
}

export function readSnapshot(): Snapshot | null {
  if (!isBrowser) return null
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') as Snapshot | null
  } catch {
    return null
  }
}
