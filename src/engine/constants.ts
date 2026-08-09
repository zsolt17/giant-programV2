// Program constants — ported verbatim from the working index.html. These encode
// the fixed structure of The Giant Program and must not drift.
import type { Difficulty, Lift, AnchorLift, Scheme, DayMeta, RunType, RunSlotKey, Terrain, CapabilityProgram } from './types'

// LEGACY Giant rotation (pre-cutover dates only — read-only history rendering).
// 4 lifts across 3 weekly slots (Mon=hard, Wed=medium, Fri=light), repeating
// every 4 weeks (one mesocycle). Index = (weekInMeso - 1).
export const ROTATION: Record<Difficulty, Lift>[] = [
  { hard: 'deadlift', medium: 'ohp', light: 'squat' },
  { hard: 'dips', medium: 'deadlift', light: 'ohp' },
  { hard: 'squat', medium: 'dips', light: 'deadlift' },
  { hard: 'ohp', medium: 'squat', light: 'dips' },
]

// ---- GiantFit schedule (successor program, from the cutover) ----------------
// Cutover date — a MONDAY, set by the athlete. Dates BEFORE it schedule/render
// with the legacy Giant rules above; dates ON/AFTER it use the GiantFit rules.
// Old rows are never migrated — the date decides the era.
export const GIANTFIT_START_DATE = '2026-07-27'

// GiantFit lift rotation — Bench replaces the retired dips; same 4-week
// realignment across the Mon/Wed/Fri slots. Index = (weekInMeso - 1).
export const GIANTFIT_ROTATION: Record<Difficulty, Lift>[] = [
  { hard: 'deadlift', medium: 'ohp', light: 'squat' },
  { hard: 'bench', medium: 'deadlift', light: 'ohp' },
  { hard: 'squat', medium: 'bench', light: 'deadlift' },
  { hard: 'ohp', medium: 'squat', light: 'bench' },
]

// GiantFit session pairings: each strength day's Giant Block row pairing.
// Deadlift and squat train ALONE (corrected 2026-07-24 — DL briefly shipped
// with a DB Row pairing; logged rows from that window stay renderable).
export const GIANTFIT_PAIRING: Record<Lift, string | null> = {
  deadlift: null,
  ohp: 'DB Row',
  squat: null,
  bench: 'Pendlay Row',
  dips: null, // retired Giant-era lift — never scheduled post-cutover
}

// The day's ANCHORED row (2026-07-30 revision): the paired rows carry their own
// per-cycle anchor and cascade like any lift — build-up, ladder, and volume all
// derive from the ROW's anchor, never the day's main lift.
export const GIANTFIT_ROW: Partial<Record<Lift, AnchorLift>> = { ohp: 'db_row', bench: 'pendlay_row' }

// Giant Block rep count for the anchored row, by day difficulty. FIXED per set —
// the loads still climb the SET_LADDER, only the main lift's reps descend.
export const GIANTFIT_ROW_REPS: Record<Difficulty, number> = { hard: 8, medium: 9, light: 10 }

// Giant Block bodyweight accessory per day (2026-07-30 revision): rep-only, no
// load. `reps` is the app default; the athlete's rep target is configurable in
// Setup (giant_accessory_config, capacity-config pattern) and merged over it.
export const GIANTFIT_GB_ACCESSORY: Partial<Record<Lift, { key: string; name: string; reps: number }>> = {
  deadlift: { key: 'ab_rollout', name: 'Ab Rollout', reps: 10 },
  ohp: { key: 'toes_to_bar', name: 'Toes-to-Bar', reps: 10 },
  squat: { key: 'ghd_abs', name: 'GHD Abs', reps: 10 },
  bench: { key: 'ghd_back_ext', name: 'GHD Back Extension', reps: 10 },
}
// The all-defaults rep-target map ({ key: reps }) — what a fresh user sees;
// stored Setup values are merged over it on read.
export const GIANTFIT_GB_DEFAULT_REPS: Record<string, number> = Object.fromEntries(
  Object.values(GIANTFIT_GB_ACCESSORY).map((m) => [m.key, m.reps])
)

// GiantFit warm-up activation — a fixed list done before the barbell build-up.
// Replaces the Giant-era GOWOD flows: no GOWOD reference in GiantFit sessions.
export const GIANTFIT_ACTIVATION: { name: string; dose: string }[] = [
  { name: 'Band pull-aparts', dose: '×20' },
  { name: 'Face pulls', dose: '×15' },
  { name: 'Hip airplanes', dose: '×5/side' },
  { name: 'Deep squat hold', dose: '×30 sec' },
  { name: 'Thoracic rotations', dose: '×5/side' },
]

