// Loading math — the single-anchor cascade. Derived loads round to 2.5 kg
// (DEFAULT_INCREMENT — all GiantFit lifts are barbell moves; the Giant-era
// 0.5 kg dips/pull-up increment is retired). The Hard-top ANCHOR is never
// rounded — user input stays exactly as entered; rounding applies only to
// derived values.
import { SCHEMES, WU_PCT, WU_REPS, DAY_SPREAD, SET_LADDER, VOLUME_PCT, DEFAULT_INCREMENT } from './constants'
import type { Difficulty, Scheme, GiantSet, WarmupSet } from './types'

export const round = (w: number, inc: number = DEFAULT_INCREMENT): number => Math.round(w / inc) * inc

export const fmt = (w: number | null | undefined): string => {
  if (w == null || Number.isNaN(w)) return '—'
  return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + ' kg'
}

export function schemeFor(difficulty: Difficulty): Scheme {
  return SCHEMES[difficulty]
}

// LEGACY (Giant-era two-mode dips/pull-ups): a zero/empty anchor meant
// bodyweight/unbroken mode (cluster logging), any weight the full cascade.
// Kept ONLY so pre-GiantFit dips-day sessions keep rendering in History /
// the Calendar modal — no new-session or Setup logic may use it.
export function liftMode(anchor: number | null | undefined): 'weighted' | 'bodyweight' {
  return anchor != null && anchor > 0 ? 'weighted' : 'bodyweight'
}

// Single-anchor model: a day's top set = the Hard anchor × the day's spread.
// The Hard day IS the anchor — returned exactly, never rounded.
export function dayTop(anchorHard: number, difficulty: Difficulty): number {
  if (difficulty === 'hard') return anchorHard
  return round(anchorHard * DAY_SPREAD[difficulty])
}

// The three day tops (Hard/Medium/Light) computed from one Hard anchor.
export function expandDayTops(anchorHard: number): Record<Difficulty, number> {
  return {
    hard: dayTop(anchorHard, 'hard'),
    medium: dayTop(anchorHard, 'medium'),
    light: dayTop(anchorHard, 'light'),
  }
}

// Giant Block: 4 sets off the day's top via the uniform SET_LADDER. Set 4 = the
// top (exact, not re-rounded); reps per difficulty.
export function giantSets(top: number, difficulty: Difficulty): GiantSet[] {
  const reps = SCHEMES[difficulty].sets
  return SET_LADDER.map((pct, i) => {
    const isTop = i === SET_LADDER.length - 1
    return {
      set: i + 1,
      reps: reps[i],
      pct,
      weight: isTop ? top : round(top * pct),
      isTop,
    }
  })
}

// Set 1 weight (build-up sets are percentages of this) = first rung of the ladder.
export function set1Weight(top: number): number {
  return round(top * SET_LADDER[0])
}

// Barbell build-up sets, as percentages of Set 1. At small loads some values may
// round to 0 — that's an empty bar/bodyweight (callers display "BW").
export function warmupSets(top: number): WarmupSet[] {
  const s1 = set1Weight(top)
  return WU_PCT.map((pct, i) => ({ reps: WU_REPS[i], pct, weight: round(s1 * pct) }))
}

// Volume block = VOLUME_PCT of the day's top set.
export function volumeWeight(top: number): number {
  return round(top * VOLUME_PCT)
}

// Deload top set = ~70% of the working load.
export function deloadTop(top: number): number {
  return round(top * 0.7)
}

// Testing-day guidance ceiling: ~+5% over the C3 Hard anchor. Guidance only —
// test results are recorded, never prescribed. (LEGACY testing weeks.)
export function testCeiling(anchor: number): number {
  return round(anchor * 1.05)
}
