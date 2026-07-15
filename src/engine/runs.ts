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
import { MACRO_WEEKS as BASE_MACRO_WEEKS } from './constants'
import {
  RUN_SLOT_BY_DOW,
  EASY_OFFSET_S,
  QUALITY_OFFSET_MIN_S,
  QUALITY_OFFSET_MAX_S,
  PACE_ROUND_S,
  PACE_DEGRADE_S,
  RUN_STRUCTURE,
  RUN_TERRAIN_NOTE,
} from './constants'
import type { RunStructureKey } from './constants'
import type { MacroShape, Run, RunSlot, RunSlotKey, RunType, RunSignalHits, Terrain, WeekType } from './types'

// ---- schedule ---------------------------------------------------------------

// Run-type letter for the human-readable id: "2026-07-14-run-E".
const RUN_ID_LETTER: Record<RunType, string> = { easy: 'E', quality: 'Q', long: 'L', tt: 'T' }
export function runIdFor(dateISO: string, runType: RunType): string {
  return `${dateISO}-run-${RUN_ID_LETTER[runType]}`
}

// The run scheduled for a date, or null when it isn't a run day (or is outside
// the macro). Uses corePosition — never duplicates the position math.
//   training:  Tue easy · Thu quality (easy during mesocycle 1) · Sat long
//   deload:    Tue/Thu optional short easy · FIRST deload week's Sat = the 5k
//              time trial (the macro's measurement — prescribed, not optional);
//              an extended second week's Sat is optional easy (TT happens once)
//   testing (legacy weeks=15 macros only): Sat = TT · Tue/Thu optional easy
export function runSlotFor(startISO: string, macroNumber: number, target: Date, shape: MacroShape = {}): RunSlot | null {
  const wd = target.getDay()
  const slot: RunSlotKey | undefined = RUN_SLOT_BY_DOW[wd]
  if (!slot) return null
  const p = corePosition(startISO, macroNumber, target, shape)
  if (p.beforeStart || p.complete) return null
  const weekType = p.weekType as WeekType
  const firstDeloadWeek = (shape.weeks ?? BASE_MACRO_WEEKS) - 1
  let runType: RunType
  let optional = false
  if (weekType === 'testing') {
    runType = slot === 'long' ? 'tt' : 'easy'
    optional = slot !== 'long'
  } else if (weekType === 'deload') {
    const isTT = slot === 'long' && p.weekIndex === firstDeloadWeek
    runType = isTT ? 'tt' : 'easy'
    optional = !isTT
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
export function runSlotsForWeek(startISO: string, macroNumber: number, weekIndex: number, shape: MacroShape = {}): RunSlot[] {
  const start = mondayOf(parseLocalDate(startISO))
  const out: RunSlot[] = []
  ;[1, 3, 5].forEach((offset) => {
    // Tue = Mon+1, Thu = Mon+3, Sat = Mon+5
    const d = new Date(start)
    d.setDate(start.getDate() + weekIndex * 7 + offset)
    const s = runSlotFor(startISO, macroNumber, d, shape)
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

// ---- structure descriptions ---------------------------------------------------

// Which RUN_STRUCTURE text a slot shows. The TT keeps its own text wherever it
// falls (it now lives on the deload week's Saturday); other deload-week and
// reactive-deload runs collapse to the pressure-free deload text; everything
// else is what the day RESOLVES to (a C1 Thursday resolves to easy).
export function runStructureKey(slot: RunSlot, deloadWeek: boolean): RunStructureKey {
  if (slot.runType === 'tt') return 'tt'
  if (slot.weekType === 'deload' || deloadWeek) return 'deload'
  return slot.runType
}

// The description shown on the run session view. In pace mode the computed
// guidance is appended (easy/long → easy pace, quality → the range); the TT
// pace is discovered/recorded, never prescribed, and deload stays pace-free.
// Talk-test mode returns the text verbatim. Terrain wording: quality/tt carry
// their standing terrain rule always; easy/long/deload gain the trail note
// only while the Trail toggle is selected (pace guidance is then moot but kept
// — the note explicitly overrides it).
export function runStructureText(key: RunStructureKey, refPaceS: number | null | undefined, terrain: Terrain = 'road'): string {
  let text = RUN_STRUCTURE[key]
  if (runMode(refPaceS) === 'pace') {
    const P = refPaceS as number
    if (key === 'easy' || key === 'long') text = `${text} Easy pace: ~${fmtPace(easyPace(P))} /km.`
    if (key === 'quality') {
      const [qMin, qMax] = qualityRange(P)
      text = `${text} Quality pace: ${fmtPace(qMin)}–${fmtPace(qMax)} /km.`
    }
  }
  if (key === 'quality') return `${text} ${RUN_TERRAIN_NOTE.quality}`
  if (key === 'tt') return `${text} ${RUN_TERRAIN_NOTE.tt}`
  if (terrain === 'trail') return `${text} ${RUN_TERRAIN_NOTE.trail}`
  return text
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
//      skipped, never guessed. ROAD runs only, on both sides: trail pace
//      varies with terrain, not fatigue, so a trail run is never judged
//      degraded and never serves as a baseline.
function paceAtHrDegraded(run: Run, priorRuns: Run[]): boolean {
  if (run.terrain === 'trail') return false
  const pace = derivedPaceS(run.distanceKm, run.durationS)
  if (pace == null || run.avgHr == null) return false
  // Most recent PRIOR road run of the same type that also has pace + HR.
  const baseline = priorRuns
    .filter(
      (r) =>
        r.terrain !== 'trail' &&
        r.runType === run.runType &&
        r.date < run.date &&
        r.avgHr != null &&
        derivedPaceS(r.distanceKm, r.durationS) != null
    )
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
