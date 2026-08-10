import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionSummary } from './session-summary'

// A fully-populated squat-hard session (top 130 → clean 85/90/95/100 ladder);
// tests override fields as needed. Accessory grid = the session's macro, keyed by cycle.
function base(over = {}) {
  return {
    id: '2026-10-05-squat',
    macroId: 'm4',
    date: '2026-10-05',
    cycle: 3,
    week: 1,
    weekType: 'training',
    dayType: 'squat',
    difficulty: 'hard',
    volumeDifficulty: 'hard',
    topReps: 2,
    topWeight: 130,
    rpe: 'R9',
    barSpeed: 'up',
    cardioCals: [null, null, null, null],
    blockCompletion: 'completed',
    volDone: true,
    volRpe: 'R8',
    volSpeed: 'normal',
    pullupCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRounds: 3,
    carryDistance: 30,
    carryRpe: 'R6',
    notes: 'felt strong',
    startedAt: '2026-10-05T09:00:00.000Z',
    endedAt: '2026-10-05T10:12:00.000Z',
    ...over,
  }
}
const ACC = { 3: { carry_squat: 68 } }

test('full squat day: header, ladder, completion, accessory, volume, carry, duration, notes', () => {
  assert.equal(
    sessionSummary(base(), 4, ACC),
    [
      'Session — M4C3W1 — Squat Hard — 05.10.2026',
      'Giant Block:',
      '  Top set: 130×2 | R9 | ↑',
      '  Sets: 8@110 · 6@117.5 · 4@122.5 · 2@130', // giantSets(130, hard)
      '  Completion: Completed as prescribed ✓',
      '  Ab-Roll: 10 reps (BW)',
      'Volume Block: 2×6 @ 105 | R8 | →', // volumeWeight(130) = 105, volumeDifficulty 'hard'
      'Carry: Sandbag Bear Hug 68 kg | 3×30m | R6', // cycle 3 = Carries — no Capability note
      'Duration: 72 min',
      'Notes: felt strong',
    ].join('\n')
  )
})

test('completion reason shows its categorical label; legacy blank = completed', () => {
  assert.match(sessionSummary(base({ blockCompletion: 'stopped_fatigue' }), 4, ACC), /\n {2}Completion: Stopped early — fatigue\n/)
  assert.match(sessionSummary(base({ blockCompletion: '' }), 4, ACC), /Completion: Completed as prescribed ✓/)
})

test('without accessory data: carry falls back to the descriptive default', () => {
  const out = sessionSummary(base(), 4) // no accessory arg
  assert.match(out, /\nCarry: Sandbag Bear Hug 68 kg \| 3×30m \| R6/) // DAY_META default load
})

