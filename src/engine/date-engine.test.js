import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  corePosition,
  computePosition,
  nextSessionFrom,
  enumerateMacro,
  parseLocalDate,
  mondayOf,
  isoLocal,
  isGiantFitDate,
  rotationLiftFor,
  strengthSlotIndex,
  capacityVariantFor,
  isGiant2Date,
  giant2GiantDifficultyFor,
  giant2VolumeDifficultyFor,
  capabilityProgramFor,
} from './date-engine'
import { GIANT2_START_DATE } from './constants'

const START = '2026-04-13' // Macro 2 began Monday 13 Apr 2026
const MACRO = 2

// Add n calendar days to an ISO date and return a local Date.
function dayAfterStart(n) {
  const d = parseLocalDate(START)
  d.setDate(d.getDate() + n)
  return d
}

test('anchor: 2026-04-13 -> M2 C1 W1 Deadlift Hard', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.macro, 2)
  assert.equal(p.meso, 1)
  assert.equal(p.week, 1)
  assert.equal(p.difficulty, 'hard')
  assert.equal(p.dayType, 'deadlift')
  assert.equal(p.isSessionDay, true)
  assert.equal(p.weekIndex, 0)
  assert.equal(p.displayWeekGlobal, 1)
})

test('anchor: 2026-06-22 -> M2 C3 W3 Squat Hard', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-06-22'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.meso, 3)
  assert.equal(p.week, 3)
  assert.equal(p.difficulty, 'hard')
  assert.equal(p.dayType, 'squat')
  assert.equal(p.weekIndex, 10)
})

test('rotation: W1 Wed = OHP Medium, Fri = Squat Light', () => {
  const wed = corePosition(START, MACRO, parseLocalDate('2026-04-15'))
  assert.equal(wed.difficulty, 'medium')
  assert.equal(wed.dayType, 'ohp')
  const fri = corePosition(START, MACRO, parseLocalDate('2026-04-17'))
  assert.equal(fri.difficulty, 'light')
  assert.equal(fri.dayType, 'squat')
})

test('non-session day (Tue) is not a session', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-14'))
  assert.equal(p.isSessionDay, false)
  assert.equal(p.dayType, null)
  assert.equal(p.weekType, 'training')
})

test('before macro start -> beforeStart', () => {
  const p = corePosition(START, MACRO, parseLocalDate('2026-04-12'))
  assert.equal(p.beforeStart, true)
  assert.equal(p.phase, 'upcoming')
})

// ---- 13-week macro (default shape) ------------------------------------------
test('13-week default: weekIndex 12 = deload, complete after it', () => {
  const deload = corePosition(START, MACRO, dayAfterStart(12 * 7))
  assert.equal(deload.weekType, 'deload')
  assert.equal(deload.meso, null)
  assert.equal(deload.week, null)
  assert.equal(deload.testRole, null) // no testing weeks in the 13-week schedule
  assert.equal(deload.totalWeeks, 13)
  const done = corePosition(START, MACRO, dayAfterStart(13 * 7))
  assert.equal(done.complete, true)
  assert.equal(done.phase, 'complete')
})

test('deload extension: week 13 is a second deload week, complete after 14', () => {
  const ext = { deloadExtended: true }
  const second = corePosition(START, MACRO, dayAfterStart(13 * 7), ext)
  assert.equal(second.weekType, 'deload')
  assert.equal(second.totalWeeks, 14)
  assert.equal(corePosition(START, MACRO, dayAfterStart(14 * 7), ext).complete, true)
  // Without the extension the same date is past the macro.
  assert.equal(corePosition(START, MACRO, dayAfterStart(13 * 7)).complete, true)
})