// Giant Block rep schemes (4 descending sets) + volume reps. The reps differentiate
// the days; the load percentages are the uniform SET_LADDER below (single-anchor model).
export const SCHEMES: Record<Difficulty, Scheme> = {
  hard: { sets: [8, 6, 4, 2], vol: 6 },
  medium: { sets: [9, 7, 5, 3], vol: 8 },
  light: { sets: [10, 8, 6, 4], vol: 10 },
}

// ---- single-anchor loading engine -----------------------------------------
// Only the Hard top set is stored (per lift, per cycle); every other load cascades
// off it. These are the fixed constants — call sites use these names, never literals.
// Day-to-day top-set spread, as a fraction of the Hard top.
export const DAY_SPREAD: Record<Difficulty, number> = { hard: 1.0, medium: 0.95, light: 0.9 }
// Within-day ladder: each of the 4 Giant Block sets as a fraction of that day's top.
// Uniform across all days — the rep scheme (SCHEMES) differentiates the days, not the load %.
export const SET_LADDER: number[] = [0.85, 0.9, 0.95, 1.0]
// Volume block = this fraction of the day's top set.
export const VOLUME_PCT = 0.8
// Rounding increment for DERIVED loads (the anchor itself is never rounded —
// user input stays exactly as entered). All lifts are barbell moves in 2.5 kg
// plates. (The Giant-era 0.5 kg dips/pull-up increment is retired with GiantFit.)
export const DEFAULT_INCREMENT = 2.5

// GiantFit anchor lifts — the per-cycle Hard-top anchors Setup shows and writes,
// and the set rollToNextMacro carries forward. The rows (2026-07-30 revision) are
// full anchors with the identical cascade: DB Row on OHP day (anchor = kg PER
// HAND), Pendlay Row on bench day. Legacy 'dips'/'pullup' anchor rows still LOAD
// (old sessions render off them) but are never written again.
export const ANCHOR_LIFTS: AnchorLift[] = ['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row']
export const ANCHOR_LABEL: Record<string, string> = {
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  squat: 'Back Squat',
  bench: 'Bench Press',
  db_row: 'DB Row',
  pendlay_row: 'Pendlay Row',
}
// Optional per-anchor entry hint shown next to the Setup label (data-driven —
// no per-lift branching in the UI).
export const ANCHOR_NOTE: Partial<Record<AnchorLift, string>> = { db_row: 'per hand' }

// Barbell build-up sets: 8-5-3-2 reps at ~40/55/70/85% of Giant Block Set 1.
export const WU_PCT: number[] = [0.4, 0.55, 0.7, 0.85]
export const WU_REPS: number[] = [8, 5, 3, 2]

// Pull-up phase-1 target reps per Giant Block round, by difficulty.
export const PULLUP: Record<Difficulty, number> = { hard: 10, medium: 8, light: 6 }

export const LIFT_LABEL: Record<Lift, string> = {
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  squat: 'Back Squat',
  bench: 'Bench Press',
  dips: 'Weighted Ring Dips',
}
export const LIFT_SHORT: Record<Lift, string> = { deadlift: 'Deadlift', ohp: 'OHP', squat: 'Squat', bench: 'Bench', dips: 'Dips' }

// Days whose Giant Block secondary carries a recorded per-cycle weight
// (accessory_weights.item): Reverse Lunge (DL), one-arm DB row (OHP), B-stance RDL
// (Squat). Dips (pull-ups) is bodyweight → no entry.
export const SECONDARY_ITEM: Partial<Record<Lift, string>> = { deadlift: 'lunge_deadlift', ohp: 'row_ohp', squat: 'rdl_squat' }

// Giant Block completion (adherence) categories. 'completed' = as prescribed (default);
// the rest are fail reasons that drive the deload S6 signal. Stored categorically.
export const BLOCK_COMPLETION: { id: string; label: string }[] = [
  { id: 'failed_heavy', label: 'Failed reps — too heavy' },
  { id: 'stopped_fatigue', label: 'Stopped early — fatigue' },
  { id: 'stopped_form', label: 'Stopped early — form breakdown' },
  { id: 'reduced_weight', label: 'Reduced weight mid-block' },
  { id: 'cut_time', label: 'Cut short — time' },
]

