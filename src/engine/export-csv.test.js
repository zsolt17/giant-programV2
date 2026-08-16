import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionsToCsv, hypertrophyToCsv, olyToCsv, wodToCsv } from './export-csv'

const macros = [
  { id: 'm1', number: 1, startISO: '2026-04-13', weeks: 13, status: 'completed' },
  { id: 'm2', number: 2, startISO: '2026-08-10', weeks: 13, status: 'active' },
]

function session(over = {}) {
  return {
    id: '2026-08-10-squat',
    macroId: 'm2',
    date: '2026-08-10',
    cycle: 1,
    week: 1,
    weekType: 'training',
    dayType: 'squat',
    difficulty: 'hard',
    volumeDifficulty: 'light',
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
    wodSkipped: false,
    wodSkipReason: '',
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
    'date,macro,cycle,week,week_type,day_type,difficulty,volume_difficulty,top_weight,top_reps,rpe,bar_speed,cardio_cals,block_completion,vol_done,vol_rpe,vol_speed,pullup_cluster,wod_skipped,wod_skip_reason,started_at,ended_at,notes,deload_week'
  )
})

test('serializes a row, resolves macro number, collapses cardio, renders nulls as empty', () => {
  const csv = sessionsToCsv([session()], macros)
  const row = csv.split('\n')[1]
  assert.equal(
    row,
    '2026-08-10,2,1,1,training,squat,hard,light,145,2,R9.5,up,15/14//15,completed,true,R8,normal,,false,,,,felt strong,'
  )
})

test('volume_difficulty column carries the Volume block\'s own (independent) difficulty', () => {
  const s = session({ id: '2026-08-11-ohp', date: '2026-08-11', dayType: 'ohp', difficulty: 'hard', volumeDifficulty: 'light' })
  const row = sessionsToCsv([s], macros).split('\n')[1]
  const cols = row.split(',')
  assert.equal(cols[6], 'hard') // difficulty
  assert.equal(cols[7], 'light') // volume_difficulty — independent column
})

test('volume_difficulty is blank on a session with no Volume block (C3 week 4, or deload)', () => {
  const s = session({ id: '2026-11-02-squat', date: '2026-11-02', weekType: 'deload', cycle: null, week: null, difficulty: null, volumeDifficulty: null })
  const row = sessionsToCsv([s], macros).split('\n')[1]
  const cols = row.split(',')
  assert.equal(cols[7], '') // volume_difficulty blank
})

test('deload_week column: true/false from the deloads map, blank without week key', () => {
  const deloads = { M2C1W2: true }
  const rows = sessionsToCsv([session(), session({ week: 2 }), session({ cycle: null, week: null, weekType: 'deload' })], macros, deloads)
    .split('\n')
    .slice(1)
  assert.match(rows[0], /,false$/) // M2C1W1 not flagged
  assert.match(rows[1], /,true$/) // M2C1W2 flagged
  assert.match(rows[2], /,$/) // no computable week key -> blank
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

// ---- Capability block (Hypertrophy / Oly) -----------------------------------

const movements = [
  { id: 'mv-1', key: 'walking_lunge', name: 'Walking Lunge', loadType: 'recorded', countType: 'reps_per_side', defaultReps: 12, repUnit: '/leg', note: null, archived: false },
  { id: 'mv-2', key: 'oly_muscle_snatch', name: 'Muscle Snatch', loadType: 'recorded', countType: 'reps', defaultReps: 5, repUnit: null, note: '3×5, unloaded', archived: false },
]

test('hypertrophyToCsv: one row per movement, positioned via its session, movement name resolved from the library', () => {
  const sessions = [session({ id: '2026-08-10-squat', date: '2026-08-10' })]
  const logs = [{ sessionId: '2026-08-10-squat', movementId: 'mv-1', weight: 30, repsDone: 12, notes: 'felt good' }]
  const lines = hypertrophyToCsv(logs, sessions, movements, macros).split('\n')
  assert.equal(lines[0], 'date,macro,cycle,week,day_type,movement,weight,reps_done,notes')
  assert.equal(lines[1], '2026-08-10,2,1,1,squat,Walking Lunge,30,12,felt good')
})

test('olyToCsv: logs a quality mark, not RPE; unresolved movement falls back to its id', () => {
  const sessions = [session({ id: '2026-09-07-squat', date: '2026-09-07', cycle: 2 })]
  const logs = [
    { sessionId: '2026-09-07-squat', movementId: 'mv-2', weight: 40, quality: 'Q3', notes: '' },
    { sessionId: '2026-09-07-squat', movementId: 'mv-unknown', weight: 20, quality: 'Q1', notes: '' },
  ]
  const lines = olyToCsv(logs, sessions, movements, macros).split('\n')
  assert.equal(lines[0], 'date,macro,cycle,week,day_type,movement,weight,quality,notes')
  assert.equal(lines[1], '2026-09-07,2,2,1,squat,Muscle Snatch,40,Q3,')
  assert.equal(lines[2], '2026-09-07,2,2,1,squat,mv-unknown,20,Q1,')
})

// ---- Engine WOD (C3) --------------------------------------------------------

test('wodToCsv: one row per round, sorted by session date then round number, no movement column', () => {
  const sessions = [session({ id: '2026-10-05-squat', date: '2026-10-05', cycle: 3 })]
  const logs = [
    { sessionId: '2026-10-05-squat', roundNumber: 2, machineType: 'row', machineCalories: 14, carryRpe: 'R6' },
    { sessionId: '2026-10-05-squat', roundNumber: 1, machineType: 'row', machineCalories: 12, carryRpe: '' },
  ]
  const lines = wodToCsv(logs, sessions, macros).split('\n')
  assert.equal(lines[0], 'date,macro,cycle,week,day_type,round_number,machine_type,machine_calories,carry_rpe')
  assert.equal(lines[1], '2026-10-05,2,3,1,squat,1,row,12,') // round 1 sorted before round 2
  assert.equal(lines[2], '2026-10-05,2,3,1,squat,2,row,14,R6')
})
