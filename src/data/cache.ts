// Last-known app data snapshot, so reopening the app offline shows real data
// instead of a "couldn't load" screen. Browser-only; best-effort (ignores quota
// or serialization errors). Not the source of truth — Supabase is.
import type { Macro, WeightsByCycle, AccessoryByCycle, Session, DeloadMap, BreakDayMap, TestingResult, Run, RunTargetsByCycle } from '../engine/types'

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
