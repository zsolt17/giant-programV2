import { test } from 'vitest'
import assert from 'node:assert/strict'
import { lastHypertrophySetLog } from './capability-record'

function log(over = {}) {
  return { sessionId: 's-old', movementId: 'wl', setNumber: 1, weight: 20, repsDone: 12, rpe: 'R8', notes: '', updatedAt: '2026-08-01T00:00:00.000Z', ...over }
}

test('lastHypertrophySetLog: null with no movementId (unresolved movement)', () => {
  assert.equal(lastHypertrophySetLog([log()], undefined, 1, 's-today'), null)
})

test('lastHypertrophySetLog: null when nothing matches the exact movement+set', () => {
  assert.equal(lastHypertrophySetLog([log({ movementId: 'lhc' })], 'wl', 1, 's-today'), null) // different movement
  assert.equal(lastHypertrophySetLog([log({ setNumber: 2 })], 'wl', 1, 's-today'), null) // different set — Set 1 never shows Set 2's ghost
})

test('lastHypertrophySetLog: excludes the session currently being edited — never ghosts against itself', () => {
  const todaysOwnLog = log({ sessionId: 's-today', updatedAt: '2026-08-19T00:00:00.000Z' })
  assert.equal(lastHypertrophySetLog([todaysOwnLog], 'wl', 1, 's-today'), null)
})

test('lastHypertrophySetLog: picks the most recently UPDATED match, not just any match', () => {
  const older = log({ sessionId: 's-1', weight: 20, updatedAt: '2026-08-01T00:00:00.000Z' })
  const newer = log({ sessionId: 's-2', weight: 22.5, updatedAt: '2026-08-08T00:00:00.000Z' })
  const result = lastHypertrophySetLog([older, newer], 'wl', 1, 's-today')
  assert.equal(result.weight, 22.5)
})

test('lastHypertrophySetLog: matches by exact exercise AND set number — Set 1 never shows Set 2\'s history', () => {
  const set1 = log({ sessionId: 's-1', setNumber: 1, weight: 20, updatedAt: '2026-08-01T00:00:00.000Z' })
  const set2 = log({ sessionId: 's-1', setNumber: 2, weight: 25, updatedAt: '2026-08-01T00:00:01.000Z' }) // even though logged later
  const logs = [set1, set2]
  assert.equal(lastHypertrophySetLog(logs, 'wl', 1, 's-today').weight, 20)
  assert.equal(lastHypertrophySetLog(logs, 'wl', 2, 's-today').weight, 25)
})
