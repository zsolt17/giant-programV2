// Data-layer smoke test against the live Supabase DB. Runs full CRUD through
// repository.js and asserts round-trips, the per-cycle isolation guarantee, and
// "" -> NULL normalization.
//
// SAFE TO RUN ANYTIME: every operation runs against a THROWAWAY macro (number 999,
// status 'completed' so it never becomes your active macro), which is deleted at
// the end — cascade removes its weights/accessory/sessions/deloads. Your real
// training data is never touched. (Break days are user-scoped, so the one break-day
// assertion uses a far-future date and cleans up after itself.)
//
//   1) put your Supabase user's password in .env.local (SMOKE_PASSWORD)
//   2) `npm run smoke`
import { supabase, signIn, signOut } from '../src/data/supabase'
import * as repo from '../src/data/repository'
import { SEED_MOVEMENTS } from '../src/engine/movements'
import { ANCHORED_LANES, validateVersion, resolveProgram } from '../src/engine/program'

const email = process.env.SMOKE_EMAIL
const password = process.env.SMOKE_PASSWORD
const TEST_MACRO_NUMBER = 999 // throwaway; must not collide with a real macro

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓', name)
  } else {
    fail++
    console.error('  ✗', name, extra !== undefined ? `(got: ${JSON.stringify(extra)})` : '')
  }
}

