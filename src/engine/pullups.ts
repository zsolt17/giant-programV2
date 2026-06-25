// Pull-up cluster helpers (phase 1 — bodyweight, chasing unbroken).
// On OHP day the antagonist is pull-ups; the athlete logs the FINAL Giant Block
// round's cluster, e.g. "6+4" -> "7+3" -> "10", tracked as a trend tightening
// toward unbroken at the difficulty target (hard 10 / medium 8 / light 6).

// "6+4" -> [6, 4]. Tolerant of spaces; ignores empty/non-positive parts.
export function parseCluster(str: string | null | undefined): number[] {
  if (!str) return []
  return String(str)
    .split('+')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export function clusterTotal(str: string | null | undefined): number {
  return parseCluster(str).reduce((a, b) => a + b, 0)
}

// Unbroken = completed in a single cluster (no "+").
export function isUnbroken(str: string | null | undefined): boolean {
  return parseCluster(str).length === 1
}

// At/above the difficulty target total.
export function meetsTarget(str: string | null | undefined, target: number): boolean {
  return clusterTotal(str) >= target
}
