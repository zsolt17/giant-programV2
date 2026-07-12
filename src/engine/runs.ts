// THE GIANT RUN — schedule + pace engine. Pure domain logic, framework-agnostic.
// Mirrors the lift engine's two invariants:
//   · The schedule is computed strictly from the macro start date via the SAME
//     corePosition math as lifts (strict-date model — never positioned manually).
//   · One anchor per macro: the reference pace P (seconds/km). P is never
//     rounded; every DERIVED prescription pace rounds to PACE_ROUND_S.
// Two-mode logic (same pattern as dips/pull-ups liftMode): no anchor → talk-test
// mode (type + distance only, no paces anywhere — the mesocycle-1 state); anchor
// set → pace mode with the offset cascade.
import { corePosition, parseLocalDate, isoLocal, mondayOf } from './date-engine'
import {
  RUN_SLOT_BY_DOW,
  EASY_OFFSET_S,
  QUALITY_OFFSET_MIN_S,
  QUALITY_OFFSET_MAX_S,
  PACE_ROUND_S,
  PACE_DEGRADE_S,
} from './constants'
import type { Run, RunSlot, RunSlotKey, RunType, RunSignalHits, WeekType } from './types'

// ---- schedule ---------------------------------------------------------------

// Run-type letter for the human-readable id: "2026-07-14-run-E".
const RUN_ID_LETTER: Record<RunType, string> = { easy: 'E', quality: 'Q', long: 'L', tt: 'T' }
export function runIdFor(dateISO: string, runType: RunType): string {
  return `${dateISO}-run-${RUN_ID_LETTER[runType]}`
}

// The run scheduled for a date, or null when it isn't a run day (or is outside
// the macro). Uses corePosition — never duplicates the position math.
//   training:  Tue easy · Thu quality (easy during mesocycle 1) · Sat long
//   testing:   Sat = 5k time trial · Tue/Thu = optional easy (or rest)
//   deload:    all three optional, short easy only
export function runSlotFor(startISO: string, macroNumber: number, target: Date): RunSlot | null {
  const wd = target.getDay()
  const slot: RunSlotKey | undefined = RUN_SLOT_BY_DOW[wd]
  if (!slot) return null
  const p = corePosition(startISO, macroNumber, target)
  if (p.beforeStart || p.complete) return null
  const weekType = p.weekType as WeekType
  let runType: RunType
  let optional = false
  if (weekType === 'testing') {
    runType = slot === 'long' ? 'tt' : 'easy'
    optional = slot !== 'long'
  } else if (weekType === 'deload') {
    runType = 'easy'
    optional = true
  } else {
    runType = slot === 'quality' && p.meso === 1 ? 'easy' : slot
  }
  return {
    date: isoLocal(new Date(target.getFullYear(), target.getMonth(), target.getDate())),
    weekIndex: p.weekIndex as number,
    weekType,
    cycle: p.meso ?? null,
    week: p.week ?? null,
    slot,
    runType,
    optional,
  }
}

// The three Tue/Thu/Sat run slots of one program week (for the Calendar's run row).
export function runSlotsForWeek(startISO: string, macroNumber: number, weekIndex: number): RunSlot[] {
  const start = mondayOf(parseLocalDate(startISO))
  const out: RunSlot[] = []
  ;[1, 3, 5].forEach((offset) => {
    // Tue = Mon+1, Thu = Mon+3, Sat = Mon+5
    const d = new Date(start)
    d.setDate(start.getDate() + weekIndex * 7 + offset)
    const s = runSlotFor(startISO, macroNumber, d)
    if (s) out.push(s)
  })
  return out
}

// ---- pace engine (two-mode, single per-macro anchor) -------------------------

// No anchor (null/0) → talk-test mode: prescriptions show type + distance only.
export function runMode(refPaceS: number | null | undefined): 'pace' | 'talk' {
  return refPaceS != null && refPaceS > 0 ? 'pace' : 'talk'
}

// Derived prescription paces round to the nearest PACE_ROUND_S; P never does.
export const roundPace = (s: number): number => Math.round(s / PACE_ROUND_S) * PACE_ROUND_S

export const easyPace = (refPaceS: number): number => roundPace(refPaceS + EASY_OFFSET_S)