test('carry mapping: DL = Farmer (per hand), OHP = Overhead, Bench = Suitcase (per hand)', () => {
  assert.match(sessionSummary(base({ dayType: 'deadlift', cycle: null, week: null }), 4), /\nCarry: Farmer's Carry 60 kg \/ hand \| 3×30m \| R6/)
  assert.match(sessionSummary(base({ dayType: 'ohp', cycle: null, week: null }), 4), /\nCarry: Overhead Carry 2 × 20 kg \| 3×30m \| R6/)
  assert.match(sessionSummary(base({ dayType: 'bench', cycle: null, week: null }), 4), /\nCarry: Suitcase Carry 50 kg \/ hand \| 3×30m \| R6/)
})

test('skipped carry shows the name + reason, drops detail', () => {
  const out = sessionSummary(base({ carrySkipped: true, carrySkipReason: 'fatigue' }), 4, ACC)
  assert.match(out, /\nCarry: Sandbag Bear Hug — skipped \(fatigue\)/)
  assert.doesNotMatch(out, /3×30m/)
})

test('incomplete volume + unlogged RPE/speed leave no residue', () => {
  const out = sessionSummary(base({ volDone: false, volRpe: '', volSpeed: '', rpe: '', barSpeed: '' }), 4, ACC)
  assert.match(out, /\n {2}Top set: 130×2\n/) // no trailing separators
  assert.match(out, /\nVolume Block: 2×6 @ 105 \| incomplete/)
})

test('untimed omits Duration; empty notes omitted; no top weight omits Sets line', () => {
  const out = sessionSummary(base({ startedAt: null, endedAt: null, notes: '', topWeight: null, topReps: null }), 4, ACC)
  assert.doesNotMatch(out, /Duration:|Notes:|Sets:/)
  assert.match(out, /\n {2}Top set: —/)
})

// ---- secondary lane (BB Row / Pull-ups) --------------------------------------

test('OHP day: BB Row ladder (reuses the db_row lane) + Leg Raises + Volume off its OWN (independent) difficulty', () => {
  const s = base({ id: '2026-08-14-ohp', date: '2026-08-14', cycle: 1, week: 1, dayType: 'ohp', difficulty: 'hard', volumeDifficulty: 'light', topWeight: 100, topReps: 2 })
  const W = { 1: { db_row: { hard: 60, medium: 57, light: 54 } } }
  const out = sessionSummary(s, 4, ACC, W)
  assert.match(out, /Session — M4C1W1 — OHP Hard — 14.08.2026/)
  assert.match(out, /\n {2}BB Row: 8@50 · 8@55 · 8@57.5 · 8@60\n/) // fixed reps (hard=8) off the row's own 60 kg anchor
  assert.match(out, /\n {2}Leg Raises: 12 reps \(BW\)\n/)
  // Volume reads volumeDifficulty ('light'), NOT the Giant block's difficulty ('hard').
  assert.match(out, /Volume Block: 2×10 @ 80/)
  assert.match(out, /\n {2}BB Row: 2×10 @ 42.5\n/) // 80% of the row's OWN light day-top (54)
})

test('bench day: Pull-ups two-mode — bodyweight cluster when no anchor is set', () => {
  const s = base({ id: '2026-08-11-bench', date: '2026-08-11', cycle: 1, week: 1, dayType: 'bench', difficulty: 'medium', volumeDifficulty: 'light', topWeight: 80, topReps: 3, pullupCluster: '6+4' })
  const out = sessionSummary(s, 4, ACC) // no weights grid -> pendlay_row anchor unset -> bodyweight mode
  assert.match(out, /\n {2}Pull-ups: 6\+4\n/)
  assert.match(out, /\n {2}Leg Raises: 12 reps \(BW\)\n/)
  assert.doesNotMatch(out, /Pull-ups \(wtd\)/)
})

test('bench day: Pull-ups weighted ladder replaces the cluster line when an anchor is set', () => {
  const s = base({ id: '2026-08-11-bench', date: '2026-08-11', cycle: 1, week: 1, dayType: 'bench', difficulty: 'hard', volumeDifficulty: 'light', topWeight: 80, pullupCluster: '6+4' })
  const W = { 1: { pendlay_row: { hard: 10, medium: 9.5, light: 9 } } }
  const out = sessionSummary(s, 4, ACC, W)
  assert.match(out, /\n {2}Pull-ups: 8@7.5 · 8@10 · 8@10 · 8@10\n/)
  assert.doesNotMatch(out, /Pull-ups: 6\+4/)
})

test('squat/deadlift train alone: no secondary line, Ab-Roll accessory', () => {
  const s = base({ id: '2026-08-10-squat', date: '2026-08-10', cycle: 1, week: 1, dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light', topWeight: 120 })
  const out = sessionSummary(s, 4, ACC)
  assert.doesNotMatch(out, /Row/)
  assert.match(out, /\n {2}Ab-Roll: 10 reps \(BW\)\n/)
})

test('accessory line honours the Setup rep target over the default', () => {
  const s = base({ id: '2026-08-10-squat', date: '2026-08-10', cycle: 1, week: 1, dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light' })
  const out = sessionSummary(s, 4, ACC, undefined, false, { ab_rollout: 15 })
  assert.match(out, /\n {2}Ab-Roll: 15 reps \(BW\)\n/)
})

// ---- C3 week 4 (no Volume block) --------------------------------------------

test('C3 week 4: no Volume block at all (flagged, not silently dropped)', () => {
  const s = base({ id: '2026-10-26-squat', date: '2026-10-26', cycle: 3, week: 4, dayType: 'squat', difficulty: 'hard', volumeDifficulty: null, topWeight: 130 })
  const out = sessionSummary(s, 4, ACC)
  assert.match(out, /Volume Block: none this week \(C3 week 4\)/)
  assert.doesNotMatch(out, /Volume Block: 2×/)
})

// ---- Capability block note ---------------------------------------------------

test('Capability note: flags Hypertrophy/Oly (not captured here), stays silent for Carries (already fully rendered above)', () => {
  const c1 = base({ id: '2026-08-10-squat', date: '2026-08-10', cycle: 1, week: 1, dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light' })
  assert.match(sessionSummary(c1, 4, ACC), /Hypertrophy: not included in this summary/)
  const c2 = base({ ...c1, id: '2026-09-07-squat', date: '2026-09-07', cycle: 2 })
  assert.match(sessionSummary(c2, 4, ACC), /Oly: not included in this summary/)
  const c3 = base({ ...c1, id: '2026-10-05-squat', date: '2026-10-05', cycle: 3 })
  const out3 = sessionSummary(c3, 4, ACC)
  assert.doesNotMatch(out3, /not included in this summary/)
})

// ---- deload week --------------------------------------------------------------

test('reactive-deload week: Deload header + ~70% context line, full body kept', () => {
  const out = sessionSummary(base(), 4, ACC, undefined, true)
  assert.match(out, /^Deload — M4C3W1 — Squat Hard — 05.10.2026\nGiant Block:\n {2}\(reactive deload week — loads ~70%\)\n/)
  assert.match(out, /Sets: 8@110/) // full logged body still present
  assert.match(out, /Carry: Sandbag Bear Hug/)
})

test('the scheduled end-of-macro deload is a REAL session summary, with no Volume Block line and no C3W4 note', () => {
  const s = base({
    id: '2026-11-02-squat',
    date: '2026-11-02',
    weekType: 'deload',
    cycle: null,
    week: null,
    dayType: 'squat',
    difficulty: 'hard',
    volumeDifficulty: null,
    topWeight: 84, // caller already applied the ~70% reduction before storing
    topReps: 2,
  })
  const out = sessionSummary(s, 4, ACC, undefined, true)
  assert.match(out, /^Deload — M4 · Deload — Squat Hard — 02.11.2026/)
  assert.match(out, /Sets: 8@72.5 · 6@75 · 4@80 · 2@84/) // the real computed ladder off the stored (already-reduced) top
  // No Volume Block line at all on deload — and no "none this week" note either
  // (that note is training-week-only; deload's absence needs no explanation).
  assert.doesNotMatch(out, /Volume Block/)
  assert.doesNotMatch(out, /not included in this summary/)
})
