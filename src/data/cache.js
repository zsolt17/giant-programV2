// Last-known app data snapshot, so reopening the app offline shows real data
// instead of a "couldn't load" screen. Browser-only; best-effort (ignores quota
// or serialization errors). Not the source of truth — Supabase is.
const KEY = 'giant_bundle_cache_v1'
const isBrowser = typeof localStorage !== 'undefined'

export function saveSnapshot(snap) {
  if (!isBrowser) return
  try {
    localStorage.setItem(KEY, JSON.stringify(snap))
  } catch {
    /* quota / serialization — ignore */
  }
}

export function readSnapshot() {
  if (!isBrowser) return null
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
