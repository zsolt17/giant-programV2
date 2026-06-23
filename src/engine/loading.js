// Loading math — rep schemes, percentages, rounding. Ported verbatim from
// index.html. Round to nearest 2.5 kg always.
import { SCHEMES, WU_PCT, WU_REPS } from './constants.js'

export const round = (w) => Math.round(w / 2.5) * 2.5

export const fmt = (w) => {
  if (w == null || Number.isNaN(w)) return '—'
  return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + ' kg'
}

export function schemeFor(difficulty) {
  return SCHEMES[difficulty]
}

// Giant Block: 4 sets. Set 4 = the top set (100%, exact). Others = round(top*pct).
// Returns [{ set, reps, pct, weight, isTop }].
export function giantSets(top, difficulty) {
  const scheme = SCHEMES[difficulty]
  return scheme.pct.map((pct, i) => {
    const isTop = i === 3
    return {
      set: i + 1,
      reps: scheme.sets[i],
      pct,
      weight: isTop ? top : round(top * pct),
      isTop,
    }
  })
}

// Set 1 weight (build-up sets are percentages of this).
export function set1Weight(top, difficulty) {
  return round(top * SCHEMES[difficulty].pct[0])
}

// Barbell build-up sets, as percentages of Set 1.
export function warmupSets(top, difficulty) {
  const s1 = set1Weight(top, difficulty)
  return WU_PCT.map((pct, i) => ({ reps: WU_REPS[i], pct, weight: round(s1 * pct) }))
}

// Volume block = 80% of the top set.
export function volumeWeight(top) {
  return round(top * 0.8)
}

// Deload top set = ~70% of the working load (reactive deload).
export function deloadTop(top) {
  return round(top * 0.7)
}