// Secondary / core / carry per lift day. ("Secondary" = the Giant Block's second
// movement; the lower-day ones aren't strict antagonists.)
export const DAY_META: Record<Lift, DayMeta> = {
  deadlift: {
    secondary: 'Reverse Lunge',
    secondaryType: 'lunge',
    core: 'Ab Rollout',
    carry: { name: "Farmer's Carry", load: '60 kg / hand', perHand: true, dist: '20–30 m', sets: '3–4' },
  },
  ohp: {
    secondary: 'One-Arm DB Row',
    secondaryType: 'dbrow',
    core: 'GHD Abs',
    carry: { name: 'Overhead Carry', load: '2 × 20 kg', perHand: true, dist: '20 m / side', sets: '3–4' },
  },
  squat: {
    secondary: 'B-Stance DB RDL',
    secondaryType: 'rdl',
    core: 'Strict Toes-to-Bar',
    carry: { name: 'Sandbag Bear Hug', load: '68 kg', perHand: false, dist: '20–30 m', sets: '3–4' },
  },
  dips: {
    secondary: 'Pull-ups',
    secondaryType: 'pullup',
    core: 'GHD Back Extension',
    carry: { name: 'Suitcase Carry', load: '50 kg / hand', perHand: true, dist: '20 m / side', sets: '3–4' },
  },
  // GiantFit bench day: paired with Pendlay Row (GIANTFIT_PAIRING); carry =
  // Suitcase (the GiantFit mapping — DL Farmers / OHP Overhead / Squat Bearhug /
  // Bench Suitcase; the first three keep their existing entries above). `core`
  // is never rendered on GiantFit days (no core circuit slot).
  bench: {
    secondary: 'Pendlay Row',
    secondaryType: 'pendlay',
    core: '—',
    carry: { name: 'Suitcase Carry', load: '50 kg / hand', perHand: true, dist: '20 m / side', sets: '3–4' },
  },
}

// GiantFit carry starting loads seeded into Setup when a cycle's value is blank
// (editable like any carry weight; persists on the next Setup save). Only the
// Suitcase (bench day) has a program default — the others are athlete-set.
export const GIANTFIT_CARRY_DEFAULTS: Record<string, number> = { carry_bench: 50 }

// GiantFit accessory items (the four per-day carries) — what Setup shows/writes
// and what rollToNextMacro carries forward. Legacy items (lunge/rdl/row,
// carry_dips) stay readable for pre-cutover history but are never written again.
export const GIANTFIT_ACC_ITEMS = ['carry_deadlift', 'carry_ohp', 'carry_squat', 'carry_bench']

// Reactive-deload signals (revised rule — brief §5; supersedes the v7 book §7).
// S4 (Set 1 > R7) was retired. S6 = capacity ADHERENCE (2026-07-31: replaced the
// capacity time trend, which measured the gym rather than the athlete); S7
// (giant-block completion — numbered S6 in the Giant era) keeps firing off its
// own completion control. Signals are computed, never stored, so history simply
// re-renders under the new definitions.
export const SIGNALS: { id: string; label: string }[] = [
  { id: 'S1', label: 'Any day, top set R9.5+' },
  { id: 'S2', label: 'Volume block incomplete' },
  { id: 'S3', label: 'Carry skipped (fatigue)' },
  { id: 'S5', label: 'Bar speed ↓ on top set in 2+ sessions' },
  { id: 'S6', label: 'Capacity not completed as prescribed (fatigue)' },
  { id: 'S7', label: 'Giant block not completed as prescribed' },
]

// Capacity-block adherence (mirrors BLOCK_COMPLETION). 'completed' = as
// prescribed (the default; null/'' on legacy rows reads the same). The firing
// rule lives in the VALUE NAMES: any *_fatigue value is an S6 occurrence,
// nothing else is — the same fatigue-vs-schedule discrimination
// carry_skip_reason makes. Attribution is the athlete's at log time, never
// inferred from the clock.
export const CAPACITY_COMPLETION: { id: string; label: string }[] = [
  { id: 'completed', label: 'Completed as prescribed' },
  { id: 'cut_short_fatigue', label: 'Cut short — fatigue' },
  { id: 'cut_short_time', label: 'Cut short — time' },
  { id: 'scaled_fatigue', label: 'Scaled — fatigue' },
  { id: 'scaled_other', label: 'Scaled — other' },
]
// The single place the firing rule is expressed.
export const isCapacityFatigue = (completion: string | null | undefined): boolean => !!completion && completion.endsWith('_fatigue')