// ---- ACCEPTANCE (13-week restructure) ----------------------------------------
test('acceptance: 2026-07-20 under M2 (weeks 15) -> deload week', () => {
  const p = corePosition('2026-04-13', 2, parseLocalDate('2026-07-20'), { weeks: 15 })
  assert.equal(p.weekType, 'deload')
  assert.equal(p.displayWeekGlobal, 15)
  assert.equal(p.totalWeeks, 15)
  // Macro completes after that week.
  assert.equal(corePosition('2026-04-13', 2, parseLocalDate('2026-07-27'), { weeks: 15 }).complete, true)
})

test('acceptance: 2026-07-27 under a new M3 anchor -> M3 C1 W1 Deadlift MEDIUM (GiantFit C1 override)', () => {
  const p = corePosition('2026-07-27', 3, parseLocalDate('2026-07-27'))
  assert.equal(p.weekType, 'training')
  assert.equal(p.macro, 3)
  assert.equal(p.meso, 1)
  assert.equal(p.week, 1)
  assert.equal(p.dayType, 'deadlift') // the lift stays deadlift…
  assert.equal(p.difficulty, 'medium') // …only the difficulty drops (C1W1D1 override)
  assert.equal(p.giantfit, true)
  assert.equal(p.capacityVariant, 'A') // slot index 0 = even = A
  assert.equal(p.totalWeeks, 13)
})

// ---- legacy 15-week macros (lived testing weeks stay renderable) --------------
const LEGACY = { weeks: 15 }

test('legacy weeks=15: testing weeks (index 12-13): Mon/Fri = test, Wed = light', () => {
  const mon = corePosition(START, MACRO, dayAfterStart(12 * 7), LEGACY) // week 13 Monday
  assert.equal(mon.weekType, 'testing')
  assert.equal(mon.testRole, 'test')
  const wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2), LEGACY)
  assert.equal(wed.weekType, 'testing')
  assert.equal(wed.testRole, 'light')
  assert.equal(mon.meso, null) // no meso/week in special weeks
  assert.equal(mon.week, null)
})

test('legacy weeks=15: testing schedule W13 Mon=DL/Fri=Dips, W14 Mon=Squat/Fri=OHP', () => {
  const w13mon = corePosition(START, MACRO, dayAfterStart(12 * 7), LEGACY) // W13 Mon
  assert.equal(w13mon.testRole, 'test')
  assert.equal(w13mon.testLift, 'deadlift')
  const w13fri = corePosition(START, MACRO, dayAfterStart(12 * 7 + 4), LEGACY)
  assert.equal(w13fri.testLift, 'dips')
  const w13wed = corePosition(START, MACRO, dayAfterStart(12 * 7 + 2), LEGACY)
  assert.equal(w13wed.testRole, 'light')
  assert.equal(w13wed.testLift, null)
  const w14mon = corePosition(START, MACRO, dayAfterStart(13 * 7), LEGACY)
  assert.equal(w14mon.testLift, 'squat')
  const w14fri = corePosition(START, MACRO, dayAfterStart(13 * 7 + 4), LEGACY)
  assert.equal(w14fri.testLift, 'ohp')
})

test('legacy weeks=15: deload week (index 14), complete after 15', () => {
  const p = corePosition(START, MACRO, dayAfterStart(14 * 7), LEGACY)
  assert.equal(p.weekType, 'deload')
  const done = corePosition(START, MACRO, dayAfterStart(15 * 7), LEGACY)
  assert.equal(done.complete, true)
  assert.equal(done.phase, 'complete')
})

test('start date is snapped to its Monday', () => {
  // Passing a Wednesday start still anchors to Monday 2026-04-13.
  const p = corePosition('2026-04-15', MACRO, parseLocalDate('2026-04-13'))
  assert.equal(p.weekIndex, 0)
  assert.equal(p.dayType, 'deadlift')
})

test('computePosition attaches nextSession; from Tue -> Wed OHP Medium', () => {
  const p = computePosition(START, MACRO, parseLocalDate('2026-04-14'))
  assert.ok(p.nextSession)
  assert.equal(p.nextSession.date, '2026-04-15')
  assert.equal(p.nextSession.dayType, 'ohp')
  assert.equal(p.nextSession.difficulty, 'medium')
})

