// Pure formatting of a logged Session into the plain-text summary tuned for
// pasting into a coaching conversation (NOT for in-app display). Framework-agnostic
// and unit-tested. Captures the complete session picture: the Giant Block set
// ladder comes from the SAME loading-engine computation Today renders (giantSets/
// volumeWeight), never re-derived. Non-applicable / unlogged lines are omitted.
import { LIFT_SHORT, SCHEMES, DAY_META, SECONDARY_ITEM, BLOCK_COMPLETION, RUN_TYPE_LABEL, RUN_COMPLETION } from './constants'
import { giantSets, volumeWeight, liftMode, fmt } from './loading'
import { derivedPaceS, fmtPace, fmtRunDuration } from './runs'
import type { Session, Lift, AccessoryByCycle, WeightsByCycle, TestingResult, Run } from './types'
import type { DayMeta } from './types'

// 'up' -> ↑, 'down' -> ↓, 'normal' -> →; blank -> '' (no stray arrow when unlogged).
function arrow(speed: string): string {
  return speed === 'up' ? '↑' : speed === 'down' ? '↓' : speed === 'normal' ? '→' : ''
}

// Stored RPE already carries the leading "R" (e.g. "R9.5"); keep it as-is, but
// guard blanks (return '' so the segment is dropped, not "R").
function rpeStr(rpe: string): string {
  return rpe ? (rpe.startsWith('R') ? rpe : `R${rpe}`) : ''
}

// "2026-06-22" -> "22.06.2026". Pass-through for anything unexpected.
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

const liftLabel = (l: Lift | null): string => (l ? LIFT_SHORT[l] : '—')
const kg = (n: number): string => (n % 1 === 0 ? String(n) : n.toFixed(1))
// Reps text for the weighted secondaries (mirrors controls.secondaryDesc).
const SECONDARY_REPS: Partial<Record<DayMeta['secondaryType'], string>> = { rdl: '8/leg', lunge: '8/leg', dbrow: '10/arm' }

// Derived duration in whole minutes, or null when either timestamp is missing.
function durationMin(s: Session): number | null {
  if (!s.startedAt || !s.endedAt) return null
  const ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.round(ms / 60000)
}

// Per-round cardio cals as "15/14/–/15" (unfilled rounds → "–"); '' when none logged.
function cardioStr(cals: (number | null)[]): string {
  if (!cals || !cals.some((c) => c != null)) return ''
  return cals.map((c) => (c == null ? '–' : String(c))).join('/')
}

// Join present segments with " | " (drops blanks so unlogged RPE/speed leave no residue).
const seg = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(' | ')

// Split the "Vol: R8→" suffix the test view appends to result notes (it has no
// structured volume fields) back out of the free text: { vol, rest }.
export function splitVolNote(notes: string): { vol: string | null; rest: string } {
  const m = /(?:\s*·\s*)?Vol:\s*([^·]*)$/.exec(notes || '')
  if (!m) return { vol: null, rest: (notes || '').trim() }
  return { vol: m[1].trim() || null, rest: (notes || '').slice(0, m.index).trim() }
}