// Quality pace is a range (shown as e.g. "5:15–5:40 /km"). Time trial = no
// prescribed pace (discovered, then recorded).
export const qualityRange = (refPaceS: number): [number, number] => [
  roundPace(refPaceS + QUALITY_OFFSET_MIN_S),
  roundPace(refPaceS + QUALITY_OFFSET_MAX_S),
]

// Actual pace of a logged run, in s/km — always derived, never stored/rounded.
export function derivedPaceS(distanceKm: number | null | undefined, durationS: number | null | undefined): number | null {
  if (distanceKm == null || durationS == null || !(distanceKm > 0) || !(durationS > 0)) return null
  return durationS / distanceKm
}

// ---- formatting / parsing ----------------------------------------------------

// 335 -> "5:35" (pace or short duration). Null-safe like loading.fmt.
export function fmtPace(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return '—'
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Duration display: "42:30", or "1:02:10" from an hour up.
export function fmtRunDuration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return '—'
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

// "5:35" -> 335 · "1:02:10" -> 3730 · "42" -> 2520 (bare minutes) · junk -> null.
// Used for both the Setup pace input and the run-log duration input. Those render
// the iOS DECIMAL keypad (digits + . only — the numeric pad has no colon), so the
// separator also accepts "." / "," ("5.35" -> 5:35), and a bare digit string of
// 3+ digits reads its last two digits as seconds ("535" -> 5:35, "4530" -> 45:30,
// "10230" -> 1:02:30). 1–2 bare digits stay whole minutes.
export function parseClock(text: string | null | undefined): number | null {
  const t = (text || '').trim().replace(/[.,]/g, ':')
  if (!t) return null
  if (/^\d+$/.test(t)) {
    if (t.length <= 2) return Number(t) * 60 // bare minutes
    const sec = Number(t.slice(-2))
    if (sec > 59) return null
    const rest = t.slice(0, -2)
    if (rest.length <= 2) return Number(rest) * 60 + sec
    const min = Number(rest.slice(-2))
    if (min > 59) return null
    return Number(rest.slice(0, -2)) * 3600 + min * 60 + sec
  }
  if (!/^\d+(:[0-5]?\d){1,2}$/.test(t)) return null
  const parts = t.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

// ---- run deload signals (pooled into the weekly lift signals) -----------------
// R1 — run cut short due to fatigue (completion control)
// R2 — felt heavy / talk test failed (completion control)
// R3 — pace-at-HR degraded on 2+ runs this week (ONE week-level occurrence,
//      mirrors the lifts' S5). Only evaluated when avg HR is logged — a run
//      without HR (or with no prior same-type HR run to compare against) is
//      skipped, never guessed.
function paceAtHrDegraded(run: Run, priorRuns: Run[]): boolean {
  const pace = derivedPaceS(run.distanceKm, run.durationS)
  if (pace == null || run.avgHr == null) return false
  // Most recent PRIOR run of the same type that also has pace + HR.
  const baseline = priorRuns
    .filter((r) => r.runType === run.runType && r.date < run.date && r.avgHr != null && derivedPaceS(r.distanceKm, r.durationS) != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (!baseline) return false
  const basePace = derivedPaceS(baseline.distanceKm, baseline.durationS) as number
  return pace >= basePace + PACE_DEGRADE_S && run.avgHr >= (baseline.avgHr as number)
}

// `priorRuns` = earlier logged runs (any weeks) used as the R3 baseline pool;
// runs dated within the week are compared only against strictly earlier dates.
export function computeRunSignalHits(weekRuns: Run[], priorRuns: Run[] = []): RunSignalHits {
  const types = new Set<string>()
  let occurrences = 0
  const runIds = new Set<string>()

  const degraded: Run[] = []
  for (const r of weekRuns) {
    if (r.completion === 'cut_fatigue') {
      types.add('R1')
      occurrences++
      runIds.add(r.id)
    }
    if (r.completion === 'felt_heavy') {
      types.add('R2')
      occurrences++
      runIds.add(r.id)
    }
    if (paceAtHrDegraded(r, priorRuns)) degraded.push(r)
  }
  if (degraded.length >= 2) {
    types.add('R3')
    occurrences++
    degraded.forEach((r) => runIds.add(r.id))
  }
  return { types, occurrences, runIds }
}