test('nextSessionFrom on a session day returns that same day', () => {
  const ns = nextSessionFrom(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(ns.date, '2026-04-13')
  assert.equal(ns.dayType, 'deadlift')
})

test('enumerateMacro: 13 rows by default, 14 extended, legacy 15 keeps testing rows', () => {
  const rows = enumerateMacro(START, MACRO)
  assert.equal(rows.length, 13)
  assert.equal(rows[0].cells.length, 3)
  assert.equal(rows[0].cells[0].date, '2026-04-13')
  assert.equal(rows[0].cells[0].dayType, 'deadlift')
  assert.equal(rows[0].cells[0].difficulty, 'hard')
  assert.equal(rows[11].weekType, 'training')
  assert.equal(rows[12].weekType, 'deload')

  const ext = enumerateMacro(START, MACRO, { deloadExtended: true })
  assert.equal(ext.length, 14)
  assert.equal(ext[13].weekType, 'deload')

  const legacy = enumerateMacro(START, MACRO, { weeks: 15 })
  assert.equal(legacy.length, 15)
  assert.equal(legacy[12].weekType, 'testing')
  assert.equal(legacy[14].weekType, 'deload')
})

test('helpers: mondayOf + isoLocal round-trip', () => {
  assert.equal(isoLocal(mondayOf(parseLocalDate('2026-06-23'))), '2026-06-22')
})

// ---- GiantFit era (dates on/after GIANTFIT_START_DATE = 2026-07-27) ---------
// The DATE decides the era: legacy Giant rules before the cutover (read-only
// history), GiantFit rotation + C1 override + capacity alternation after it.
const GF = '2026-07-27' // M3 anchor = the cutover Monday

test('cutover: date decides the era; pre-cutover positions are unchanged legacy', () => {
  assert.equal(isGiantFitDate('2026-07-26'), false)
  assert.equal(isGiantFitDate('2026-07-27'), true)
  const legacy = corePosition(START, MACRO, parseLocalDate('2026-04-13'))
  assert.equal(legacy.giantfit, false)
  assert.equal(legacy.capacityVariant, null)
  assert.equal(legacy.dayType, 'deadlift') // legacy golden intact
  assert.equal(legacy.difficulty, 'hard') // no C1 override before the cutover
})

test('GiantFit W1: DL Medium (override) / OHP Medium / Squat Light', () => {
  const mon = corePosition(GF, 3, parseLocalDate('2026-07-27'))
  assert.deepEqual([mon.dayType, mon.difficulty], ['deadlift', 'medium'])
  const wed = corePosition(GF, 3, parseLocalDate('2026-07-29'))
  assert.deepEqual([wed.dayType, wed.difficulty], ['ohp', 'medium'])
  const fri = corePosition(GF, 3, parseLocalDate('2026-07-31'))
  assert.deepEqual([fri.dayType, fri.difficulty], ['squat', 'light'])
})

// GIANT2_START_DATE (2026-08-10) is only 14 days after GIANTFIT_START_DATE
// (2026-07-27) — narrower than one mesocycle (28 days) — so a macro starting
// exactly at the GiantFit cutover can no longer reach C1 W3/W4 while still
// under pure GiantFit rules; those calendar slots are now Giant 2.0. The
// rotation TABLE itself (bench-for-dips across every week) still needs
// covering, so that part moves to the date-free rotationLiftFor helper; the
// live corePosition assertion below is trimmed to the one W2 date that's
// still reachable pre-cutover.
test('GiantFit rotation: bench replaces dips in every slot (rotationLiftFor, date-free)', () => {
  assert.equal(rotationLiftFor(1, 'hard', true), 'deadlift')
  assert.equal(rotationLiftFor(2, 'hard', true), 'bench')
  assert.equal(rotationLiftFor(2, 'medium', true), 'deadlift')
  assert.equal(rotationLiftFor(3, 'medium', true), 'bench')
  assert.equal(rotationLiftFor(4, 'light', true), 'bench')
  // Never dips, unlike the legacy rotation.
  for (let w = 1; w <= 4; w++) {
    for (const d of ['hard', 'medium', 'light']) assert.notEqual(rotationLiftFor(w, d, true), 'dips')
  }
})

test('GiantFit rotation: C1 W2 Monday is a normal Hard bench slot (still reachable pre-cutover)', () => {
  const w2mon = corePosition(GF, 3, parseLocalDate('2026-08-03'))
  assert.deepEqual([w2mon.dayType, w2mon.difficulty], ['bench', 'hard'])
})

test('C1 override applies ONLY to C1 W1 Day 1, never leaks into C2', () => {
  // C1 W2 Monday is a normal Hard slot (bench) — not overridden.
  const c1w2 = corePosition(GF, 3, parseLocalDate('2026-08-03'))
  assert.equal(c1w2.difficulty, 'hard')
  // C2 W1 Monday: Hard deadlift — C2/C3 untouched, so DL has no Hard day only
  // in C1. A macro starting at GIANTFIT_START_DATE can't reach its OWN C2 W1
  // before the Giant 2.0 cutover anymore (see note above) — use a macro that
  // started earlier so this particular Monday lands on its C2 W1 instead,
  // while still resolving under GiantFit rules (the date, not the macro
  // start, decides the era).
  const c2w1 = corePosition('2026-07-06', 3, parseLocalDate('2026-08-03'))
  assert.equal(c2w1.giantfit, true)
  assert.equal(c2w1.giant2, false)
  assert.equal(c2w1.meso, 2)
  assert.equal(c2w1.week, 1)
  assert.deepEqual([c2w1.dayType, c2w1.difficulty], ['deadlift', 'hard'])
})

test('capacity variant alternates by SCHEDULED slot index since the cutover', () => {
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-27')), 0)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-29')), 1)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-31')), 2)
  assert.equal(strengthSlotIndex(parseLocalDate('2026-08-03')), 3)
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-27')), 'A')
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-29')), 'B')
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-31')), 'A')
  assert.equal(capacityVariantFor(parseLocalDate('2026-08-03')), 'B')
  // Off-slot (Tue) and pre-cutover dates have no slot index / variant.
  assert.equal(strengthSlotIndex(parseLocalDate('2026-07-28')), null)
  assert.equal(capacityVariantFor(parseLocalDate('2026-07-20')), null)
  // Stamped on the position for session days.
  assert.equal(corePosition(GF, 3, parseLocalDate('2026-08-03')).capacityVariant, 'B')
})

