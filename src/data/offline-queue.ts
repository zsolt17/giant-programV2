// Durable offline write queue. Session/run saves & deletes made while offline
// are stored in localStorage and replayed when back online. Replay is safe
// because these writes are idempotent (upsert by id). Browser-only — guarded so
// the Node smoke test (no window/localStorage) is unaffected.
const KEY = 'giant_pending_writes'
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
const MAX_ATTEMPTS = 5

export type QueueKind = 'saveSession' | 'deleteSession' | 'saveRun' | 'deleteRun'
export interface QueueOp {
  kind: QueueKind
  // Serialized write payload (a session row, or { id } for a delete). Dynamic JSON
  // boundary, so typed loosely; always carries an `id`.
  payload: { id: string; [k: string]: any }
  attempts?: number
  queuedAt?: number
}
export type QueueExecutors = Record<QueueKind, (payload: any) => Promise<void>>

const listeners = new Set<(n: number) => void>()

function read(): QueueOp[] {
  if (!isBrowser) return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as QueueOp[]
  } catch {
    return []
  }
}
function write(arr: QueueOp[]): void {
  if (!isBrowser) return
  localStorage.setItem(KEY, JSON.stringify(arr))
  const n = arr.length
  listeners.forEach((l) => l(n))
}

export function pendingCount(): number {
  return read().length
}
export function onPendingChange(cb: (n: number) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// Dedupe by session id: the latest op for a given session wins (a save then a
// delete collapses to the delete; repeated saves keep only the newest).
export function enqueue(op: QueueOp): void {
  const arr = read().filter((o) => o.payload.id !== op.payload.id)
  arr.push({ ...op, attempts: 0, queuedAt: Date.now() })
  write(arr)
}

// Replay queued ops via `executors[kind](payload)`. Removes ops that succeed;
// keeps network failures for the next flush; drops poison-pill ops after
// MAX_ATTEMPTS and reports them. Returns the number still pending.
export async function flush(executors: QueueExecutors): Promise<number> {
  const arr = read()
  if (!arr.length) return 0
  const remaining: QueueOp[] = []
  for (const op of arr) {
    try {
      await executors[op.kind](op.payload)
    } catch (e) {
      const attempts = (op.attempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        try {
          const { captureError } = await import('../monitoring')
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
