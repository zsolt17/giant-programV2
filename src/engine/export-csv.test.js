import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionsToCsv, testingToCsv } from './export-csv'

const macros = [
  { id: 'm1', number: 1, startISO: '2026-01-05', weeks: 15, status: 'completed' },
  { id: 'm2', number: 2, startISO: '2026-04-13', weeks: 15, status: 'active' },
]

function session(over = {}) {
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
    topWeight: 145,
    rpe: 'R9.5',
    barSpeed: 'up',
    cardioCals: [15, 14, null, 15],
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
    startedAt: null,
    endedAt: null,
    ...over,
  }
}

test('header row lists all columns in order', () => {
  const csv = sessionsToCsv([], macros)
  assert.equal(
    csv,
    'date,macro,cycle,week,week_type,day_type,difficulty,top_weight,top_reps,rpe,bar_speed,cardio_cals,block_completion,vol_done,vol_rpe,vol_speed,pullup_cluster,dips_cluster,carry_skipped,carry_skip_reason,carry_rounds,carry_distance,carry_rpe,started_at,ended_at,notes,deload_week'
  )
})

test('serializes a row, resolves macro number, collapses cardio, renders nulls as empty', () => {
  const csv = sessionsToCsv([session()], macros)
  const row = csv.split('\n')[1]
  // date,macro,cycle,week,week_type,day_type,difficulty,top_weight,top_reps,rpe,bar_speed,cardio_cals,...,deload_week
  assert.equal(
    row,
    '2026-06-22,2,3,3,training,squat,hard,145,2,R9.5,up,15/14//15,completed,true,R8,normal,,,false,,3,30,R6,,,felt strong,'
  )
})

test('deload_week column: true/false from the deloads map, blank without week key', () => {
  const deloads = { M2C3W3: true }
  const rows = sessionsToCsv([session(), session({ cycle: 3, week: 2 }), session({ cycle: null, week: null, weekType: 'testing' })], macros, deloads)
    .split('\n')
    .slice(1)
  assert.match(rows[0], /,true$/) // M2C3W3 flagged
  assert.match(rows[1], /,false$/) // M2C3W2 not flagged
  assert.match(rows[2], /,$/) // no computable week key -> blank
})

test('testingToCsv: header + rows sorted by date, macro number resolved', () => {
  const csv = testingToCsv(
    [
      { macroId: 'm2', lift: 'deadlift', weight: 180, reps: 2, notes: 'clean, 1 RIR', testedOn: '2026-07-06' },
      { macroId: 'm2', lift: 'dips', weight: 12.5, reps: 3, notes: '', testedOn: '2026-07-10' },
    ],
    macros
  )
  const lines = csv.split('\n')
  assert.equal(lines[0], 'tested_on,macro,lift,weight,reps,notes')
  assert.equal(lines[1], '2026-07-06,2,deadlift,180,2,"clean, 1 RIR"')
  assert.equal(lines[2], '2026-07-10,2,dips,12.5,3,')
})

test('escapes fields containing commas, quotes, or newlines', () => {
  const csv = sessionsToCsv([session({ notes: 'hard, "very" hard\nday' })], macros)
  const row = csv.split('\n').slice(1).join('\n')
  assert.match(row, /,"hard, ""very"" hard\nday",$/) // trailing blank deload_week cell
})

test('unknown macroId yields a blank macro cell, not a crash', () => {
  const csv = sessionsToCsv([session({ macroId: 'ghost' })], macros)
  assert.equal(csv.split('\n')[1].split(',')[1], '') // macro column blank
})

// ---- runsToCsv (Giant Run) ----------------------------------------------------
import { runsToCsv } from './export-csv'

test('runsToCsv: header, derived pace column, date-sorted, escaping intact', () => {
  const runs = [
    { id: 'b', macroId: 'm2', date: '2026-07-16', cycle: 1, week: 2, weekType: 'training', runType: 'quality', distanceKm: 3, durationS: 1000, avgHr: null, completion: 'felt_heavy', notes: 'hills, wind' },
    { id: 'a', macroId: 'm2', date: '2026-07-14', cycle: 1, week: 2, weekType: 'training', runType: 'easy', distanceKm: 5.2, durationS: 1980, avgHr: 148, completion: 'completed', notes: '' },
  ]
  const csv = runsToCsv(runs, macros)
  const lines = csv.split('\n')
  assert.equal(lines[0], 'date,macro,cycle,week,week_type,run_type,terrain,distance_km,duration_s,pace_s_per_km,avg_hr,completion,notes')
  // Sorted oldest first; pace derived (1980/5.2 = 380.8 → 381).
  // Terrain defaults to road when the fixture doesn't set it (legacy rows).
  assert.equal(lines[1], '2026-07-14,2,1,2,training,easy,road,5.2,1980,381,148,completed,')
  // 1000/3 = 333.3 → 333; comma-bearing notes are quoted.
  assert.equal(lines[2], '2026-07-16,2,1,2,training,quality,road,3,1000,333,,felt_heavy,"hills, wind"')
})