test('GiantFit deload week: no day types (unchanged), but slots keep a variant', () => {
  // Same reachability note as the C1-override test above: a macro starting at
  // GIANTFIT_START_DATE hits its OWN deload week (12 weeks in) long after the
  // Giant 2.0 cutover now. Use a macro that started earlier so its deload
  // week Monday lands on a date that still resolves under GiantFit rules.
  const p = corePosition('2026-05-11', 3, parseLocalDate('2026-08-03')) // weekIndex 12 Monday
  assert.equal(p.giantfit, true)
  assert.equal(p.giant2, false)
  assert.equal(p.weekType, 'deload')
  assert.equal(p.dayType, null)
  assert.equal(p.capacityVariant, 'B') // slot index 3 for this date — alternation never desyncs
})

test('rotationLiftFor: era-aware peek helper', () => {
  assert.equal(rotationLiftFor(2, 'hard', true), 'bench')
  assert.equal(rotationLiftFor(2, 'hard', false), 'dips')
  assert.equal(rotationLiftFor(1, 'medium', true), 'ohp')
})

test('nextSession crosses into GiantFit lifts (Sun 2026-08-02 -> Mon bench Hard)', () => {
  const p = computePosition(GF, 3, parseLocalDate('2026-08-02'))
  assert.equal(p.nextSession.date, '2026-08-03')
  assert.equal(p.nextSession.dayType, 'bench')
  assert.equal(p.nextSession.difficulty, 'hard')
})