// Macro shape: 12 training weeks (three 4-week mesocycles) + 1 deload week,
// extendable to a second identical deload week by the athlete (macro-level
// deload_extended flag). This is the DEFAULT — the engine reads the macro's
// stored `weeks` so legacy 15-week macros (lived testing weeks) keep rendering.
export const MACRO_WEEKS = 13
export const DAY_SLOT: Record<number, Difficulty> = { 1: 'hard', 3: 'medium', 5: 'light' } // Mon/Wed/Fri -> difficulty

// LEGACY testing weeks (removed from the 13-week schedule; reachable only via
// weeks=15 macros so their logged history stays renderable): which lift was
// tested on which day. Keyed by weekIndex (12 = W13, 13 = W14) then weekday
// (1 Mon, 5 Fri). Wed = light.
export const TESTING_SCHEDULE: Record<number, Record<number, Lift>> = {
  12: { 1: 'deadlift', 5: 'dips' },
  13: { 1: 'squat', 5: 'ohp' },
}

// ---- The Giant Run (companion running program) -----------------------------
// Three runs a week on the lift off-days. The SLOT is fixed by weekday (targets
// key off it); the run TYPE performed in the Thu slot is easy during mesocycle 1.
export const RUN_SLOT_BY_DOW: Record<number, RunSlotKey> = { 2: 'easy', 4: 'quality', 6: 'long' } // Tue/Thu/Sat
// Pace cascade off the single per-macro reference pace P (seconds/km).
// P itself is never rounded — user input (or a TT result) stays exactly as set;
// rounding applies only to DERIVED prescription paces.
export const EASY_OFFSET_S = 75 // Easy pace = P + 75 s/km
export const QUALITY_OFFSET_MIN_S = 15 // Quality pace range = P + 15 … P + 40 s/km
export const QUALITY_OFFSET_MAX_S = 40
export const PACE_ROUND_S = 5 // derived paces round to the nearest 5 s/km
export const TT_KM = 5 // testing-week Saturday time trial is a fixed 5 km
// R3 (pace-at-HR degraded): a run counts as degraded when it is at least this much
// slower (s/km) than the most recent prior same-type run at same-or-higher avg HR.
export const PACE_DEGRADE_S = 10

export const RUN_TYPE_LABEL: Record<RunType, string> = {
  easy: 'Easy',
  quality: 'Quality',
  long: 'Long',
  tt: 'Time Trial',
}

// Structure description shown at the top of each run session view (Today +
// RunModal), mirroring how lift days describe their blocks. Keyed by what the
// day RESOLVES to, plus 'deload' for W15 / reactive-deload weeks — a C1
// Thursday resolves to 'easy', so it shows the easy text. In pace mode the
// engine appends the computed pace guidance (runStructureText in runs.ts).
export type RunStructureKey = RunType | 'deload'
export const RUN_STRUCTURE: Record<RunStructureKey, string> = {
  easy:
    'Steady conversational jog, start to finish — no structure needed. Flat or gentle terrain. ' +
    'Talk test the whole way: full sentences, always. Should end feeling like you cheated.',
  quality:
    'Easy warm-up jog (~10 min) → quality blocks: 15–20 total minutes at quality pace, as tempo ' +
    'blocks (e.g. 3 × 5 min, 2–3 min easy jog between) or cruise intervals (e.g. 5 × 3 min, short ' +
    'jog between) → easy cool-down jog (~5–10 min). Each block ends with more in the tank — if ' +
    'holding pace would take a grind, the session ends.',
  long:
    "One continuous conversational run — the week's longest, and its easiest effort. Trail and " +
    'terrain welcome; pace ambition is not. Talk test throughout. This is the engine builder: ' +
    'distance progresses here first, pace never does by intent.',
  tt:
    'Easy warm-up jog (~10 min) with a few short pick-ups → 5k at an honest hard effort: strong ' +
    'throughout, never desperate, finish knowing a sprint was still there → easy cool-down jog. ' +
    'The result is recorded, not chased — it becomes the new reference pace.',
  deload: "Optional, short, easy only. A gentle jog if you feel like moving; nothing if you don't.",
}

// Terrain wording, appended to the structure descriptions (runStructureText):
// quality/tt are standing rules of those days (always shown); the trail note is
// contextual — shown on easy/long/deload days while the Trail toggle is selected.
export const RUN_TERRAIN_NOTE = {
  trail:
    'Trail: ignore pace — talk test governs. Hiking steep climbs at conversational effort counts as easy running.',
  quality: 'Quality runs on flat/road only — trails are for easy days.',
  tt: 'Always the same flat route, every macro.',
} as const

