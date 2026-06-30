// Pure phase/day math for Recovery > Tendon Health. Computed from LOCAL dates
// (date-engine helpers) — never UTC — to match the rest of the app's date
// discipline. See recovery-content.ts for the static exercise content.
import { parseLocalDate, todayISO } from './date-engine'
import type { Phase } from './recovery-content'

// Whole local days from start_date to today (start day = 0).
export function daysSinceStart(startISO: string, todayIso: string = todayISO()): number {
  const start = parseLocalDate(startISO).getTime()
  const today = parseLocalDate(todayIso).getTime()
  return Math.floor((today - start) / 86_400_000)
}

// "Day N of protocol" — day 1 = the start date.
export function protocolDay(startISO: string, todayIso: string = todayISO()): number {
  return daysSinceStart(startISO, todayIso) + 1
}

// Auto-suggested phase from the local day count (spec §3): 0–20 acute, 21–56 build, 57+ maintenance.
export function suggestedPhase(startISO: string, todayIso: string = todayISO()): Phase {
  const d = daysSinceStart(startISO, todayIso)
  if (d <= 20) return 'acute'
  if (d <= 56) return 'build'
  return 'maintenance'
}

// Effective phase = the manual override when set, else the auto-suggestion.
export function effectivePhase(startISO: string, override: Phase | null | undefined, todayIso: string = todayISO()): Phase {
  return override ?? suggestedPhase(startISO, todayIso)
}
