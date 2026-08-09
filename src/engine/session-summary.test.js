import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionSummary, testSummary, runSummary, splitVolNote } from './session-summary'

// A fully-populated squat-hard session (top 130 → clean 85/90/95/100 ladder);
// tests override fields as needed. Accessory grid = the session's macro, keyed by cycle.
function base(over = {}) {
  return {
    id: '2026-06-22-squat-H',
    macroId: 'm2',
    date: '2026-06-22',
    cycle: 3,
    week: 3,
    weekType: 'training',
    dayType: 'squat',
    difficulty: 'hard',
    topReps: 2,
    topWeight: 130,
    rpe: 'R9',
    barSpeed: 'up',
    cardioCals: [15, 14, 15, 15],
    blockCompletion: 'completed',
    volDone: true,
    volRpe: 'R8',
    volSpeed: 'normal',
    pullupCluster: '',
    dipsCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRounds: 3,
    carryDistance: 30,
    carryRpe: 'R6',
    notes: 'felt strong',
    startedAt: '2026-06-22T09:00:00.000Z',
    endedAt: '2026-06-22T10:12:00.000Z',
    ...over,
  }
}
const ACC = { 3: { rdl_squat: 30, carry_squat: 68 } }

test('full squat day: header, ladder from the loading engine, completion, secondary, volume, carry, duration, notes', () => {
  assert.equal(
    sessionSummary(base(), 2, ACC),
    [
      'Session — M2C3W3 — Squat Hard — 22.06.2026',
      'Giant Block:',
      '  Top set: 130×2 | R9 | ↑',
      '  Sets: 8@110 · 6@117.5 · 4@122.5 · 2@130', // giantSets(130, hard)
      '  Completion: Completed as prescribed ✓',
      '  Secondary: B-Stance DB RDL 30kg × 8/leg',
      '  Cardio: 15/14/15/15',
      'Volume Block: 2×6 @ 105 | R8 | →', // volumeWeight(130) = 105
      'Carry: Sandbag Bear Hug 68 kg | 3×30m | R6',
      'Duration: 72 min',
      'Notes: felt strong',
    ].join('\n')
  )
})

test('completion reason shows its categorical label; legacy blank = completed', () => {
  assert.match(sessionSummary(base({ blockCompletion: 'stopped_fatigue' }), 2, ACC), /\n {2}Completion: Stopped early — fatigue\n/)
  assert.match(sessionSummary(base({ blockCompletion: '' }), 2, ACC), /Completion: Completed as prescribed ✓/)
})

test('without accessory data: secondary has no weight, carry falls back to the descriptive default', () => {
  const out = sessionSummary(base(), 2) // no accessory arg
  assert.match(out, /\n {2}Secondary: B-Stance DB RDL × 8\/leg\n/)
  assert.match(out, /\nCarry: Sandbag Bear Hug 68 kg \| 3×30m \| R6/) // DAY_META default load
})

test('dips day: pull-ups line, no weighted secondary, push-up volume (BW)', () => {
  const out = sessionSummary(base({ dayType: 'dips', pullupCluster: '8+2' }), 2, ACC)
  assert.match(out, /\n {2}Pull-ups: 8\+2\n/)
  assert.doesNotMatch(out, /Secondary:/)
  assert.match(out, /\nVolume Block: Push-ups 2×6 \(BW\) \| R8 \| →/)
  assert.match(out, /\nCarry: Suitcase Carry .* \/ hand/) // dips carry, per-hand default
})