export const TERRAIN_LABEL: Record<Terrain, string> = { road: 'Road', trail: 'Trail' }

// Bulletproof — the fixed post-run injury-prevention circuit (5–10 min),
// shown after the run log on every run type (the runner's "carry block").
// One done-boolean per run; no per-exercise logging — habit, not training log.
export const BULLETPROOF_ITEMS: { name: string; dose: string; optional?: true }[] = [
  { name: 'Calf raises, slow 3-sec eccentric', dose: '2×15 straight-knee + 1×12 bent-knee (off a step)' },
  { name: 'Tibialis raises', dose: '2×20 (wall-supported)' },
  { name: 'Single-leg balance', dose: '30–45s per side' },
  { name: 'Seated leg raises over obstacle', dose: '2×12–15 per side' },
  { name: 'Plantar rolling', dose: '30s per foot', optional: true },
]
export const BULLETPROOF_NOTE = 'RPE 5–6, never hard. After long runs, drop a set if legs are cooked.'

// Run completion (categorical, mirrors BLOCK_COMPLETION): 'completed' = default;
// the fail reasons drive the run deload signals (R1 fatigue-cut, R2 felt heavy).
export const RUN_COMPLETION: { id: string; label: string }[] = [
  { id: 'cut_fatigue', label: 'Cut short — fatigue' },
  { id: 'cut_schedule', label: 'Cut short — schedule' },
  { id: 'felt_heavy', label: 'Felt heavy — talk test failed' },
]

// Run-derived reactive-deload signals, pooled with the lift SIGNALS (same weekly
// trigger: 3+ occurrences across 2+ sessions, lifts and runs together).
export const RUN_SIGNALS: { id: string; label: string }[] = [
  { id: 'R1', label: 'Run cut short (fatigue)' },
  { id: 'R2', label: 'Felt heavy / talk test failed' },
  { id: 'R3', label: 'Pace at HR degraded on 2+ runs' },
]

// ---- Giant 2.0 (successor to GiantFit, from the second cutover) ------------
// Cutover date — a MONDAY, mirroring GIANTFIT_START_DATE's own role: dates
// BEFORE it keep rendering under whichever rules already applied to them
// (GiantFit, or legacy Giant); dates ON/AFTER it are Giant 2.0. GiantFit is
// RETIRED, not run alongside Giant 2.0 — there is no program-type selector,
// the date alone decides the era, exactly like the GiantFit cutover before it.
export const GIANT2_START_DATE = '2026-08-10'

// Fixed weekday -> lift, no rotation (unlike every era before it). JS
// Date#getDay(): 1 Mon, 2 Tue, 4 Thu, 5 Fri. Wed/Sat/Sun are rest.
export const GIANT2_DAY_LIFT: Record<number, Lift> = { 1: 'squat', 2: 'bench', 4: 'deadlift', 5: 'ohp' }
export const GIANT2_SESSION_DAYS: number[] = [1, 2, 4, 5]

// Upper/lower day-typing — drives the Primer block's band-activation choice
// (Crossover Symmetry / Hip Halo) and bodyweight-ramp movement list.
export const GIANT2_DAY_TYPE: Partial<Record<Lift, 'upper' | 'lower'>> = { squat: 'lower', deadlift: 'lower', bench: 'upper', ohp: 'upper' }

// Giant-difficulty weekly rotation for weeks 1-3 of EVERY cycle (repeats
// identically C1/C2/C3 — confirmed against the athlete's 13-week calendar,
// 2026-08-09). The athlete's own Setup edits (giant2_giant_difficulty) merge
// OVER this on read, capacity-config pattern — this is only the default.
// Each lift touches Hard/Medium/Light exactly once across the 3 weeks; one
// tier doubles up each week (4 lifts, 3 tiers).
export const GIANT2_GIANT_DEFAULT_ROTATION: Record<number, Partial<Record<Lift, Difficulty>>> = {
  1: { squat: 'hard', bench: 'medium', deadlift: 'light', ohp: 'hard' },
  2: { squat: 'medium', bench: 'light', deadlift: 'hard', ohp: 'medium' },
  3: { squat: 'light', bench: 'hard', deadlift: 'medium', ohp: 'light' },
}
// Week 4 of every cycle collapses to ONE difficulty for all 4 sessions that
// week — a pure function of the cycle, never stored, never per-lift.
export const GIANT2_WEEK4_DIFFICULTY: Record<number, Difficulty> = { 1: 'light', 2: 'medium', 3: 'hard' }