test('enumerateMacro post-cutover: GiantFit lifts + per-cell capacity variant', () => {
  const rows = enumerateMacro(GF, 3)
  assert.equal(rows.length, 13)
  assert.deepEqual(
    rows[0].cells.map((c) => [c.dayType, c.difficulty, c.capacityVariant]),
    [
      ['deadlift', 'medium', 'A'],
      ['ohp', 'medium', 'B'],
      ['squat', 'light', 'A'],
    ]
  )
  assert.equal(rows[1].cells[0].dayType, 'bench')
  assert.equal(rows[1].cells[0].capacityVariant, 'B')
  // No testing rows ever — 12 training weeks then the deload.
  assert.ok(rows.every((r) => r.weekType !== 'testing'))
  // Legacy enumeration carries no variant.
  assert.equal(enumerateMacro(START, MACRO)[0].cells[0].capacityVariant, null)
})

// ---- Giant 2.0 (from GIANT2_START_DATE) -------------------------------------
const G2 = GIANT2_START_DATE // 2026-08-10, a Monday

test('Giant 2.0: fixed Mon/Tue/Thu/Fri day->lift, no rotation, Wed/Sat/Sun rest', () => {
  const mon = corePosition(G2, 4, parseLocalDate('2026-08-10'))
  const tue = corePosition(G2, 4, parseLocalDate('2026-08-11'))
  const wed = corePosition(G2, 4, parseLocalDate('2026-08-12'))
  const thu = corePosition(G2, 4, parseLocalDate('2026-08-13'))
  const fri = corePosition(G2, 4, parseLocalDate('2026-08-14'))
  const sat = corePosition(G2, 4, parseLocalDate('2026-08-15'))
  const sun = corePosition(G2, 4, parseLocalDate('2026-08-16'))
  assert.equal(mon.dayType, 'squat')
  assert.equal(tue.dayType, 'bench')
  assert.equal(thu.dayType, 'deadlift')
  assert.equal(fri.dayType, 'ohp')
  assert.equal(mon.giant2, true)
  assert.equal(mon.giantfit, true) // chronologically also true — giant2 is the more specific flag
  for (const p of [wed, sat, sun]) {
    assert.equal(p.isSessionDay, false)
    assert.equal(p.dayType, null)
  }
})

test('Giant 2.0: week 1-3 Giant-difficulty matches the confirmed rotation, week 4 collapses per cycle', () => {
  // C1 W1: Squat Hard, Bench Medium, Deadlift Light, OHP Hard.
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-10')).difficulty, 'hard') // squat
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-11')).difficulty, 'medium') // bench
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-13')).difficulty, 'light') // deadlift
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-14')).difficulty, 'hard') // ohp
  // C1 W4 (2026-08-31 Mon .. 2026-09-04 Fri): every lift collapses to Light.
  const w4 = ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-04'].map((d) => corePosition(G2, 4, parseLocalDate(d)))
  assert.deepEqual(w4.map((p) => [p.week, p.difficulty]), [
    [4, 'light'],
    [4, 'light'],
    [4, 'light'],
    [4, 'light'],
  ])
  // C2 W4 collapses to Medium, C3 W4 to Hard.
  const c2w4mon = corePosition(G2, 4, parseLocalDate('2026-09-28')) // meso 2 week 4 Monday
  assert.equal(c2w4mon.meso, 2)
  assert.equal(c2w4mon.week, 4)
  assert.equal(c2w4mon.difficulty, 'medium')
  const c3w4mon = corePosition(G2, 4, parseLocalDate('2026-10-26')) // meso 3 week 4 Monday
  assert.equal(c3w4mon.meso, 3)
  assert.equal(c3w4mon.week, 4)
  assert.equal(c3w4mon.difficulty, 'hard')
})

