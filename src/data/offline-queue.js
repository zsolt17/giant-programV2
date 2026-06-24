// Durable offline write queue. Session saves/deletes made while offline are
// stored in localStorage and replayed when back online. Replay is safe because
// session writes are idempotent (upsert by id). Browser-only — guarded so the
// Node smoke test (no window/localStorage) is unaffected.
const KEY = 'giant_pending_writes'
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
const MAX_ATTEMPTS = 5

const listeners = new Set()

function read() {
  if (!isBrowser) return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function write(arr) {
  if (!isBrowser) return
  localStorage.setItem(KEY, JSON.stringify(arr))
  const n = arr.length
  listeners.forEach((l) => l(n))
}

export function pendingCount() {
  return read().length
}
export function onPendingChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// op = { kind: 'saveSession' | 'deleteSession', payload }  (payload always has .id)
// Dedupe by session id: the latest op for a given session wins (a save then a
// delete collapses to the delete; repeated saves keep only the newest).
export function enqueue(op) {
  const arr = read().filter((o) => o.payload.id !== op.payload.id)
  arr.push({ ...op, attempts: 0, queuedAt: Date.now() })
  write(arr)
}

// Replay queued ops via `executors[kind](payload)`. Removes ops that succeed;
// keeps network failures for the next flush; drops poison-pill ops after
// MAX_ATTEMPTS and reports them. Returns the number still pending.
export async function flush(executors) {
  let arr = read()
  if (!arr.length) return 0
  const remaining = []
  for (const op of arr) {
    try {
      await executors[op.kind](op.payload)
    } catch (e) {
      const attempts = (op.attempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        try {
          const { captureError } = await import('../monitoring.js')
          captureError(e, { droppedOp: op })
        } catch {
          /* ignore */
        }
      } else {
        remaining.push({ ...op, attempts })
      }
    }
  }
  write(remaining)
  return remaining.length
}