async function main() {
  if (!email || !password) {
    console.error('Set SMOKE_EMAIL and SMOKE_PASSWORD in .env.local first.')
    process.exit(2)
  }

  console.log('Auth')
  const user = await signIn(email, password)
  ok('sign in succeeds', !!user)

  console.log('Isolated test macro (never touches real data)')
  const stale = await repo.getMacroByNumber(TEST_MACRO_NUMBER)
  if (stale) await supabase.from('macros').delete().eq('id', stale.id) // clean up a prior crashed run
  const staleNext = await repo.getMacroByNumber(TEST_MACRO_NUMBER + 1) // roll-forward throwaway from a crashed run
  if (staleNext) await supabase.from('macros').delete().eq('id', staleNext.id)
  const macro = await repo.createMacro({ number: TEST_MACRO_NUMBER, startISO: '2099-01-04', status: 'completed' })
  ok('created throwaway macro', !!macro && macro.number === TEST_MACRO_NUMBER, macro)
  ok('new macro defaults to 13 weeks', macro.weeks === 13, macro.weeks)
  ok('new macro deload not extended', macro.deloadExtended === false, macro.deloadExtended)
  const id = macro.id

  // Deload extension: boolean round-trips both ways.
  let mExt = await repo.updateMacro(id, { deloadExtended: true })
  ok('deload_extended set = true', mExt.deloadExtended === true, mExt.deloadExtended)
  mExt = await repo.updateMacro(id, { deloadExtended: false })
  ok('deload_extended cleared = false', mExt.deloadExtended === false, mExt.deloadExtended)

  try {
    console.log('Working weights (single-anchor — only Hard is stored, Med/Light computed)')
    await repo.saveWorkingWeights(id, 1, {
      deadlift: { hard: 160 },
      squat: { hard: 140 },
    })
    let w = await repo.getWorkingWeights(id)
    ok('C1 deadlift hard anchor = 160', w?.[1]?.deadlift?.hard === 160, w?.[1]?.deadlift)
    // Cascade is computed on read: Medium = round(hard×0.95), Light = round(hard×0.90).
    ok('C1 deadlift medium computed = 152.5 (round 160×0.95)', w?.[1]?.deadlift?.medium === 152.5, w?.[1]?.deadlift?.medium)
    ok('C1 squat medium computed = 132.5 (round 140×0.95)', w?.[1]?.squat?.medium === 132.5, w?.[1]?.squat?.medium)

    // The motivating bug: a different cycle must NOT clobber another cycle's anchor.
    await repo.saveWorkingWeights(id, 3, { deadlift: { hard: 170 } })
    w = await repo.getWorkingWeights(id)
    ok('per-cycle isolation: C1 deadlift hard still 160', w?.[1]?.deadlift?.hard === 160, w?.[1]?.deadlift?.hard)
    ok('per-cycle isolation: C3 deadlift hard is 170', w?.[3]?.deadlift?.hard === 170, w?.[3]?.deadlift?.hard)

    // Re-saving C1 updates in place (no duplicate rows); cascade follows the new anchor.
    await repo.saveWorkingWeights(id, 1, { deadlift: { hard: 162.5 } })
    w = await repo.getWorkingWeights(id)
    ok('upsert updates C1 deadlift hard -> 162.5', w?.[1]?.deadlift?.hard === 162.5, w?.[1]?.deadlift?.hard)
    ok('cascade follows edit: C1 deadlift medium -> 155', w?.[1]?.deadlift?.medium === 155, w?.[1]?.deadlift?.medium)

    // Bench anchor: stored like any lift; cascade rounds at 2.5.
    await repo.saveWorkingWeights(id, 1, { bench: { hard: 100 } })
    w = await repo.getWorkingWeights(id)
    ok('C1 bench anchor = 100', w?.[1]?.bench?.hard === 100, w?.[1]?.bench)
    ok('bench medium computed at 2.5 kg = 95', w?.[1]?.bench?.medium === 95, w?.[1]?.bench?.medium)

    // Secondary lanes (db_row holds BB Row, pendlay_row holds Pull-ups): store/cascade
    // like any anchor — same LANES the row anchors have used since GiantFit.
    await repo.saveWorkingWeights(id, 1, { db_row: { hard: 30 }, pendlay_row: { hard: 60 } })
    w = await repo.getWorkingWeights(id)
    ok('C1 db_row anchor = 30 (BB Row lane)', w?.[1]?.db_row?.hard === 30, w?.[1]?.db_row)
    ok('db_row medium computed at 2.5 kg = 27.5 (round 30×0.95)', w?.[1]?.db_row?.medium === 27.5, w?.[1]?.db_row?.medium)
    ok('C1 pendlay_row anchor = 60 (Pull-ups lane)', w?.[1]?.pendlay_row?.hard === 60, w?.[1]?.pendlay_row)
    ok('pendlay_row light computed = 55 (round 60×0.90)', w?.[1]?.pendlay_row?.light === 55, w?.[1]?.pendlay_row?.light)

    // The CHECK rejects a lane key that isn't in the registry.
    let rejected = false
    try {
      await repo.saveWorkingWeights(id, 1, { not_a_lane: { hard: 10 } })
    } catch {
      rejected = true
    }
    ok('working_weights CHECK rejects an unknown lane key', rejected)

    console.log('Accessory weights (recorded per-cycle carries)')
    await repo.saveAccessoryWeights(id, 1, { carry_deadlift: 68, carry_ohp: 22.5, carry_squat: 70, carry_bench: 50 })
    const acc = await repo.getAccessoryWeights(id)
    ok('C1 carry_deadlift = 68', acc?.[1]?.carry_deadlift === 68, acc?.[1])
    ok('C1 carry_bench = 50 (Giant 2.0 bench-day carry)', acc?.[1]?.carry_bench === 50, acc?.[1])

    console.log('Sessions')
    const sid = `SMOKE-${id}-squat`
    const saved = await repo.saveSession({
      id: sid, macroId: id, date: '2099-01-04', cycle: 1, week: 1, weekType: 'training',
      dayType: 'squat', difficulty: 'hard', volumeDifficulty: 'light', topReps: 2, topWeight: 160, rpe: 'R8', barSpeed: 'normal',
      cardioCals: [15, 14, '', 15], blockCompletion: 'stopped_fatigue',
      volDone: true, volRpe: '', volSpeed: '', pullupCluster: '',
      carrySkipped: false, carrySkipReason: '', carryRounds: 3, carryDistance: 40, carryRpe: '', notes: 'smoke test',
      startedAt: '2099-01-04T08:00:00Z', endedAt: '2099-01-04T08:45:00Z',
    })
    ok('session saved, topWeight = 160', saved.topWeight === 160, saved.topWeight)
    ok('timer fields round-trip', !!saved.startedAt && !!saved.endedAt, { s: saved.startedAt, e: saved.endedAt })
    ok('volumeDifficulty round-trips = light', saved.volumeDifficulty === 'light', saved.volumeDifficulty)

    // Extra logging fields round-trip (per-round cardio cals, carry rounds+distance).
    ok('blockCompletion round-trips = stopped_fatigue', saved.blockCompletion === 'stopped_fatigue', saved.blockCompletion)
    ok('carryRounds round-trips = 3', saved.carryRounds === 3, saved.carryRounds)
    ok('carryDistance round-trips = 40', saved.carryDistance === 40, saved.carryDistance)
    ok('cardioCals = [15,14,null,15] (blank round -> NULL, length 4)',
      JSON.stringify(saved.cardioCals) === JSON.stringify([15, 14, null, 15]), saved.cardioCals)

    // "" -> NULL normalization at the raw row level.
    const { data: raw } = await supabase.from('sessions').select('carry_skip_reason,bar_speed').eq('id', sid).single()
    ok('empty carrySkipReason stored as NULL', raw.carry_skip_reason === null, raw.carry_skip_reason)
    ok('barSpeed preserved as "normal"', raw.bar_speed === 'normal', raw.bar_speed)

    // Idempotent update on the same id.
    await repo.saveSession({ ...saved, topWeight: 162.5, rpe: 'R9' })
    const sessions = await repo.getSessions(id)
    ok('session update: topWeight -> 162.5', sessions.find((s) => s.id === sid)?.topWeight === 162.5)
    ok('no duplicate session id', sessions.filter((s) => s.id === sid).length === 1)

    // bench is a valid sessions.day_type; carry_bench a valid accessory item.
    const bid = `SMOKE-${id}-bench`
    const benchSaved = await repo.saveSession({ ...saved, id: bid, dayType: 'bench', difficulty: 'hard' })
    ok('bench session saved', benchSaved.dayType === 'bench', benchSaved.dayType)
    await repo.deleteSession(bid)

    console.log('Giant Block accessory config (user-scoped, defaults merged)')
    const gbCfg = await repo.getGiantAccessoryConfig()
    ok('giant accessory config loads with defaults merged (ab_rollout + leg_raises)',
      ['ab_rollout', 'leg_raises'].every((k) => typeof gbCfg[k] === 'number'), gbCfg)

    console.log('Weekly Giant-difficulty rotation (user-scoped, defaults merged)')
    const diffCfg = await repo.getGiant2DifficultyConfig()
    ok('rotation config loads with weeks 1-3 present', [1, 2, 3].every((w) => diffCfg[w]?.squat), diffCfg)
    await repo.saveGiant2DifficultyConfig({ ...diffCfg, 1: { ...diffCfg[1], squat: 'light' } })
    ok('rotation override round-trips', (await repo.getGiant2DifficultyConfig())[1]?.squat === 'light')
    await repo.saveGiant2DifficultyConfig(diffCfg) // restore

    console.log('Movement library (user-scoped, seeded from code)')
    // USER-scoped, so there is no throwaway to isolate to — but the seed IS the
    // product's own bootstrap (additive, idempotent, and only ever written when
    // the library is empty), so running it here is the real first-boot path, not
    // test pollution. Nothing existing is ever modified.
    const lib = await repo.ensureSeedMovements()
    ok('movement library is seeded (>= the code seed size)', lib.length >= SEED_MOVEMENTS.length, lib.length)
    const libKeys = lib.map((m) => m.key)
    ok('no duplicate movement keys (unique(user_id,key) holds)', new Set(libKeys).size === libKeys.length, libKeys.length)
    ok('every seeded key is present', SEED_MOVEMENTS.every((s) => libKeys.includes(s.key)),
      SEED_MOVEMENTS.filter((s) => !libKeys.includes(s.key)).map((s) => s.key))
    // ensureSeedMovements is idempotent: a second call must not duplicate.
    const again = await repo.ensureSeedMovements()
    ok('ensureSeedMovements is idempotent (no re-seed)', again.length === lib.length, { before: lib.length, after: again.length })
    const anchoredCount = lib.filter((m) => m.loadType === 'anchored').length
    ok('capabilities round-trip (six anchored movements)', anchoredCount === 6, anchoredCount)

    console.log('Program version + slots (versioned slot assignment)')
    // Same reasoning as the movement library: user-scoped, and the seed IS the
    // product bootstrap — additive, idempotent, written only when the user has
    // no version. NOTHING reads these for prescription yet.
    const seeded = await repo.ensureSeedProgramVersion()
    ok('a program version exists', seeded.versions.length >= 1, seeded.versions[0])
    const v1 = seeded.versions[0]
    const v1Slots = seeded.slots.filter((s) => s.versionId === v1.id)
    ok('every anchored lane has a slot row', ANCHORED_LANES.every((lane) => v1Slots.some((s) => s.slotKey === lane)),
      ANCHORED_LANES.filter((lane) => !v1Slots.some((s) => s.slotKey === lane)))
    // The gate: the seeded version must validate against its own contracts.
    const violations = validateVersion(v1Slots, await repo.listMovements())
    ok('the seeded version passes every slot contract', violations.length === 0, violations)
    // ...and it resolves to a program with a main lift + carry on every day.
    const resolvedV1 = resolveProgram(v1, v1Slots, await repo.listMovements())
    ok('resolves a main lift and a carry for all four days',
      ['deadlift', 'ohp', 'squat', 'bench'].every((d) => resolvedV1.mainFor(d) && resolvedV1.carryFor(d)))
    ok('resolves the secondary on OHP/bench and nothing on DL/squat',
      !!resolvedV1.secondaryFor('ohp') && !!resolvedV1.secondaryFor('bench') &&
      resolvedV1.secondaryFor('deadlift') === null && resolvedV1.secondaryFor('squat') === null)
    const seededAgain = await repo.ensureSeedProgramVersion()
    ok('ensureSeedProgramVersion is idempotent (no second version)',
      seededAgain.versions.length === seeded.versions.length && seededAgain.slots.length === seeded.slots.length,
      { before: seeded.slots.length, after: seededAgain.slots.length })

    console.log('Capability logs (Hypertrophy + Oly — one row per movement per session)')
    const movementId = lib.find((m) => m.key === 'walking_lunge')?.id
    ok('walking_lunge resolves in the seeded library', !!movementId)
    if (movementId) {
      const hLog = await repo.saveHypertrophyLog({ sessionId: sid, movementId, weight: 30, repsDone: 12, notes: 'smoke' })
      ok('hypertrophy log saved', hLog.weight === 30 && hLog.repsDone === 12, hLog)
      await repo.saveHypertrophyLog({ ...hLog, weight: 32.5 })
      const hLogs = await repo.getHypertrophyLogs(id)
      ok('hypertrophy log upserts on (session,movement) -> 32.5', hLogs.find((l) => l.movementId === movementId)?.weight === 32.5)
      ok('no duplicate hypertrophy log row', hLogs.filter((l) => l.movementId === movementId).length === 1)
      ok('getAllHypertrophyLogs spans macros (includes throwaway log)', (await repo.getAllHypertrophyLogs()).some((l) => l.sessionId === sid))
    }
    const olyMovementId = lib.find((m) => m.key === 'oly_muscle_snatch')?.id
    if (olyMovementId) {
      const oLog = await repo.saveOlyLog({ sessionId: sid, movementId: olyMovementId, weight: 40, quality: 'Q3', notes: '' })
      ok('oly log saved with a quality mark', oLog.quality === 'Q3', oLog)
      ok('getAllOlyLogs spans macros (includes throwaway log)', (await repo.getAllOlyLogs()).some((l) => l.sessionId === sid))
    }

    await repo.deleteSession(sid)
    ok('session deleted', !(await repo.getSessions(id)).find((s) => s.id === sid))

    console.log('Deloads')
    await repo.setDeload(id, 'SMOKE-WEEK', true)
    ok('deload set', (await repo.getDeloads(id))['SMOKE-WEEK'] === true)
    ok('getAllDeloads spans macros (includes throwaway week)', (await repo.getAllDeloads())['SMOKE-WEEK'] === true)
    await repo.setDeload(id, 'SMOKE-WEEK', false)
    ok('deload unset', !(await repo.getDeloads(id))['SMOKE-WEEK'])

    console.log('Break days (user-scoped; far-future date)')
    await repo.setBreakDay('2099-01-01', true)
    ok('break day set', (await repo.getBreakDays())['2099-01-01'] === true)
    await repo.setBreakDay('2099-01-01', false)
    ok('break day unset', !(await repo.getBreakDays())['2099-01-01'])

    console.log('Bundle')
    const bundle = await repo.loadMacroBundle(id)
    ok('bundle returns all sections', !!(bundle && bundle.weights && bundle.sessions && 'deloads' in bundle))
    ok('bundle includes Capability logs', Array.isArray(bundle.hypertrophyLogs) && Array.isArray(bundle.olyLogs))

    // Roll forward: C3 weights/accessory -> new C1.
    // The rolled macro (number 1000) is briefly ACTIVE — deleted right here, and
    // the finally block also sweeps it so a crash can't leave it behind.
    console.log('Roll to next macro (carries C3 anchors + carries)')
    const next = await repo.rollToNextMacro({ currentMacroId: id, currentMacroNumber: TEST_MACRO_NUMBER, newStartISO: '2099-04-20' })
    ok('next macro created (number 1000)', next.number === TEST_MACRO_NUMBER + 1, next.number)
    ok('rolled macro is 13 weeks, not extended', next.weeks === 13 && next.deloadExtended === false, { w: next.weeks, e: next.deloadExtended })
    const nw = await repo.getWorkingWeights(next.id)
    ok('C3 weights carried as new C1 (deadlift 170)', nw?.[1]?.deadlift?.hard === 170, nw?.[1]?.deadlift)
    await supabase.from('macros').delete().eq('id', next.id)
    ok('rolled throwaway macro removed', !(await repo.getMacroByNumber(TEST_MACRO_NUMBER + 1)))

    // Recovery (Tendon Health). Only one ACTIVE protocol per user is allowed (DB index),
    // so skip the write round-trip if the user already has a real active protocol.
    console.log('Recovery (Tendon Health)')
    await supabase.from('recovery_protocols').delete().eq('start_date', '2099-01-01') // clean a prior crashed run
    if (await repo.getActiveProtocol()) {
      ok('recovery: user has an active protocol — skipping write round-trip', true)
    } else {
      const proto = await repo.startProtocol('knee', '2099-01-01')
      ok('protocol started (knee, active)', proto.joint === 'knee' && proto.status === 'active', proto)
      ok('getActiveProtocol returns it', (await repo.getActiveProtocol())?.id === proto.id)
      ok('phase override -> build', (await repo.setPhaseOverride(proto.id, 'build')).phaseOverride === 'build')
      ok('phase override cleared', (await repo.setPhaseOverride(proto.id, null)).phaseOverride === null)
      await repo.setTendonLog(proto.id, 'knee-patellar', '2099-01-02', true)
      ok('tendon logged done', (await repo.getTendonLogsForDate(proto.id, '2099-01-02'))['knee-patellar'] === true)
      await repo.setTendonLog(proto.id, 'knee-patellar', '2099-01-02', false)
      ok('tendon log removed', !(await repo.getTendonLogsForDate(proto.id, '2099-01-02'))['knee-patellar'])
      await repo.closeProtocol(proto.id, '2099-01-03')
      ok('no active protocol after close', !(await repo.getActiveProtocol()))
      await supabase.from('recovery_protocols').delete().eq('id', proto.id) // cascades logs
      ok('recovery protocol cleaned up', true)
    }
  } finally {
    console.log('Cleanup (delete throwaway macros — cascades to all their rows)')
    await supabase.from('macros').delete().eq('id', id)
    ok('throwaway macro + children removed', !(await repo.getMacroByNumber(TEST_MACRO_NUMBER)))
    // Sweep the roll-forward throwaway (ACTIVE!) in case the run crashed mid-roll.
    const leftoverNext = await repo.getMacroByNumber(TEST_MACRO_NUMBER + 1)
    if (leftoverNext) await supabase.from('macros').delete().eq('id', leftoverNext.id)
    await signOut()
  }

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nSMOKE TEST ERROR:', e?.message || e)
  process.exit(1)
})