test('Giant 2.0: the athlete Setup override wins on weeks 1-3, but NEVER on week 4 (always collapses)', () => {
  const config = { 1: { squat: 'light' } } // athlete overrides W1 squat away from the Hard default
  const w1 = corePosition(G2, 4, parseLocalDate('2026-08-10'), {}, config)
  assert.equal(w1.difficulty, 'light')
  // An unconfigured lift in a configured week still falls back to the default.
  const w1bench = corePosition(G2, 4, parseLocalDate('2026-08-11'), {}, config)
  assert.equal(w1bench.difficulty, 'medium')
  // Week 4 ignores the override entirely — GIANT2_WEEK4_DIFFICULTY always wins.
  const w4 = corePosition(G2, 4, parseLocalDate('2026-08-31'), {}, { 4: { squat: 'hard' } })
  assert.equal(w4.difficulty, 'light')
})

test('Giant 2.0: Volume difficulty is fixed per cycle, independent of the Giant difficulty, and drops entirely in C3 week 4', () => {
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-10')).volumeDifficulty, 'light') // C1
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-31')).volumeDifficulty, 'light') // C1 W4 too — Volume still runs
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-09-07')).volumeDifficulty, 'medium') // C2
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-10-05')).volumeDifficulty, 'hard') // C3
  const c3w4 = corePosition(G2, 4, parseLocalDate('2026-10-26'))
  assert.equal(c3w4.meso, 3)
  assert.equal(c3w4.week, 4)
  assert.equal(c3w4.difficulty, 'hard') // Giant still runs Hard...
  assert.equal(c3w4.volumeDifficulty, null) // ...but Volume is dropped entirely that week
})

test('Giant 2.0 deload week: DOES carry a dayType (fixed day->lift, deload or not) unlike GiantFit, but no H/M/L difficulty', () => {
  const mon = corePosition(G2, 4, parseLocalDate('2026-11-02')) // week 13 Monday
  assert.equal(mon.weekType, 'deload')
  assert.equal(mon.dayType, 'squat')
  assert.equal(mon.difficulty, null)
  assert.equal(mon.volumeDifficulty, null)
})

test('Giant 2.0 has no Capacity block: capacityVariant is always null, even on weekdays GiantFit used', () => {
  // Monday and Friday overlap GiantFit's own Mon/Wed/Fri capacity-slot weekdays —
  // must not accidentally inherit a variant from that unrelated mechanism.
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-10')).capacityVariant, null)
  assert.equal(corePosition(G2, 4, parseLocalDate('2026-08-14')).capacityVariant, null)
})

test('capabilityProgramFor: Hypertrophy C1, Oly C2, Carries C3', () => {
  assert.equal(capabilityProgramFor(1), 'hypertrophy')
  assert.equal(capabilityProgramFor(2), 'oly')
  assert.equal(capabilityProgramFor(3), 'carries')
})

test('giant2GiantDifficultyFor / giant2VolumeDifficultyFor: pure lookups match corePosition exactly', () => {
  assert.equal(giant2GiantDifficultyFor(1, 1, 'squat'), 'hard')
  assert.equal(giant2GiantDifficultyFor(1, 4, 'squat'), 'light') // week 4 collapse, ignores lift
  assert.equal(giant2GiantDifficultyFor(3, 4, 'ohp'), 'hard')
  assert.equal(giant2VolumeDifficultyFor(2, 1), 'medium')
  assert.equal(giant2VolumeDifficultyFor(3, 4), null)
})

