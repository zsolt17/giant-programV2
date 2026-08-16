import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isPrimerDone, isCooldownDone, isGiantDone, isVolumeDone, isWodDone, isHypertrophyDone, isOlyDone } from './session-progress'
import { SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS } from './movements'
import { GIANT2_HYPERTROPHY_SETS, GIANT2_WOD_ROUNDS } from './constants'

test('isPrimerDone: reads the single persisted flag, nothing else', () => {
  assert.equal(isPrimerDone({ primerDone: false }), false)
  assert.equal(isPrimerDone({ primerDone: true }), true)
})

test('isCooldownDone: reads the single persisted flag, nothing else', () => {
  assert.equal(isCooldownDone({ cooldownDone: false }), false)
  assert.equal(isCooldownDone({ cooldownDone: true }), true)
})

test('isGiantDone: RPE + bar speed required; cluster required only when needsCluster', () => {
  assert.equal(isGiantDone({ rpe: '', barSpeed: '', pullupCluster: '' }, false), false)
  assert.equal(isGiantDone({ rpe: 'R9', barSpeed: '', pullupCluster: '' }, false), false)
  assert.equal(isGiantDone({ rpe: 'R9', barSpeed: 'normal', pullupCluster: '' }, false), true)
  // Bench day, bodyweight-mode Pull-ups: the cluster is a real required field too.
  assert.equal(isGiantDone({ rpe: 'R9', barSpeed: 'normal', pullupCluster: '' }, true), false)
  assert.equal(isGiantDone({ rpe: 'R9', barSpeed: 'normal', pullupCluster: '6+4' }, true), true)
})

test('isVolumeDone: RPE + bar speed required (volDone is not part of the check — it defaults true)', () => {
  assert.equal(isVolumeDone({ volRpe: '', volSpeed: '' }), false)
  assert.equal(isVolumeDone({ volRpe: 'R8', volSpeed: '' }), false)
  assert.equal(isVolumeDone({ volRpe: 'R8', volSpeed: 'up' }), true)
})

// ---- Engine WOD (C3): skipped needs only a reason; otherwise every round needs machine calories ----

function wodRoundsFor({ roundsWithCalories = [] } = {}) {
  return Array.from({ length: GIANT2_WOD_ROUNDS }, (_, i) => {
    const roundNumber = i + 1
    return { roundNumber, machineType: 'row', machineCalories: roundsWithCalories.includes(roundNumber) ? 12 : null, carryRpe: '' }
  })
}
const ALL_WOD_ROUNDS = Array.from({ length: GIANT2_WOD_ROUNDS }, (_, i) => i + 1)

test('isWodDone: skipped needs only a reason, logs irrelevant', () => {
  assert.equal(isWodDone({ wodSkipped: true, wodSkipReason: '' }, []), false)
  assert.equal(isWodDone({ wodSkipped: true, wodSkipReason: 'fatigue' }, []), true)
})

test('isWodDone: not skipped — false with no rounds logged, false with only some rounds logged', () => {
  assert.equal(isWodDone({ wodSkipped: false, wodSkipReason: '' }, []), false)
  assert.equal(isWodDone({ wodSkipped: false, wodSkipReason: '' }, wodRoundsFor({ roundsWithCalories: [1, 2, 3, 4] })), false)
})

test('isWodDone: not skipped — true once every round has machine calories (carry RPE not required)', () => {
  assert.equal(isWodDone({ wodSkipped: false, wodSkipReason: '' }, wodRoundsFor({ roundsWithCalories: ALL_WOD_ROUNDS })), true)
})

// ---- Hypertrophy: per-set, weight-optional aware ----------------------------

const squatKeys = SEED_HYPERTROPHY_KEYS.squat // ['walking_lunge','lying_hamstring_curl','hip_back_extension','standing_calf_raise']
const movementsFixture = squatKeys.map((key, i) => ({ id: `m${i}`, key }))
const movementIdFor = (key) => movementsFixture.find((m) => m.key === key).id

function fullLogsFor(keys, movements, { skipWeightFor = [] } = {}) {
  const logs = []
  for (const key of keys) {
    const movementId = movementIdFor(key)
    for (let setNumber = 1; setNumber <= GIANT2_HYPERTROPHY_SETS; setNumber++) {
      logs.push({ movementId, setNumber, repsDone: 12, weight: skipWeightFor.includes(key) ? null : 40 })
    }
  }
  return logs
}

test('isHypertrophyDone: false with no logs at all', () => {
  assert.equal(isHypertrophyDone('squat', movementsFixture, []), false)
})

test('isHypertrophyDone: false when only some sets of one exercise are logged', () => {
  const logs = fullLogsFor(squatKeys, movementsFixture).filter((l) => !(l.movementId === movementIdFor('walking_lunge') && l.setNumber === GIANT2_HYPERTROPHY_SETS))
  assert.equal(isHypertrophyDone('squat', movementsFixture, logs), false)
})

test('isHypertrophyDone: true once every set of every exercise has reps+weight', () => {
  const logs = fullLogsFor(squatKeys, movementsFixture)
  assert.equal(isHypertrophyDone('squat', movementsFixture, logs), true)
})

test('isHypertrophyDone: weight-optional movement (hip_back_extension) only needs reps', () => {
  const logs = fullLogsFor(squatKeys, movementsFixture, { skipWeightFor: ['hip_back_extension'] })
  assert.equal(isHypertrophyDone('squat', movementsFixture, logs), true)
})

test('isHypertrophyDone: a non-weight-optional movement missing weight is NOT done', () => {
  const logs = fullLogsFor(squatKeys, movementsFixture, { skipWeightFor: ['walking_lunge'] })
  assert.equal(isHypertrophyDone('squat', movementsFixture, logs), false)
})

test('isHypertrophyDone: missing reps on any set fails regardless of weight', () => {
  const logs = fullLogsFor(squatKeys, movementsFixture).map((l) =>
    l.movementId === movementIdFor('standing_calf_raise') && l.setNumber === 1 ? { ...l, repsDone: null } : l
  )
  assert.equal(isHypertrophyDone('squat', movementsFixture, logs), false)
})

test('isHypertrophyDone: RPE is optional — present or absent, it never affects readiness', () => {
  const withoutRpe = fullLogsFor(squatKeys, movementsFixture)
  assert.equal(isHypertrophyDone('squat', movementsFixture, withoutRpe), true)
  const withRpe = withoutRpe.map((l) => ({ ...l, rpe: 'R9' }))
  assert.equal(isHypertrophyDone('squat', movementsFixture, withRpe), true)
})

// ---- Oly: quality mark required, weight not required ------------------------

const olySquatKeys = SEED_OLY_KEYS.squat // ['oly_snatch_balance_ohs','oly_hang_full_snatch']
const olyMovementsFixture = olySquatKeys.map((key, i) => ({ id: `o${i}`, key }))
const olyMovementIdFor = (key) => olyMovementsFixture.find((m) => m.key === key).id

test('isOlyDone: false until every exercise has a quality mark', () => {
  assert.equal(isOlyDone('squat', olyMovementsFixture, []), false)
  const oneLogged = [{ movementId: olyMovementIdFor(olySquatKeys[0]), weight: 60, quality: 'Q3' }]
  assert.equal(isOlyDone('squat', olyMovementsFixture, oneLogged), false)
})

test('isOlyDone: true once every exercise has a quality mark, even with no weight (unloaded primer work)', () => {
  const logs = olySquatKeys.map((key) => ({ movementId: olyMovementIdFor(key), weight: null, quality: 'Q2' }))
  assert.equal(isOlyDone('squat', olyMovementsFixture, logs), true)
})
