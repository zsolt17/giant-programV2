// Loading math — the single-anchor cascade with PER-LIFT rounding. Barbell lifts
// (DL/OHP/Squat) round derived loads to 2.5 kg; dips and pull-ups to 0.5 kg
// (LOAD_INCREMENT). The Hard-top ANCHOR is never rounded — user input stays
// exactly as entered; rounding applies only to derived values.
import { SCHEMES, WU_PCT, WU_REPS, DAY_SPREAD, SET_LADDER, VOLUME_PCT, LOAD_INCREMENT, DEFAULT_INCREMENT } from './constants'
import type { Difficulty, AnchorLift, Scheme, GiantSet, WarmupSet } from './types'

export const round = (w: number, inc: number = DEFAULT_INCREMENT): number => Math.round(w / inc) * inc

// The rounding increment for a lift's derived loads (2.5 kg default).
export const incFor = (lift?: AnchorLift): number => (lift ? LOAD_INCREMENT[lift] : DEFAULT_INCREMENT)

export const fmt = (w: number | null | undefined): string => {
  if (w == null || Number.isNaN(w)) return '—'
  return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + ' kg'
}

export function schemeFor(difficulty: Difficulty): Scheme {
  return SCHEMES[difficulty]
}

// Two-mode logic for dips and pull-ups: a zero/empty anchor means bodyweight/
// unbroken mode (cluster logging, PULLUP targets); any weight means the full
// standard cascade. Determined purely by the anchor value — no separate toggle.
export function liftMode(anchor: number | null | undefined): 'weighted' | 'bodyweight' {
  return anchor != null && anchor > 0 ? 'weighted' : 'bodyweight'
}

// Single-anchor model: a day's top set = the Hard anchor × the day's spread,
// rounded at the LIFT'S increment. The Hard day IS the anchor — returned exactly,
// never rounded (a 1 kg dips anchor must stay 1 kg, not snap to a plate step).
export function dayTop(anchorHard: number, difficulty: Difficulty, lift?: AnchorLift): number {
  if (difficulty === 'hard') return anchorHard
  return round(anchorHard * DAY_SPREAD[difficulty], incFor(lift))
}

// The three day tops (Hard/Medium/Light) computed from one Hard anchor.
export function expandDayTops(anchorHard: number, lift?: AnchorLift): Record<Difficulty, number> {
  return {
    hard: dayTop(anchorHard, 'hard', lift),
    medium: dayTop(anchorHard, 'medium', lift),
    light: dayTop(anchorHard, 'light', lift),
  }
}

// Giant Block: 4 sets off the day's top via the uniform SET_LADDER, rounded at the
// lift's increment. Set 4 = the top (exact, not re-rounded); reps per difficulty.
export function giantSets(top: number, difficulty: Difficulty, lift?: AnchorLift): GiantSet[] {
  const reps = SCHEMES[difficulty].sets
  const inc = incFor(lift)
  return SET_LADDER.map((pct, i) => {
    const isTop = i === SET_LADDER.length - 1
    return {
      set: i + 1,
      reps: reps[i],
      pct,
      weight: isTop ? top : round(top * pct, inc),
      isTop,
    }
  })
}

// Set 1 weight (build-up sets are percentages of this) = first rung of the ladder.
export function set1Weight(top: number, lift?: AnchorLift): number {
  return round(top * SET_LADDER[0], incFor(lift))
}

// Barbell build-up sets, as percentages of Set 1, at the lift's increment. At small
// dips loads some values round to 0 — that's bodyweight (callers display "BW").
export function warmupSets(top: number, lift?: AnchorLift): WarmupSet[] {
  const s1 = set1Weight(top, lift)
  const inc = incFor(lift)
  return WU_PCT.map((pct, i) => ({ reps: WU_REPS[i], pct, weight: round(s1 * pct, inc) }))
}

// Volume block = VOLUME_PCT of the day's top set, at the lift's increment.
export function volumeWeight(top: number, lift?: AnchorLift): number {
  return round(top * VOLUME_PCT, incFor(lift))
}

// Deload top set = ~70% of the working load, at the lift's increment.
export function deloadTop(top: number, lift?: AnchorLift): number {
  return round(top * 0.7, incFor(lift))
}
