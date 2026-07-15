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

  // Deload extension (0013): boolean round-trips both ways.
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

    // Pull-up anchor (0009): stored like any lift; cascade rounds at 0.5, anchor exact.
    await repo.saveWorkingWeights(id, 1, { pullup: { hard: 10 }, dips: { hard: 1 } })
    w = await repo.getWorkingWeights(id)
    ok('C1 pullup anchor = 10', w?.[1]?.pullup?.hard === 10, w?.[1]?.pullup)
    ok('pullup medium computed at 0.5 kg = 9.5', w?.[1]?.pullup?.medium === 9.5, w?.[1]?.pullup?.medium)
    ok('dips 1 kg anchor stays exact (never rounded)', w?.[1]?.dips?.hard === 1, w?.[1]?.dips?.hard)

    console.log('Accessory weights (recorded per-cycle secondaries: lunge / RDL / row / carries)')
    await repo.saveAccessoryWeights(id, 1, { lunge_deadlift: 24, rdl_squat: 30, row_ohp: 22.5, carry_deadlift: 68 })
    const acc = await repo.getAccessoryWeights(id)
    ok('C1 lunge_deadlift = 24', acc?.[1]?.lunge_deadlift === 24, acc?.[1])
    ok('C1 rdl_squat = 30', acc?.[1]?.rdl_squat === 30, acc?.[1])
    ok('C1 row_ohp = 22.5', acc?.[1]?.row_ohp === 22.5, acc?.[1])
    ok('C1 carry_deadlift = 68', acc?.[1]?.carry_deadlift === 68, acc?.[1])

    console.log('Sessions')
    const sid = `SMOKE-${id}-deadlift-H`
    const saved = await repo.saveSession({
      id: sid, macroId: id, date: '2099-01-04', cycle: 1, week: 1, weekType: 'training',
      dayType: 'deadlift', difficulty: 'hard', topReps: 2, topWeight: 160, rpe: 'R8', barSpeed: 'normal',
      cardioCals: [15, 14, '', 15], blockCompletion: 'stopped_fatigue',
      volDone: true, volRpe: '', volSpeed: '', pullupCluster: '', dipsCluster: '7+3',
      carrySkipped: false, carrySkipReason: '', carryRounds: 3, carryDistance: 40, carryRpe: '', notes: 'smoke test',
      startedAt: '2099-01-04T08:00:00Z', endedAt: '2099-01-04T08:45:00Z',
    })
    ok('session saved, topWeight = 160', saved.topWeight === 160, saved.topWeight)
    ok('timer fields round-trip', !!saved.startedAt && !!saved.endedAt, { s: saved.startedAt, e: saved.endedAt })

    // Extra logging fields round-trip (per-round cardio cals, carry rounds+distance).
    ok('blockCompletion round-trips = stopped_fatigue', saved.blockCompletion === 'stopped_fatigue', saved.blockCompletion)
    ok('dipsCluster round-trips = 7+3', saved.dipsCluster === '7+3', saved.dipsCluster)
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
    await repo.deleteSession(sid)
    ok('session deleted', !(await repo.getSessions(id)).find((s) => s.id === sid))

    console.log('Testing results (idempotent on macro_id, lift, tested_on)')
    const t1 = await repo.saveTestingResult({ macroId: id, lift: 'deadlift', weight: 180, reps: 2, notes: 'first', testedOn: '2099-01-08' })
    ok('testing result saved, weight = 180', t1.weight === 180, t1.weight)
    // Re-save the SAME (lift, date) — must UPDATE in place, not duplicate (0003 key).
    await repo.saveTestingResult({ macroId: id, lift: 'deadlift', weight: 182.5, reps: 3, notes: 'redo', testedOn: '2099-01-08' })
    let tr = await repo.getTestingResults(id)
    ok('re-save updates same row -> 182.5', tr.find((t) => t.lift === 'deadlift')?.weight === 182.5)
    ok('no duplicate testing result', tr.filter((t) => t.lift === 'deadlift' && t.testedOn === '2099-01-08').length === 1)
    // A different date for the same lift is a distinct result.
    await repo.saveTestingResult({ macroId: id, lift: 'deadlift', weight: 185, reps: 2, notes: '', testedOn: '2099-01-15' })
    tr = await repo.getTestingResults(id)
    ok('different date = separate row (2 deadlift results)', tr.filter((t) => t.lift === 'deadlift').length === 2)
    ok('getAllTestingResults spans macros (includes throwaway rows)', (await repo.getAllTestingResults()).some((t) => t.macroId === id))

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

    console.log('Giant Run (reference pace, runs, distance targets)')
    // Reference pace P: stored exactly (never rounded), null = talk-test mode.
    let m999 = await repo.setMacroRefPace(id, 337)
    ok('ref pace set = 337 s/km (stored exact)', m999.refPaceS === 337, m999.refPaceS)
    m999 = await repo.setMacroRefPace(id, null)
    ok('ref pace cleared -> talk-test mode (null)', m999.refPaceS === null, m999.refPaceS)
    await repo.setMacroRefPace(id, 337) // leave set for the roll-carry test below

    const rid = '2099-01-05-run-E'
    const savedRun = await repo.saveRun({
      id: rid, macroId: id, date: '2099-01-05', cycle: 1, week: 1, weekType: 'training',
      runType: 'easy', distanceKm: 5.2, durationS: 1980, avgHr: 148, completion: 'completed', notes: 'smoke run',
    })
    ok('run saved, distance = 5.2', savedRun.distanceKm === 5.2, savedRun.distanceKm)
    ok('run duration/HR round-trip', savedRun.durationS === 1980 && savedRun.avgHr === 148, savedRun)
    // "" -> NULL normalization on the raw run row; completion mapped back to 'completed'.
    await repo.saveRun({ ...savedRun, avgHr: '', completion: '' })
    const { data: rawRun } = await supabase.from('runs').select('avg_hr,completion').eq('id', rid).single()
    ok('empty avgHr/completion stored as NULL', rawRun.avg_hr === null && rawRun.completion === null, rawRun)
    let runs = await repo.getRuns(id)
    ok('null completion reads back as completed', runs.find((r) => r.id === rid)?.completion === 'completed')
    // Terrain (0011): round-trips; legacy NULL reads back as road.
    await repo.saveRun({ ...savedRun, terrain: 'trail' })
    runs = await repo.getRuns(id)
    ok('terrain round-trips = trail', runs.find((r) => r.id === rid)?.terrain === 'trail')
    await supabase.from('runs').update({ terrain: null }).eq('id', rid) // simulate a pre-0011 row
    runs = await repo.getRuns(id)
    ok('legacy NULL terrain reads back as road', runs.find((r) => r.id === rid)?.terrain === 'road')
    // Bulletproof (0012): boolean round-trips; legacy NULL reads back as false.
    await repo.saveRun({ ...savedRun, bulletproof: true })
    runs = await repo.getRuns(id)
    ok('bulletproof round-trips = true', runs.find((r) => r.id === rid)?.bulletproof === true)
    await supabase.from('runs').update({ bulletproof: null }).eq('id', rid) // simulate a pre-0012 row
    runs = await repo.getRuns(id)
    ok('legacy NULL bulletproof reads back as false', runs.find((r) => r.id === rid)?.bulletproof === false)
    // Idempotent update on the same id.
    await repo.saveRun({ ...savedRun, completion: 'cut_fatigue', durationS: 2100 })
    runs = await repo.getRuns(id)
    ok('run update: completion -> cut_fatigue', runs.find((r) => r.id === rid)?.completion === 'cut_fatigue')
    ok('no duplicate run id', runs.filter((r) => r.id === rid).length === 1)
    ok('getAllRuns spans macros (includes throwaway run)', (await repo.getAllRuns()).some((r) => r.id === rid))
    await repo.deleteRun(rid)
    ok('run deleted', !(await repo.getRuns(id)).find((r) => r.id === rid))

    // Distance targets: per-cycle upsert + isolation, like accessory weights.
    await repo.saveRunTargets(id, 1, { easy: 3, quality: 3, long: 5 })
    await repo.saveRunTargets(id, 3, { easy: 4, quality: 4, long: 7 })
    let rt = await repo.getRunTargets(id)
    ok('C1 run targets = 3/3/5', rt?.[1]?.easy === 3 && rt?.[1]?.quality === 3 && rt?.[1]?.long === 5, rt?.[1])
    ok('per-cycle isolation: C3 long = 7', rt?.[3]?.long === 7, rt?.[3])
    await repo.saveRunTargets(id, 1, { easy: 3.5 })
    rt = await repo.getRunTargets(id)
    ok('target upsert updates in place -> 3.5', rt?.[1]?.easy === 3.5, rt?.[1]?.easy)

    console.log('Bundle')
    const bundle = await repo.loadMacroBundle(id)
    ok('bundle returns all sections', !!(bundle && bundle.weights && bundle.sessions && 'deloads' in bundle))
    ok('bundle includes runs + runTargets', Array.isArray(bundle.runs) && bundle.runTargets?.[1]?.easy === 3.5, bundle.runTargets?.[1])

    // Roll forward: C3 weights/accessory/run-targets -> new C1, ref pace copied.
    // The rolled macro (number 1000) is briefly ACTIVE — deleted right here, and
    // the finally block also sweeps it so a crash can't leave it behind.
    console.log('Roll to next macro (carries C3 + ref pace)')
    const next = await repo.rollToNextMacro({ currentMacroId: id, currentMacroNumber: TEST_MACRO_NUMBER, newStartISO: '2099-04-20' })
    ok('next macro created (number 1000)', next.number === TEST_MACRO_NUMBER + 1, next.number)
    ok('rolled macro is 13 weeks, not extended', next.weeks === 13 && next.deloadExtended === false, { w: next.weeks, e: next.deloadExtended })
    ok('ref pace carried -> 337', next.refPaceS === 337, next.refPaceS)
    const nrt = await repo.getRunTargets(next.id)
    ok('C3 run targets carried as new C1 (long 7)', nrt?.[1]?.long === 7, nrt?.[1])
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
