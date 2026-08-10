// Giant 2.0 domain-rule regression guards: the weekly Giant-difficulty rotation
// is internally consistent (the exact contradiction almost shipped during
// planning — see specification.md, 2026-08-09), and the fixed day->lift /
// week-4 collapse / volume-by-cycle / capability-by-cycle facts match the
// confirmed 13-week calendar. Program-content seeding/resolver parity lives
// in program.test.js — not duplicated here.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  GIANT2_DAY_LIFT,
  GIANT2_SESSION_DAYS,
  GIANT2_GIANT_DEFAULT_ROTATION,
  GIANT2_WEEK4_DIFFICULTY,
  GIANT2_VOLUME_DIFFICULTY_BY_CYCLE,
  GIANT2_CAPABILITY_BY_CYCLE,
  GIANT2_SECONDARY,
} from './constants'

test('GIANT2_GIANT_DEFAULT_ROTATION: each lift touches Hard/Medium/Light exactly once across weeks 1-3', () => {
  const days = ['squat', 'bench', 'deadlift', 'ohp']
  for (const lift of days) {
    const seen = [1, 2, 3].map((w) => GIANT2_GIANT_DEFAULT_ROTATION[w][lift])
    assert.deepEqual([...seen].sort(), ['hard', 'light', 'medium'], `${lift} does not touch all three tiers`)
  }
})

test('GIANT2_GIANT_DEFAULT_ROTATION: exactly one tier doubles up each week, all three present', () => {
  const days = ['squat', 'bench', 'deadlift', 'ohp']
  for (const week of [1, 2, 3]) {
    const values = days.map((d) => GIANT2_GIANT_DEFAULT_ROTATION[week][d])
    const counts = { hard: 0, medium: 0, light: 0 }
    values.forEach((v) => counts[v]++)
    const tally = Object.values(counts).sort((a, b) => a - b)
    assert.deepEqual(tally, [1, 1, 2], `week ${week} is not a clean one-tier-doubled distribution`)
  }
})

test('week 4 collapse and volume-by-cycle and capability-by-cycle match the confirmed 13-week calendar', () => {
  assert.deepEqual(GIANT2_WEEK4_DIFFICULTY, { 1: 'light', 2: 'medium', 3: 'hard' })
  assert.deepEqual(GIANT2_VOLUME_DIFFICULTY_BY_CYCLE, { 1: 'light', 2: 'medium', 3: 'hard' })
  assert.deepEqual(GIANT2_CAPABILITY_BY_CYCLE, { 1: 'hypertrophy', 2: 'oly', 3: 'carries' })
})

test('GIANT2_DAY_LIFT: fixed Mon/Tue/Thu/Fri -> Squat/Bench/Deadlift/OHP, no Wed/Sat/Sun', () => {
  assert.deepEqual(GIANT2_DAY_LIFT, { 1: 'squat', 2: 'bench', 4: 'deadlift', 5: 'ohp' })
  assert.deepEqual(GIANT2_SESSION_DAYS.slice().sort(), [1, 2, 4, 5])
})

test('GIANT2_SECONDARY documents the lane->occupant assignment used by the seed', () => {
  assert.deepEqual(GIANT2_SECONDARY, { ohp: { key: 'bb_row', name: 'BB Row' }, bench: { key: 'pullup', name: 'Pull-ups' } })
})
