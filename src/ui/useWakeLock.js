import { useEffect, useRef } from 'react'

// Keeps the screen awake while `active` is true (e.g. a session timer is running).
// Screen Wake Lock API (iOS 16.4+, Chrome, etc.); no-ops where unsupported or
// denied (e.g. Low Power Mode). The OS releases the lock when the app is
// backgrounded / the phone locks, so we re-acquire on visibility regain.
export function useWakeLock(active) {
  const lockRef = useRef(null)

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let cancelled = false

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // unsupported / denied (e.g. Low Power Mode) — silently skip
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const lock = lockRef.current
      lockRef.current = null
      if (lock) lock.release().catch(() => {})
    }
  }, [active])
}
