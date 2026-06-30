import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionsToCsv } from './export-csv'

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
    'date,macro,cycle,week,week_type,day_type,difficulty,top_weight,top_reps,rpe,bar_speed,cardio_cals,block_completion,vol_done,vol_rpe,vol_speed,pullup_cluster,carry_skipped,carry_skip_reason,carry_rounds,carry_distance,carry_rpe,started_at,ended_at,notes'
  )
})

test('serializes a row, resolves macro number, collapses cardio, renders nulls as empty', () => {
  const csv = sessionsToCsv([session()], macros)
  const row = csv.split('\n')[1]
  // date,macro,cycle,week,week_type,day_type,difficulty,top_weight,top_reps,rpe,bar_speed,cardio_cals,...
  assert.equal(
    row,
    '2026-06-22,2,3,3,training,squat,hard,145,2,R9.5,up,15/14//15,completed,true,R8,normal,,false,,3,30,R6,,,felt strong'
  )
})

test('escapes fields containing commas, quotes, or newlines', () => {
  const csv = sessionsToCsv([session({ notes: 'hard, "very" hard\nday' })], macros)
  const row = csv.split('\n').slice(1).join('\n')
  assert.match(row, /,"hard, ""very"" hard\nday"$/)
})

test('unknown macroId yields a blank macro cell, not a crash', () => {
  const csv = sessionsToCsv([session({ macroId: 'ghost' })], macros)
  assert.equal(csv.split('\n')[1].split(',')[1], '') // macro column blank
})
