// Loading math — rep schemes, percentages, rounding. Ported verbatim from
// index.html. Round to nearest 2.5 kg always.
import { SCHEMES, WU_PCT, WU_REPS, DAY_SPREAD, SET_LADDER, VOLUME_PCT } from './constants'
import type { Difficulty, Lift, Scheme, GiantSet, WarmupSet } from './types'

export const round = (w: number): number => Math.round(w / 2.5) * 2.5

export const fmt = (w: number | null | undefined): string => {
  if (w == null || Number.isNaN(w)) return '—'
  return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + ' kg'
}

export function schemeFor(difficulty: Difficulty): Scheme {
  return SCHEMES[difficulty]
}

// Single-anchor model: a day's top set = the Hard anchor × the day's spread,
// rounded. `lift` is an intentional seam — all four lifts currently share the same
// added-weight cascade, but dips may later compute off bodyweight + added load
// without changing call sites (add a `lift === 'dips'` branch here only).
export function dayTop(anchorHard: number, difficulty: Difficulty, lift?: Lift): number {
  void lift // reserved for the future dips-off-bodyweight path; identical for all lifts today
  return round(anchorHard * DAY_SPREAD[difficulty])
}

// The three day tops (Hard/Medium/Light) computed from one Hard anchor.
export function expandDayTops(anchorHard: number, lift?: Lift): Record<Difficulty, number> {
  return {
    hard: dayTop(anchorHard, 'hard', lift),
    medium: dayTop(anchorHard, 'medium', lift),
    light: dayTop(anchorHard, 'light', lift),
  }
}

// Giant Block: 4 sets off the day's top via the uniform SET_LADDER. Set 4 = the top
// (exact, not re-rounded); reps come from the difficulty's scheme.
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

// Barbell build-up sets, as percentages of Set 1.
export function warmupSets(top: number): WarmupSet[] {
  const s1 = set1Weight(top)
  return WU_PCT.map((pct, i) => ({ reps: WU_REPS[i], pct, weight: round(s1 * pct) }))
}

// Volume block = VOLUME_PCT of the day's top set.
export function volumeWeight(top: number): number {
  return round(top * VOLUME_PCT)
}

// Deload top set = ~70% of the working load (reactive deload).
export function deloadTop(top: number): number {
  return round(top * 0.7)
}