// Volume block difficulty is fixed for an entire cycle (independent of the
// Giant block's difficulty, and independent of week) — Light throughout C1,
// Medium throughout C2, Hard throughout C3, EXCEPT C3 week 4 where the Volume
// block is dropped entirely (semi-peak week); callers must check that
// exception separately (see volumeDifficultyFor in date-engine.ts).
export const GIANT2_VOLUME_DIFFICULTY_BY_CYCLE: Record<number, Difficulty> = { 1: 'light', 2: 'medium', 3: 'hard' }

// The Capability block's content is a property of the CYCLE, not the week or
// session — this is the "one level further" than GiantFit's Move 1 modularity
// (which only made exercises WITHIN a fixed block into data): here the BLOCK
// ITSELF changes shape by cycle. The slot inventory for all three programs is
// registered in engine/program.ts; this map only says which one a cycle reads.
export const GIANT2_CAPABILITY_BY_CYCLE: Record<number, CapabilityProgram> = { 1: 'hypertrophy', 2: 'oly', 3: 'carries' }

// Giant/Volume block secondary occupant per day (the anchored lane's Giant
// 2.0 content — reuses the 'db_row'/'pendlay_row' LANES from working_weights
// unchanged; only the occupant swaps, per ANCHORED_LANES discipline).
// Squat/Deadlift train alone, same as GiantFit.
export const GIANT2_SECONDARY_KEY: Partial<Record<Lift, string>> = { ohp: 'bb_row', bench: 'pullup' }
// Giant block bodyweight accessory per day — Ab-Roll reuses the existing
// ab_rollout movement (same exercise as GiantFit's), Leg Raises is new.
export const GIANT2_GB_ACCESSORY_KEY: Partial<Record<Lift, string>> = { squat: 'ab_rollout', deadlift: 'ab_rollout', bench: 'leg_raises', ohp: 'leg_raises' }

// Primer bodyweight ramp — 1-2-3 ascending rep scheme (round i = i reps of
// every movement in the group), 3 rounds, tempo not tracked (2026-08-09
// clarification). Round counts only; the movement list itself is DATA
// (program_slots primer.upper / primer.lower groups, engine/program.ts).
export const GIANT2_PRIMER_RAMP_ROUNDS: number[] = [1, 2, 3]

// Hypertrophy (C1) accessory sets — fixed at 3 sets regardless of week; only
// the per-movement rep target (movement.defaultReps) varies.
export const GIANT2_HYPERTROPHY_SETS = 3

// Oly (C2) position wave: weeks 1-2 of the cycle hang from the power position
// (above the knee), weeks 3-4 from the knee. Applies to the hang-based lanes
// (oly_hang_full_snatch, oly_snatch_high_pull_hang_power_snatch). Guidance
// copy only — not a stored value.
export const GIANT2_OLY_POSITION_WAVE: Record<number, string> = {
  1: 'Hang from the power position (above the knee).',
  2: 'Hang from the power position (above the knee).',
  3: 'Hang from the knee.',
  4: 'Hang from the knee.',
}
// Oly quality mark — Q3 (every rep identical) / Q2 (minor faults, self-
// corrected) / Q1 (position broke). Two consecutive Q3 sessions in a lane
// steps the load up (2.5 kg snatch family, 5 kg clean/jerk family); two
// consecutive Q1 steps it down. A logging concept, not a movement capability
// — lives on oly_logs (Phase 4), never on the movements table.
export const OLY_QUALITY: { id: string; label: string }[] = [
  { id: 'Q3', label: 'Q3 — every rep identical' },
  { id: 'Q2', label: 'Q2 — minor faults, self-corrected' },
  { id: 'Q1', label: 'Q1 — position broke' },
]
export const OLY_STEP_SNATCH_KG = 2.5
export const OLY_STEP_CLEAN_JERK_KG = 5

// Carries (C3) reuse the exact GiantFit day->implement mapping unchanged
// (DL Farmer's / OHP Overhead / Squat Bear Hug / Bench Suitcase) — see
// SEED_CARRY_KEYS in engine/program.ts. Always logged, guidance-only flat
// RPE 6 (the athlete's own carry_rpe input is unchanged — 2026-08-09: no new
// enforced field, "flat RPE 6" is copy, not a locked value).
export const GIANT2_CARRY_RPE_GUIDANCE = 'RPE 6'
