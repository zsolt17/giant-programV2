// Reactive deload rule (revised — brief §5; supersedes v7 book §7).
// Signals across a training week:
//   S1 any-day top set R9.5+        S2 volume block incomplete
//   S3 carry skipped due to fatigue  S5 bar speed ↓ on top set in 2+ sessions
//   (S4 Set1>R7 is notebook-only — the logger captures only the top set.)
// TRIGGER: 3+ total occurrences spanning at least 2 different sessions.
// (3 occurrences = severity; 2 sessions = a pattern, not one bad day.)

export function rpeNum(r) {
  if (!r) return 0
  return parseFloat(String(r).replace('R', '')) || 0
}

export function computeWeekSignals(weekSessions) {
  const types = new Set()
  let occurrences = 0
  const sessionsWithSignal = new Set()
  let downTopSets = 0

  for (const s of weekSessions) {
    let hit = false
    if (rpeNum(s.rpe) >= 9.5) {
      types.add('S1')
      occurrences++
      hit = true
    }
    if (s.volDone === false) {
      types.add('S2')
      occurrences++
      hit = true
    }
    if (s.carrySkipped && s.carrySkipReason === 'fatigue') {
      types.add('S3')
      occurrences++
      hit = true
    }
    if (s.barSpeed === 'down') downTopSets++
    if (hit) sessionsWithSignal.add(s.id)
  }

  // S5: top-set bar speed down in 2+ sessions this week (one week-level occurrence).
  if (downTopSets >= 2) {
    types.add('S5')
    occurrences++
    weekSessions.forEach((s) => {
      if (s.barSpeed === 'down') sessionsWithSignal.add(s.id)
    })
  }

  const fired = occurrences >= 3 && sessionsWithSignal.size >= 2
  return { types, occurrences, sessionCount: sessionsWithSignal.size, fired }
}

export function weekKeyFor(macroNumber, meso, week) {
  return `M${macroNumber}C${meso}W${week}`
}

// Max one reactive deload per mesocycle.
export function usedDeloadThisMeso(deloads, macroNumber, meso) {
  return Object.keys(deloads || {}).some((k) => k.startsWith(`M${macroNumber}C${meso}W`))
}

// Advise-and-confirm recommendation for the current week, based on the previous
// week's signals. Never fires if already deloaded, the meso cap is used, or a
// scheduled break is already covering this week (no deloading into a break).
export function shouldRecommendDeload({ prevWeekSessions, alreadyDeloaded, usedThisMeso, breakComing }) {
  if (alreadyDeloaded || usedThisMeso || breakComing) return false
  if (!prevWeekSessions || !prevWeekSessions.length) return false
  return computeWeekSignals(prevWeekSessions).fired
}