// `accessory` = the per-cycle grid for the SESSION'S macro (cycle -> item -> weight);
// resolves the recorded secondary + carry weights. `weights` = the same macro's
// working-weight grid — resolves the weighted pull-up ladder. Both optional —
// lines degrade gracefully without them. `deloadWeek` marks a reactive-deload
// training week (from the deloads map): the header flips to "Deload — …" and a
// ~70% context line is added; the full logged body is kept.
export function sessionSummary(s: Session, macroNumber: number, accessory?: AccessoryByCycle, weights?: WeightsByCycle, deloadWeek?: boolean): string {
  // Legacy/hypothetical weekType 'deload' rows (W15): minimal format — the app
  // never writes these today, but the schema allows them.
  if (s.weekType === 'deload') return w15DeloadSummary(s, macroNumber)

  const lines: string[] = []
  const meta = s.dayType ? DAY_META[s.dayType] : null
  const acc = s.cycle != null ? accessory?.[s.cycle] : undefined
  // Bodyweight-mode dips: no load — the session's stamped top is 0/null.
  const dipsBW = s.dayType === 'dips' && liftMode(s.topWeight) === 'bodyweight'

  // Header: "Session — M2C1W1 — Squat Hard — 22.06.2026" ("Deload — …" on a
  // reactive-deload week). Testing rows (null cycle/week) degrade to the week type.
  const pos =
    s.cycle != null && s.week != null
      ? `M${macroNumber}C${s.cycle}W${s.week}`
      : `M${macroNumber} · ${s.weekType.charAt(0).toUpperCase() + s.weekType.slice(1)}`
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  lines.push(`${deloadWeek ? 'Deload' : 'Session'} — ${pos} — ${liftLabel(s.dayType)}${diff} — ${fmtDate(s.date)}`)

  // ---- Giant Block ----------------------------------------------------------
  lines.push('Giant Block:')
  if (deloadWeek) lines.push('  (reactive deload week — loads ~70%)')
  const top = dipsBW ? 'BW' : s.topWeight != null && s.topReps != null ? `${kg(s.topWeight)}×${s.topReps}` : '—'
  lines.push(`  Top set: ${seg(top, rpeStr(s.rpe), arrow(s.barSpeed))}`)

  // Full computed set ladder for the day (same engine call Today renders, at the
  // lift's own rounding increment). Bodyweight-mode dips have no ladder.
  if (s.topWeight != null && s.topWeight > 0 && s.difficulty) {
    const sets = giantSets(s.topWeight, s.difficulty, s.dayType ?? undefined)
    lines.push(`  Sets: ${sets.map((g) => `${g.reps}@${kg(g.weight)}`).join(' · ')}`)
  }
  // Bodyweight-mode dips log a final-round cluster instead of loads.
  if (dipsBW && s.dipsCluster) lines.push(`  Dips cluster: ${s.dipsCluster}`)

  // Adherence (legacy null was mapped to 'completed' by the data layer).
  const completion =
    !s.blockCompletion || s.blockCompletion === 'completed'
      ? 'Completed as prescribed ✓'
      : BLOCK_COMPLETION.find((o) => o.id === s.blockCompletion)?.label || s.blockCompletion
  lines.push(`  Completion: ${completion}`)

  // Weighted secondary (lunge/row/RDL days) with its recorded per-cycle weight;
  // dips day is bodyweight pull-ups — the cluster line below covers it.
  if (meta && s.dayType) {
    const reps = SECONDARY_REPS[meta.secondaryType]
    if (reps) {
      const item = SECONDARY_ITEM[s.dayType]
      const w = item ? acc?.[item] : null
      lines.push(`  Secondary: ${meta.secondary}${w != null ? ` ${kg(w)}kg` : ''} × ${reps}`)
    }
  }

  // Pull-ups (dips day only — the dips-day Giant Block secondary). Weighted mode
  // (anchor > 0 for the session's cycle) shows the computed ladder; bodyweight
  // mode shows the logged final-round cluster.
  if (s.dayType === 'dips') {
    const pullupCell = s.cycle != null ? weights?.[s.cycle]?.pullup : undefined
    if (pullupCell && liftMode(pullupCell.hard) === 'weighted' && s.difficulty && pullupCell[s.difficulty] != null) {
      const sets = giantSets(pullupCell[s.difficulty] as number, s.difficulty, 'pullup')
      lines.push(`  Pull-ups (wtd): ${sets.map((g) => `${g.reps}@${kg(g.weight)}`).join(' · ')}`)
    } else if (s.pullupCluster) {
      lines.push(`  Pull-ups: ${s.pullupCluster}`)
    }
  }

  const cardio = cardioStr(s.cardioCals)
  if (cardio) lines.push(`  Cardio: ${cardio}`)

  // ---- Volume Block -----------------------------------------------------------
  if (s.difficulty) {
    const scheme = SCHEMES[s.difficulty]
    const rx =
      s.dayType === 'dips'
        ? `Push-ups 2×${scheme.vol} (BW)`
        : `2×${scheme.vol}${s.topWeight != null ? ` @ ${kg(volumeWeight(s.topWeight, s.dayType ?? undefined))}` : ''}`
    lines.push(`Volume Block: ${seg(rx, rpeStr(s.volRpe), arrow(s.volSpeed), s.volDone === false ? 'incomplete' : '')}`)
  }

  // ---- Carry ------------------------------------------------------------------
  if (meta && s.dayType) {
    const w = acc?.[`carry_${s.dayType}`]
    const load = w != null ? `${fmt(w)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load
    if (s.carrySkipped) {
      lines.push(`Carry: ${meta.carry.name} — skipped${s.carrySkipReason ? ` (${s.carrySkipReason})` : ''}`)
    } else if (s.carryRounds != null || s.carryDistance != null || s.carryRpe) {
      const rounds = s.carryRounds ?? '—'
      const dist = s.carryDistance != null ? `${s.carryDistance}m` : '—'
      lines.push(`Carry: ${seg(`${meta.carry.name} ${load}`, `${rounds}×${dist}`, rpeStr(s.carryRpe))}`)
    }
  }

  // Duration (omitted when untimed).
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)

  // Notes (omitted when empty).
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)

  return lines.join('\n')
}

// Minimal W15 end-of-macro deload format (Giant Block only at 50–60%, no volume,
// no carry). Only reachable for weekType 'deload' session rows.
function w15DeloadSummary(s: Session, macroNumber: number): string {
  const lines: string[] = []
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  lines.push(`Deload — M${macroNumber} W15 — ${liftLabel(s.dayType)}${diff} — ${fmtDate(s.date)}`)
  const top = s.topWeight != null && s.topReps != null ? `top ${kg(s.topWeight)}×${s.topReps}` : ''
  const detail = seg(top, rpeStr(s.rpe), arrow(s.barSpeed))
  lines.push(`Giant Block @ ~50–60%${detail ? `: ${detail}` : ''}`)
  lines.push('No volume, no carry (deload)')
  const dur = durationMin(s)
  if (dur != null) lines.push(`Duration: ${dur} min`)
  if (s.notes && s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)
  return lines.join('\n')
}

// Giant Run summary (Data page copy format):
//   Run — M2C1W2 — Easy — 14.07.2026
//   5.2 km in 33:00 → 6:20/km | avg HR 148
//   Completion: Completed ✓
//   Notes: …
// Special weeks degrade the position segment like sessionSummary; unlogged
// distance/duration segments are dropped, never faked. Pace is derived here
// with the same engine call the UI renders — never re-computed differently.
export function runSummary(r: Run, macroNumber: number): string {
  const lines: string[] = []
  const pos =
    r.cycle != null && r.week != null
      ? `M${macroNumber}C${r.cycle}W${r.week}`
      : `M${macroNumber} · ${r.weekType.charAt(0).toUpperCase() + r.weekType.slice(1)}`
  lines.push(`Run — ${pos} — ${RUN_TYPE_LABEL[r.runType]} — ${fmtDate(r.date)}`)

  const pace = derivedPaceS(r.distanceKm, r.durationS)
  const dist = r.distanceKm != null ? `${kg(r.distanceKm)} km` : ''
  const dur = r.durationS != null ? `in ${fmtRunDuration(r.durationS)}` : ''
  const paceSeg = pace != null ? `→ ${fmtPace(pace)}/km` : ''
  // Trail marks the pace as terrain-paced; road is the default and stays unmarked.
  const terrainSeg = r.terrain === 'trail' ? '· Trail' : ''
  const hrSeg = r.avgHr != null ? `| avg HR ${r.avgHr}` : ''
  const logLine = [dist, dur, paceSeg, terrainSeg, hrSeg].filter(Boolean).join(' ')
  if (logLine) lines.push(logLine)

  const completion =
    !r.completion || r.completion === 'completed'
      ? 'Completed ✓'
      : RUN_COMPLETION.find((o) => o.id === r.completion)?.label || r.completion
  lines.push(`Completion: ${completion}`)

  // Post-run Bulletproof circuit — shown when done, omitted when not (no residue).
  if (r.bulletproof) lines.push('Bulletproof: ✓')

  if (r.notes && r.notes.trim()) lines.push(`Notes: ${r.notes.trim()}`)
  return lines.join('\n')
}

// Testing-day summary, built from a testing_results row (tests never create a
// sessions row). The ramp comes from the C3 Hard anchor via the same engine calls
// the test view renders; the volume line is reconstructed from the "Vol:" suffix
// the test view stores inside the notes. No Duration line — testing_results has
// no timestamps. `week` = the macro-relative week number (13/14), null to omit.
export function testSummary(r: TestingResult, macroNumber: number, week: number | null, weights?: WeightsByCycle): string {
  const lines: string[] = []
  const lift = r.lift as Lift
  const label = LIFT_SHORT[lift] || r.lift
  lines.push(`Test — M${macroNumber}${week != null ? ` W${week}` : ''} — ${label} — ${fmtDate(r.testedOn || '')}`)

  // Ramp = sets 1–3 of the hard ladder off the C3 anchor (per-lift rounding).
  const c3Hard = weights?.[3]?.[r.lift]?.hard
  if (c3Hard != null && c3Hard > 0) {
    const ramp = giantSets(c3Hard, 'hard', lift)
      .slice(0, 3)
      .map((g) => `${g.reps}@${kg(g.weight)}`)
      .join(' · ')
    lines.push(`Warm-up + Giant Block ramp: ${ramp}`)
  }

  const result = r.weight != null || r.reps != null ? `${r.weight != null ? kg(r.weight) : '—'}×${r.reps ?? '—'}` : '—'
  lines.push(`TEST RESULT: ${result}`)

  const { vol, rest } = splitVolNote(r.notes || '')
  if (vol) {
    const volRx = c3Hard != null && c3Hard > 0 ? `2×6 @ ${kg(volumeWeight(c3Hard, lift))}` : '2×6 @ 80%'
    lines.push(`Volume Block: ${volRx} | ${vol}`)
  }

  lines.push('No carry (testing week)')
  if (rest) lines.push(`Notes: ${rest}`)
  return lines.join('\n')
}