test('carry reassignment: DL = Farmer (per hand), OHP = Overhead', () => {
  assert.match(sessionSummary(base({ dayType: 'deadlift' }), 2), /\nCarry: Farmer's Carry 60 kg \/ hand \| 3×30m \| R6/)
  assert.match(sessionSummary(base({ dayType: 'ohp' }), 2), /\nCarry: Overhead Carry 2 × 20 kg \| 3×30m \| R6/)
})

test('skipped carry shows the name + reason, drops detail', () => {
  const out = sessionSummary(base({ carrySkipped: true, carrySkipReason: 'fatigue' }), 2, ACC)
  assert.match(out, /\nCarry: Sandbag Bear Hug — skipped \(fatigue\)/)
  assert.doesNotMatch(out, /3×30m/)
})

test('incomplete volume + unlogged RPE/speed leave no residue', () => {
  const out = sessionSummary(base({ volDone: false, volRpe: '', volSpeed: '', rpe: '', barSpeed: '' }), 2, ACC)
  assert.match(out, /\n {2}Top set: 130×2\n/) // no trailing separators
  assert.match(out, /\nVolume Block: 2×6 @ 105 \| incomplete/)
})

test('untimed omits Duration; empty notes omitted; no top weight omits Sets line', () => {
  const out = sessionSummary(base({ startedAt: null, endedAt: null, notes: '', topWeight: null, topReps: null }), 2, ACC)
  assert.doesNotMatch(out, /Duration:|Notes:|Sets:/)
  assert.match(out, /\n {2}Top set: —/)
})

test('bodyweight-mode dips (top 0): BW top set, no Sets line, dips cluster shown', () => {
  const out = sessionSummary(base({ dayType: 'dips', topWeight: 0, topReps: null, dipsCluster: '7+3', pullupCluster: '6+4' }), 2, ACC)
  assert.match(out, /\n {2}Top set: BW \| R9 \| ↑\n/)
  assert.doesNotMatch(out, /Sets:/)
  assert.match(out, /\n {2}Dips cluster: 7\+3\n/)
  assert.match(out, /\n {2}Pull-ups: 6\+4\n/) // pull-ups still bodyweight (no anchor)
})

// Legacy weighted dips/pull-up sessions still render, at the uniform 2.5 kg
// rounding (GiantFit retired the 0.5 kg increment; top set stays exact).
test('legacy weighted dips ladder renders (2.5 kg rounding, same engine call as Today)', () => {
  const out = sessionSummary(base({ dayType: 'dips', topWeight: 10 }), 2, ACC)
  assert.match(out, /\n {2}Sets: 8@7.5 · 6@10 · 4@10 · 2@10\n/)
})

test('legacy weighted pull-ups (anchor in weights grid): ladder replaces the cluster line', () => {
  const W = { 3: { pullup: { hard: 10, medium: 9.5, light: 9 } } }
  const out = sessionSummary(base({ dayType: 'dips', topWeight: 10, pullupCluster: '6+4' }), 2, ACC, W)
  assert.match(out, /\n {2}Pull-ups \(wtd\): 8@7.5 · 6@10 · 4@10 · 2@10\n/)
  assert.doesNotMatch(out, /Pull-ups: 6\+4/)
})

test('testing week (null cycle/week/day) degrades: header only, no secondary/volume/carry', () => {
  const out = sessionSummary(base({ cycle: null, week: null, weekType: 'testing', difficulty: null, dayType: null }), 2, ACC)
  assert.match(out, /^Session — M2 · Testing — — — 22.06.2026/)
  assert.doesNotMatch(out, /Secondary:|Volume Block:|Carry:|Sets:/)
})

test('reactive-deload week: Deload header + ~70% context line, full body kept', () => {
  const out = sessionSummary(base(), 2, ACC, undefined, true)
  assert.match(out, /^Deload — M2C3W3 — Squat Hard — 22.06.2026\nGiant Block:\n {2}\(reactive deload week — loads ~70%\)\n/)
  assert.match(out, /Sets: 8@110/) // full logged body still present
  assert.match(out, /Carry: Sandbag Bear Hug/)
})

test('weekType deload row (W15): minimal format', () => {
  const out = sessionSummary(base({ weekType: 'deload', cycle: null, week: null, topWeight: 80, topReps: 2, notes: 'easy' }), 2, ACC)
  assert.equal(
    out,
    ['Deload — M2 W15 — Squat Hard — 22.06.2026', 'Giant Block @ ~50–60%: top 80×2 | R9 | ↑', 'No volume, no carry (deload)', 'Duration: 72 min', 'Notes: easy'].join('\n')
  )
})

// ---- test summaries (testing_results rows — tests never create sessions) ----

test('splitVolNote: extracts and strips the Vol suffix; passthrough without one', () => {
  assert.deepEqual(splitVolNote('felt strong · Vol: R8→'), { vol: 'R8→', rest: 'felt strong' })
  assert.deepEqual(splitVolNote('Vol: R7'), { vol: 'R7', rest: '' })
  assert.deepEqual(splitVolNote('clean, 1 RIR'), { vol: null, rest: 'clean, 1 RIR' })
})

test('testSummary: full format with ramp off the C3 anchor, parsed volume, notes stripped', () => {
  const W = { 3: { deadlift: { hard: 170, medium: 162.5, light: 152.5 } } }
  const r = { macroId: 'm2', lift: 'deadlift', weight: 180, reps: 2, notes: 'clean, 1 RIR · Vol: R8→', testedOn: '2026-07-06' }
  assert.equal(
    testSummary(r, 2, 13, W),
    [
      'Test — M2 W13 — Deadlift — 06.07.2026',
      'Warm-up + Giant Block ramp: 8@145 · 6@152.5 · 4@162.5', // giantSets(170, hard) sets 1–3
      'TEST RESULT: 180×2',
      'Volume Block: 2×6 @ 135 | R8→', // volumeWeight(170) = 135
      'No carry (testing week)',
      'Notes: clean, 1 RIR',
    ].join('\n')
  )
})

test('testSummary: degrades without an anchor or vol note; week omitted when null', () => {
  const r = { macroId: 'm2', lift: 'dips', weight: 12.5, reps: 3, notes: '', testedOn: '2026-07-10' }
  const out = testSummary(r, 2, null)
  assert.equal(out, ['Test — M2 — Dips — 10.07.2026', 'TEST RESULT: 12.5×3', 'No carry (testing week)'].join('\n'))
})

// ---- runSummary (Giant Run) --------------------------------------------------
function baseRun(over = {}) {
  return {
    id: '2026-07-14-run-E', macroId: 'm2', date: '2026-07-14', cycle: 1, week: 2,
    weekType: 'training', runType: 'easy', distanceKm: 5.2, durationS: 1980, avgHr: 148,
    completion: 'completed', notes: 'felt smooth',
    ...over,
  }
}

test('runSummary: exact full format (distance/duration/pace/HR/completion/notes)', () => {
  // 1980 s / 5.2 km = 380.77 s/km → "6:21"
  assert.equal(
    runSummary(baseRun(), 2),
    [
      'Run — M2C1W2 — Easy — 14.07.2026',
      '5.2 km in 33:00 → 6:21/km | avg HR 148',
      'Completion: Completed ✓',
      'Notes: felt smooth',
    ].join('\n')
  )
})

test('runSummary: HR segment omitted when not logged; categorical completion label', () => {
  const s = runSummary(baseRun({ avgHr: null, completion: 'cut_fatigue', notes: '' }), 2)
  assert.equal(s, ['Run — M2C1W2 — Easy — 14.07.2026', '5.2 km in 33:00 → 6:21/km', 'Completion: Cut short — fatigue'].join('\n'))
})

test('runSummary: testing-week TT degrades position; unlogged fields leave no residue', () => {
  const s = runSummary(
    baseRun({ id: '2026-07-11-run-T', date: '2026-07-11', cycle: null, week: null, weekType: 'testing', runType: 'tt', distanceKm: 5, durationS: 1561, avgHr: null, notes: '' }),
    2
  )
  assert.equal(s, ['Run — M2 · Testing — Time Trial — 11.07.2026', '5 km in 26:01 → 5:12/km', 'Completion: Completed ✓'].join('\n'))
  // Nothing logged at all → header + completion only.
  const bare = runSummary(baseRun({ distanceKm: null, durationS: null, avgHr: null, notes: '' }), 2)
  assert.equal(bare, ['Run — M2C1W2 — Easy — 14.07.2026', 'Completion: Completed ✓'].join('\n'))
})

test('runSummary: trail runs marked after the pace segment; road stays unmarked', () => {
  const s = runSummary(baseRun({ terrain: 'trail', durationS: 2600, notes: '' }), 2)
  // 2600 / 5.2 = 500 s/km → 8:20.
  assert.equal(s, ['Run — M2C1W2 — Easy — 14.07.2026', '5.2 km in 43:20 → 8:20/km · Trail | avg HR 148', 'Completion: Completed ✓'].join('\n'))
  assert.ok(!runSummary(baseRun({ terrain: 'road' }), 2).includes('Trail'))
})

test('runSummary: Bulletproof line when done, no residue when not', () => {
  const done = runSummary(baseRun({ bulletproof: true, notes: '' }), 2)
  assert.equal(done, ['Run — M2C1W2 — Easy — 14.07.2026', '5.2 km in 33:00 → 6:21/km | avg HR 148', 'Completion: Completed ✓', 'Bulletproof: ✓'].join('\n'))
  assert.ok(!runSummary(baseRun({ bulletproof: false }), 2).includes('Bulletproof'))
})

// ---- GiantFit era (post-cutover dates) --------------------------------------

test('GiantFit session: anchored row ladder + bodyweight accessory replace the legacy secondary; capacity line appended', () => {
  const s = base({ id: '2026-08-03-bench-H', date: '2026-08-03', cycle: 1, week: 2, dayType: 'bench', topWeight: 100, topReps: 2, pairWeight: 42.5, cardioCals: [null, null, null, null] })
  const cap = { sessionId: s.id, variant: 'B', roundsCompleted: 3, totalTimeSeconds: 702, calories: 27, rpe: 'R7', notes: '' }
  // The row's ladder computes off ITS OWN per-cycle anchor (2026-07-30 revision).
  const W = { 1: { pendlay_row: { hard: 60, medium: 57.5, light: 55 } } }
  const out = sessionSummary(s, 3, ACC, W, false, cap)
  assert.match(out, /Bench Hard — 03.08.2026/)
  // Fixed reps (hard = 8) at the row's own 85/90/95/100 ladder off a 60 kg anchor.
  assert.match(out, /\n {2}Pendlay Row: 8@50 · 8@55 · 8@57.5 · 8@60\n/)
  assert.match(out, /\n {2}GHD Back Extension: 10 reps \(BW\)\n/)
  assert.match(out, /\n {2}Pendlay Row: 2×6 @ 47.5\n/) // Volume: 80% of the row's day top
  assert.match(out, /\nCapacity B — 3 rds, 11:42, 27 cal, R7\n/)
  assert.doesNotMatch(out, /Secondary:/) // legacy line never renders post-cutover
  assert.doesNotMatch(out, /Cardio:/) // no per-round cardio in GiantFit
})

test('GiantFit row line degrades to reps-only when that cycle has no row anchor', () => {
  const s = base({ id: '2026-07-29-ohp-M', date: '2026-07-29', cycle: 1, week: 1, dayType: 'ohp', difficulty: 'medium', cardioCals: [null, null, null, null] })
  const out = sessionSummary(s, 3, ACC)
  assert.match(out, /\n {2}DB Row: 9 reps\/round\n/) // medium = 9 reps, no loads
  assert.match(out, /\n {2}Toes-to-Bar: 10 reps \(BW\)\n/)
})

test('GiantFit accessory line honours the Setup rep target over the default', () => {
  const s = base({ id: '2026-07-31-squat-L', date: '2026-07-31', cycle: 1, week: 1, dayType: 'squat', difficulty: 'light' })
  const out = sessionSummary(s, 3, ACC, undefined, false, null, { ghd_abs: 15 })
  assert.match(out, /\n {2}GHD Abs: 15 reps \(BW\)\n/)
})

test('GiantFit squat trains alone: no row line; capacity segments drop when unlogged', () => {
  const s = base({ id: '2026-07-31-squat-L', date: '2026-07-31', cycle: 1, week: 1, dayType: 'squat', difficulty: 'light' })
  const cap = { sessionId: s.id, variant: 'A', roundsCompleted: 3, totalTimeSeconds: 612, calories: null, rpe: '', notes: '' }
  const out = sessionSummary(s, 3, ACC, undefined, false, cap)
  assert.doesNotMatch(out, /Row/) // squat and DL train alone — no row anywhere
  assert.match(out, /\n {2}GHD Abs: 10 reps \(BW\)\n/) // but it does carry its accessory
  assert.match(out, /\nCapacity A — 3 rds, 10:12\n/) // no cal, no RPE — dropped, not faked
})

test('legacy sessions are untouched by the capacity param (no capacity line without a log)', () => {
  const out = sessionSummary(base({}), 2, ACC)
  assert.doesNotMatch(out, /Capacity/)
  assert.match(out, /Secondary:/) // pre-cutover keeps the Giant format
})

test('DL trains alone — no row line; a PRE-REVISION logged pair weight still renders', () => {
  const dl = base({ id: '2026-07-27-deadlift-M', date: '2026-07-27', cycle: 1, week: 1, dayType: 'deadlift', difficulty: 'medium', cardioCals: [null, null, null, null] })
  assert.doesNotMatch(sessionSummary(dl, 3, ACC), /Pair/)
  assert.doesNotMatch(sessionSummary(dl, 3, ACC), /DB Row/)
  // Free-entry weights logged before the rows became anchored are still what was
  // logged — history renders it, marked as such (no data rewrite, ever).
  assert.match(sessionSummary({ ...dl, pairWeight: 24 }, 3, ACC), /\n {2}Pair \(logged\): DB Row 24kg\n/)
  const ohp = base({ id: '2026-07-29-ohp-M', date: '2026-07-29', cycle: 1, week: 1, dayType: 'ohp', difficulty: 'medium', pairWeight: 22.5, cardioCals: [null, null, null, null] })
  assert.match(sessionSummary(ohp, 3, ACC), /\n {2}Pair \(logged\): DB Row 22.5kg\n/)
})

test('capacity completion: a completed session is BYTE-IDENTICAL to before the state existed', () => {
  const s = base({ id: '2026-08-03-bench-H', date: '2026-08-03', cycle: 1, week: 2, dayType: 'bench', topWeight: 100, topReps: 2, cardioCals: [null, null, null, null] })
  const cap = { sessionId: s.id, variant: 'B', roundsCompleted: 3, totalTimeSeconds: 702, calories: 27, rpe: 'R7', notes: '' }
  // A pre-0021 log (no completion field at all) and an explicitly-completed one
  // must both produce exactly the line the app printed before this change.
  const legacy = sessionSummary(s, 3, ACC, undefined, false, cap)
  const completed = sessionSummary(s, 3, ACC, undefined, false, { ...cap, completion: 'completed' })
  assert.match(legacy, /\nCapacity B — 3 rds, 11:42, 27 cal, R7\n/)
  assert.equal(completed, legacy)
})

test('capacity completion: a non-completed state is appended to the capacity line', () => {
  const s = base({ id: '2026-08-03-bench-H', date: '2026-08-03', cycle: 1, week: 2, dayType: 'bench', topWeight: 100, topReps: 2, cardioCals: [null, null, null, null] })
  const cap = { sessionId: s.id, variant: 'B', roundsCompleted: 3, totalTimeSeconds: 702, calories: 27, rpe: 'R7', notes: '' }
  assert.match(
    sessionSummary(s, 3, ACC, undefined, false, { ...cap, completion: 'cut_short_fatigue' }),
    /\nCapacity B — 3 rds, 11:42, 27 cal, R7 · Cut short — fatigue\n/
  )
  assert.match(
    sessionSummary(s, 3, ACC, undefined, false, { ...cap, completion: 'scaled_other' }),
    /\nCapacity B — 3 rds, 11:42, 27 cal, R7 · Scaled — other\n/
  )
})

// ---- Giant 2.0 (from GIANT2_START_DATE) -------------------------------------
test('Giant 2.0 OHP day: BB Row ladder (reuses the db_row lane) + Leg Raises + Volume off its OWN (independent) difficulty', () => {
  const s = base({
    id: '2026-08-14-ohp-H',
    date: '2026-08-14',
    cycle: 1,
    week: 1,
    dayType: 'ohp',
    difficulty: 'hard',
    volumeDifficulty: 'light',
    topWeight: 100,
    topReps: 2,
    pairWeight: null,
    cardioCals: [null, null, null, null],
  })
  const W = { 1: { db_row: { hard: 60, medium: 57, light: 54 } } }
  const out = sessionSummary(s, 4, ACC, W)
  assert.match(out, /Session — M4C1W1 — OHP Hard — 14.08.2026/)
  assert.match(out, /\n {2}BB Row: 8@50 · 8@55 · 8@57.5 · 8@60\n/) // fixed reps (hard=8) off the row's own 60 kg anchor
  assert.match(out, /\n {2}Leg Raises: 12 reps \(BW\)\n/)
  // Volume reads volumeDifficulty ('light'), NOT the Giant block's difficulty ('hard').
  assert.match(out, /Volume Block: 2×10 @ 80/)
  assert.match(out, /\n {2}BB Row: 2×10 @ 42.5\n/) // 80% of the row's OWN light day-top (54)
  assert.doesNotMatch(out, /Secondary:|DB Row|Pendlay Row/) // no legacy/GiantFit labels leak through
})

test('Giant 2.0 bench day: Pull-ups two-mode — bodyweight cluster when no anchor is set', () => {
  const s = base({
    id: '2026-08-11-bench-M',
    date: '2026-08-11',
    cycle: 1,
    week: 1,
    dayType: 'bench',
    difficulty: 'medium',
    volumeDifficulty: 'light',
    topWeight: 80,
    topReps: 3,
    pullupCluster: '6+4',
    pairWeight: null,
    cardioCals: [null, null, null, null],
  })
  const out = sessionSummary(s, 4, ACC) // no weights grid -> pendlay_row anchor unset -> bodyweight mode
  assert.match(out, /\n {2}Pull-ups: 6\+4\n/)
  assert.match(out, /\n {2}Leg Raises: 12 reps \(BW\)\n/)
  assert.doesNotMatch(out, /Pull-ups \(wtd\)/)
})

test('Giant 2.0 squat/deadlift train alone: no secondary line, Ab-Roll accessory', () => {
  const s = base({ id: '2026-08-10-squat-H', date: '2026-08-10', cycle: 1, week: 1, dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light', topWeight: 120, pairWeight: null, cardioCals: [null, null, null, null] })
  const out = sessionSummary(s, 4, ACC)
  assert.doesNotMatch(out, /Row/)
  assert.match(out, /\n {2}Ab-Roll: 10 reps \(BW\)\n/)
})

test('Giant 2.0 C3 week 4: no Volume block at all (flagged, not silently dropped)', () => {
  const s = base({ id: '2026-10-26-squat-H', date: '2026-10-26', cycle: 3, week: 4, dayType: 'squat', difficulty: 'hard', volumeDifficulty: null, topWeight: 130, pairWeight: null, cardioCals: [null, null, null, null] })
  const out = sessionSummary(s, 4, ACC)
  assert.match(out, /Volume Block: none this week \(C3 week 4\)/)
  assert.doesNotMatch(out, /Volume Block: 2×/)
})

test('Giant 2.0 Capability note: flags Hypertrophy/Oly (not captured here), stays silent for Carries (already fully rendered above)', () => {
  const c1 = base({ id: '2026-08-10-squat-H', date: '2026-08-10', cycle: 1, week: 1, dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light', pairWeight: null, cardioCals: [null, null, null, null] })
  assert.match(sessionSummary(c1, 4, ACC), /Hypertrophy: not included in this summary/)
  const c2 = base({ ...c1, id: '2026-09-07-squat-H', date: '2026-09-07', cycle: 2 })
  assert.match(sessionSummary(c2, 4, ACC), /Oly: not included in this summary/)
  const c3 = base({ ...c1, id: '2026-10-05-squat-H', date: '2026-10-05', cycle: 3 })
  const out3 = sessionSummary(c3, 4, ACC)
  assert.doesNotMatch(out3, /not included in this summary/)
})

test('Giant 2.0 deload week is a REAL session summary, not the legacy W15 stub', () => {
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
    pairWeight: null,
    cardioCals: [null, null, null, null],
  })
  const out = sessionSummary(s, 4, ACC, undefined, true)
  assert.doesNotMatch(out, /W15/)
  assert.doesNotMatch(out, /50–60%/)
  assert.match(out, /Sets: 8@72.5 · 6@75 · 4@80 · 2@84/) // the real computed ladder off the stored (already-reduced) top
  // No Volume Block line at all on deload — and no "none this week" note either
  // (that note is training-week-only; deload's absence needs no explanation).
  assert.doesNotMatch(out, /Volume Block/)
  assert.doesNotMatch(out, /not included in this summary/)
})
