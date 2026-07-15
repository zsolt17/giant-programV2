// Program constants — ported verbatim from the working index.html. These encode
// the fixed structure of The Giant Program and must not drift.
import type { Difficulty, Lift, AnchorLift, Scheme, DayMeta, RunType, RunSlotKey, Terrain } from './types'

// 4 lifts across 3 weekly slots (Mon=hard, Wed=medium, Fri=light), repeating
// every 4 weeks (one mesocycle). Index = (weekInMeso - 1).
export const ROTATION: Record<Difficulty, Lift>[] = [
  { hard: 'deadlift', medium: 'ohp', light: 'squat' },
  { hard: 'dips', medium: 'deadlift', light: 'ohp' },
  { hard: 'squat', medium: 'dips', light: 'deadlift' },
  { hard: 'ohp', medium: 'squat', light: 'dips' },
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
// Per-lift rounding increment for DERIVED loads (the anchor itself is never
// rounded — user input stays exactly as entered). Barbell lifts move in 2.5 kg
// plates; dips/pull-ups added weight moves in 0.5 kg.
export const DEFAULT_INCREMENT = 2.5
export const LOAD_INCREMENT: Record<AnchorLift, number> = {
  deadlift: 2.5,
  ohp: 2.5,
  squat: 2.5,
  dips: 0.5,
  pullup: 0.5,
}

// Barbell build-up sets: 8-5-3-2 reps at ~40/55/70/85% of Giant Block Set 1.
export const WU_PCT: number[] = [0.4, 0.55, 0.7, 0.85]
export const WU_REPS: number[] = [8, 5, 3, 2]

// Pull-up phase-1 target reps per Giant Block round, by difficulty.
export const PULLUP: Record<Difficulty, number> = { hard: 10, medium: 8, light: 6 }

export const LIFT_LABEL: Record<Lift, string> = {
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  squat: 'Back Squat',
  dips: 'Weighted Ring Dips',
}
export const LIFT_SHORT: Record<Lift, string> = { deadlift: 'Deadlift', ohp: 'OHP', squat: 'Squat', dips: 'Dips' }

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
}

// Reactive-deload signals (revised rule — brief §5; supersedes the v7 book §7).
// S4 (Set 1 > R7) was retired. S6 is driven by the giant-block completion control.
export const SIGNALS: { id: string; label: string }[] = [
  { id: 'S1', label: 'Any day, top set R9.5+' },
  { id: 'S6', label: 'Giant block not completed as prescribed' },
  { id: 'S2', label: 'Volume block incomplete' },
  { id: 'S3', label: 'Carry skipped (fatigue)' },
  { id: 'S5', label: 'Bar speed ↓ on top set in 2+ sessions' },
]

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
