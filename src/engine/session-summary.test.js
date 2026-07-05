import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionSummary } from './session-summary'

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

test('weighted dips ladder rounds at 0.5 kg (same engine call as Today)', () => {
  const out = sessionSummary(base({ dayType: 'dips', topWeight: 10 }), 2, ACC)
  assert.match(out, /\n {2}Sets: 8@8.5 · 6@9 · 4@9.5 · 2@10\n/)
})

test('weighted pull-ups (anchor in weights grid): ladder replaces the cluster line', () => {
  const W = { 3: { pullup: { hard: 10, medium: 9.5, light: 9 } } }
  const out = sessionSummary(base({ dayType: 'dips', topWeight: 10, pullupCluster: '6+4' }), 2, ACC, W)
  assert.match(out, /\n {2}Pull-ups \(wtd\): 8@8.5 · 6@9 · 4@9.5 · 2@10\n/)
  assert.doesNotMatch(out, /Pull-ups: 6\+4/)
})

test('testing week (null cycle/week/day) degrades: header only, no secondary/volume/carry', () => {
  const out = sessionSummary(base({ cycle: null, week: null, weekType: 'testing', difficulty: null, dayType: null }), 2, ACC)
  assert.match(out, /^Session — M2 · Testing — — — 22.06.2026/)
  assert.doesNotMatch(out, /Secondary:|Volume Block:|Carry:|Sets:/)
})
