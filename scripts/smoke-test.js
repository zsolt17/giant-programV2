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
  const macro = await repo.createMacro({ number: TEST_MACRO_NUMBER, startISO: '2099-01-04', status: 'completed' })
  ok('created throwaway macro', !!macro && macro.number === TEST_MACRO_NUMBER, macro)
  const id = macro.id

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
      volDone: true, volRpe: '', volSpeed: '', pullupCluster: '',
      carrySkipped: false, carrySkipReason: '', carryRounds: 3, carryDistance: 40, carryRpe: '', notes: 'smoke test',
      startedAt: '2099-01-04T08:00:00Z', endedAt: '2099-01-04T08:45:00Z',
    })
    ok('session saved, topWeight = 160', saved.topWeight === 160, saved.topWeight)
    ok('timer fields round-trip', !!saved.startedAt && !!saved.endedAt, { s: saved.startedAt, e: saved.endedAt })

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

    console.log('Deloads')
    await repo.setDeload(id, 'SMOKE-WEEK', true)
    ok('deload set', (await repo.getDeloads(id))['SMOKE-WEEK'] === true)
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
  } finally {
    console.log('Cleanup (delete throwaway macro — cascades to all its rows)')
    await supabase.from('macros').delete().eq('id', id)
    ok('throwaway macro + children removed', !(await repo.getMacroByNumber(TEST_MACRO_NUMBER)))
    await signOut()
  }

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nSMOKE TEST ERROR:', e?.message || e)
  process.exit(1)
})