test('isGiant2Date: the cutover Monday and after are Giant 2.0; the day before is not', () => {
  assert.equal(isGiant2Date('2026-08-09'), false)
  assert.equal(isGiant2Date('2026-08-10'), true)
  assert.equal(isGiant2Date('2026-09-01'), true)
})

test('the date decides the era regardless of the MACRO — an in-flight GiantFit macro crosses into Giant 2.0 rules on the cutover date, using its own week/meso clock', () => {
  // Documents real, intentional behavior (mirrors how the GiantFit cutover
  // itself worked): GiantFit is retired outright, not run alongside, so even
  // a macro that started under GiantFit renders Giant 2.0 from the cutover
  // date on — NOT a fresh C1 W1. To get a clean Giant 2.0 C1 W1 on the actual
  // cutover date, a NEW macro dated GIANT2_START_DATE must be started in Setup.
  const midCycleGiantFitStart = '2026-07-27' // GiantFit cutover itself
  const p = corePosition(midCycleGiantFitStart, 3, parseLocalDate('2026-08-10'))
  assert.equal(p.giant2, true)
  assert.equal(p.meso, 1) // this macro's OWN week 3 (weekIndex 2), not a fresh C1 W1
  assert.equal(p.week, 3)
  assert.equal(p.dayType, 'squat') // Giant 2.0 rules from here, regardless of the macro's own history
})

test('nextSessionFrom crosses the Giant 2.0 cutover mid-walk', () => {
  // Walking forward from the Sunday before the cutover (under a macro that
  // started well before it, still active) lands on the following Monday,
  // already under Giant 2.0 rules — using THIS macro's own week/meso (week 3
  // of C1, not a fresh W1; see the test above).
  const p = nextSessionFrom('2026-07-27', 3, parseLocalDate('2026-08-09'))
  assert.equal(p.date, '2026-08-10')
  assert.equal(p.dayType, 'squat')
  assert.equal(p.difficulty, 'light') // this macro's week 3, not a fresh C1 W1's Hard
  assert.equal(p.volumeDifficulty, 'light')
})

test('nextSessionFrom into a Giant 2.0 deload week surfaces the dayType (unlike GiantFit deload)', () => {
  const p = nextSessionFrom(G2, 4, parseLocalDate('2026-10-31')) // Saturday before deload week
  assert.equal(p.date, '2026-11-02')
  assert.equal(p.deload, true)
  assert.equal(p.dayType, 'squat')
  assert.equal(p.difficulty, null)
})

test('enumerateMacro: Giant 2.0 macro gets 4 cells/week (Mon/Tue/Thu/Fri), no Wed/Sat/Sun', () => {
  const rows = enumerateMacro(G2, 4)
  assert.equal(rows.length, 13)
  assert.deepEqual(
    rows[0].cells.map((c) => c.dayType),
    ['squat', 'bench', 'deadlift', 'ohp']
  )
  assert.deepEqual(
    rows[0].cells.map((c) => c.difficulty),
    ['hard', 'medium', 'light', 'hard']
  )
  assert.equal(rows[0].cells[0].volumeDifficulty, 'light')
  // Deload week (last row) still carries dayType, unlike GiantFit's deload cells.
  assert.equal(rows[12].cells[0].dayType, 'squat')
  assert.equal(rows[12].cells[0].difficulty, null)
})

test('enumerateMacro: a macro straddling the cutover shows 3 cells on the GiantFit side, 4 on the Giant 2.0 side', () => {
  const rows = enumerateMacro('2026-07-27', 3) // GiantFit start, runs well past 2026-08-10
  assert.equal(rows[0].cells.length, 3) // week 1: pre-cutover, GiantFit Mon/Wed/Fri
  assert.equal(rows[0].cells[0].date, '2026-07-27')
  const weekOfCutover = rows.find((r) => r.cells.some((c) => c.date === '2026-08-10'))
  assert.equal(weekOfCutover.cells.length, 4) // that week: Giant 2.0 Mon/Tue/Thu/Fri
})
