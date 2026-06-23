// Step 2 verification: exercises the data layer against the LIVE Supabase DB.
// Signs in as your single user, runs full CRUD through repository.js, asserts
// round-trips + the per-cycle isolation guarantee + "" -> NULL normalization,
// then cleans up everything it created. Leaves the DB pristine for Step 4.
//
//   1) install Node, then `npm install`
//   2) put your Supabase user's password in .env.local (SMOKE_PASSWORD)
//   3) `npm run smoke`
import { supabase, signIn, signOut } from '../src/data/supabase.js'
import * as repo from '../src/data/repository.js'

const email = process.env.SMOKE_EMAIL
const password = process.env.SMOKE_PASSWORD

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

  console.log('Macros')
  let macro = await repo.getMacroByNumber(2)
  ok('macro 2 exists (seeded in Step 1)', !!macro, macro)
  if (!macro) macro = await repo.createMacro({ number: 2, startISO: '2026-04-13' })
  ok('macro start date is 2026-04-13', macro.startISO === '2026-04-13', macro.startISO)

  console.log('Working weights (per-cycle)')
  await repo.saveWorkingWeights(macro.id, 1, {
    deadlift: { hard: 160, medium: 150, light: 145 },
    squat: { hard: 140, medium: 135, light: 125 },
  })
  let w = await repo.getWorkingWeights(macro.id)
  ok('C1 deadlift hard = 160', w?.[1]?.deadlift?.hard === 160, w?.[1]?.deadlift)
  ok('C1 squat light = 125', w?.[1]?.squat?.light === 125, w?.[1]?.squat)

  // The motivating bug: a different cycle must NOT clobber another cycle's grid.
  await repo.saveWorkingWeights(macro.id, 3, { deadlift: { hard: 170, medium: 160, light: 155 } })
  w = await repo.getWorkingWeights(macro.id)
  ok('per-cycle isolation: C1 deadlift hard still 160', w?.[1]?.deadlift?.hard === 160, w?.[1]?.deadlift?.hard)
  ok('per-cycle isolation: C3 deadlift hard is 170', w?.[3]?.deadlift?.hard === 170, w?.[3]?.deadlift?.hard)

  // Re-saving C1 updates in place (no duplicate rows).
  await repo.saveWorkingWeights(macro.id, 1, { deadlift: { hard: 162.5, medium: 150, light: 145 } })
  w = await repo.getWorkingWeights(macro.id)
  ok('upsert updates C1 deadlift hard -> 162.5', w?.[1]?.deadlift?.hard === 162.5, w?.[1]?.deadlift?.hard)

  console.log('Accessory weights')
  await repo.saveAccessoryWeights(macro.id, 1, { clean: 70, carry_deadlift: 60 })
  const acc = await repo.getAccessoryWeights(macro.id)
  ok('C1 clean = 70', acc?.[1]?.clean === 70, acc?.[1])

  console.log('Sessions')
  const sid = 'SMOKE-2026-04-13-deadlift-H'
  const saved = await repo.saveSession({
    id: sid,
    macroId: macro.id,
    date: '2026-04-13',
    cycle: 1,
    week: 1,
    weekType: 'training',
    dayType: 'deadlift',
    difficulty: 'hard',
    topReps: 2,
    topWeight: 160,
    rpe: 'R8',
    barSpeed: 'normal',
    cleanLoad: '',
    cleanSpeed: '',
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pullupCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRpe: '',
    notes: 'smoke test',
  })
  ok('session saved, topWeight = 160', saved.topWeight === 160, saved.topWeight)

  // Verify "" -> NULL normalization at the raw row level.
  const { data: raw } = await supabase
    .from('sessions')
    .select('clean_speed,carry_skip_reason,bar_speed')
    .eq('id', sid)
    .single()
  ok('empty cleanSpeed stored as NULL', raw.clean_speed === null, raw.clean_speed)
  ok('empty carrySkipReason stored as NULL', raw.carry_skip_reason === null, raw.carry_skip_reason)
  ok('barSpeed preserved as "normal"', raw.bar_speed === 'normal', raw.bar_speed)

  // Idempotent update on the same id.
  await repo.saveSession({ ...saved, topWeight: 162.5, rpe: 'R9' })
  const sessions = await repo.getSessions(macro.id)
  const reread = sessions.find((s) => s.id === sid)
  ok('session update: topWeight -> 162.5', reread?.topWeight === 162.5, reread?.topWeight)
  ok('no duplicate session id', sessions.filter((s) => s.id === sid).length === 1)

  console.log('Deloads')
  await repo.setDeload(macro.id, 'SMOKE-WEEK', true)
  let dl = await repo.getDeloads(macro.id)
  ok('deload set', dl['SMOKE-WEEK'] === true)
  await repo.setDeload(macro.id, 'SMOKE-WEEK', false)
  dl = await repo.getDeloads(macro.id)
  ok('deload unset', !dl['SMOKE-WEEK'])

  console.log('Break days')
  await repo.setBreakDay('2099-01-01', true)
  let bd = await repo.getBreakDays()
  ok('break day set', bd['2099-01-01'] === true)
  await repo.setBreakDay('2099-01-01', false)
  bd = await repo.getBreakDays()
  ok('break day unset', !bd['2099-01-01'])

  console.log('Bundle')
  const bundle = await repo.loadMacroBundle(macro.id)
  ok('bundle returns all sections', !!(bundle && bundle.weights && bundle.sessions && 'deloads' in bundle))

  console.log('Cleanup')
  await repo.deleteSession(sid)
  const after = await repo.getSessions(macro.id)
  ok('session deleted', !after.find((s) => s.id === sid))
  // Remove the test weights/accessory rows so Step 4 starts from a clean slate.
  await supabase.from('working_weights').delete().eq('macro_id', macro.id)
  await supabase.from('accessory_weights').delete().eq('macro_id', macro.id)
  const wAfter = await repo.getWorkingWeights(macro.id)
  ok('working weights cleared', Object.keys(wAfter).length === 0, Object.keys(wAfter))

  await signOut()
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nSMOKE TEST ERROR:', e?.message || e)
  process.exit(1)
})
