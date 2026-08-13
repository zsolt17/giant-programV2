// Program constants for Giant 2.0 — the app's one and only program. (Giant v7
// and GiantFit, its two predecessors, were fully retired 2026-08-10: their
// data, schema, and code are gone. See specification.md for that history.)
import type { Difficulty, Lift, AnchorLift, Scheme, DayMeta, CapabilityProgram } from './types'

// Fixed weekday -> lift, no rotation. JS Date#getDay(): 1 Mon, 2 Tue, 4 Thu,
// 5 Fri. Wed/Sat/Sun are rest.
export const GIANT2_DAY_LIFT: Record<number, Lift> = { 1: 'squat', 2: 'bench', 4: 'deadlift', 5: 'ohp' }
export const GIANT2_SESSION_DAYS: number[] = [1, 2, 4, 5]

// Upper/lower day-typing — drives the Primer block's band-activation choice
// (Crossover Symmetry / Hip Halo) and bodyweight-ramp movement list.
export const GIANT2_DAY_TYPE: Partial<Record<Lift, 'upper' | 'lower'>> = { squat: 'lower', deadlift: 'lower', bench: 'upper', ohp: 'upper' }

// Giant-difficulty weekly rotation for weeks 1-3 of EVERY cycle (repeats
// identically C1/C2/C3). The athlete's own Setup edits (giant2_giant_difficulty)
// merge OVER this on read, capacity-config pattern — this is only the default.
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
// session. The slot inventory for all three programs is registered in
// engine/program.ts; this map only says which one a cycle reads.
export const GIANT2_CAPABILITY_BY_CYCLE: Record<number, CapabilityProgram> = { 1: 'hypertrophy', 2: 'oly', 3: 'carries' }

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
// user input stays exactly as entered). All lifts are barbell moves in 2.5 kg plates.
export const DEFAULT_INCREMENT = 2.5

// The per-cycle Hard-top anchors Setup shows and writes, and the set
// rollToNextMacro carries forward: Squat/Bench/Deadlift/OHP plus two anchored
// secondary lanes — `db_row` (OHP day, holds BB Row) and `pendlay_row` (bench
// day, holds Pull-ups, two-mode — see liftMode in engine/loading.ts).
export const ANCHOR_LIFTS: AnchorLift[] = ['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row']
export const ANCHOR_LABEL: Record<string, string> = {
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  squat: 'Back Squat',
  bench: 'Bench Press',
  db_row: 'BB Row',
  pendlay_row: 'Pull-ups',
}
// Optional per-anchor entry hint shown next to the Setup label (data-driven —
// no per-lift branching in the UI).
export const ANCHOR_NOTE: Partial<Record<string, string>> = {}

// Barbell build-up sets: 8-5-3-2 reps at ~40/55/70/85% of Giant Block Set 1.
export const WU_PCT: number[] = [0.4, 0.55, 0.7, 0.85]
export const WU_REPS: number[] = [8, 5, 3, 2]

// Two-mode Pull-ups (bench day secondary, `pendlay_row` lane): target reps per
// Giant Block round, by difficulty, in bodyweight-cluster mode.
export const PULLUP: Record<Difficulty, number> = { hard: 10, medium: 8, light: 6 }

export const LIFT_LABEL: Record<Lift, string> = {
  deadlift: 'Deadlift',
  ohp: 'Overhead Press',
  squat: 'Back Squat',
  bench: 'Bench Press',
}
export const LIFT_SHORT: Record<Lift, string> = { deadlift: 'Deadlift', ohp: 'OHP', squat: 'Squat', bench: 'Bench' }

// The one RPE scale used everywhere an RPE gets logged (Giant/Volume/Carry top
// sets via LogRpe, and Hypertrophy's per-set RPE) — stored as "R6".."R10" text.
export const RPE_OPTIONS: string[] = ['R6', 'R7', 'R8', 'R8.5', 'R9', 'R9.5', 'R10']

// Giant Block completion (adherence) categories. 'completed' = as prescribed (default);
// the rest are fail reasons that drive the deload S7 signal. Stored categorically.
export const BLOCK_COMPLETION: { id: string; label: string }[] = [
  { id: 'failed_heavy', label: 'Failed reps — too heavy' },
  { id: 'stopped_fatigue', label: 'Stopped early — fatigue' },
  { id: 'stopped_form', label: 'Stopped early — form breakdown' },
  { id: 'reduced_weight', label: 'Reduced weight mid-block' },
  { id: 'cut_time', label: 'Cut short — time' },
]

// Carry implement per lift day (§2.10). Keyed by Lift for the carry/DayMeta shape.
export const DAY_META: Record<Lift, DayMeta> = {
  deadlift: { carry: { name: "Farmer's Carry", load: '60 kg / hand', perHand: true, dist: '20–30 m', sets: '3–4' } },
  ohp: { carry: { name: 'Overhead Carry', load: '2 × 20 kg', perHand: true, dist: '20 m / side', sets: '3–4' } },
  squat: { carry: { name: 'Sandbag Bear Hug', load: '68 kg', perHand: false, dist: '20–30 m', sets: '3–4' } },
  bench: { carry: { name: 'Suitcase Carry', load: '50 kg / hand', perHand: true, dist: '20 m / side', sets: '3–4' } },
}

// Carry starting loads seeded into Setup when a cycle's value is blank
// (editable like any carry weight; persists on the next Setup save). Only the
// Suitcase (bench day) has a program default — the others are athlete-set.
export const CARRY_DEFAULTS: Record<string, number> = { carry_bench: 50 }

// Accessory items (the four per-day carries) — what Setup shows/writes and
// what rollToNextMacro carries forward.
export const ACC_ITEMS = ['carry_deadlift', 'carry_ohp', 'carry_squat', 'carry_bench']

// Reactive-deload signals. Signals are computed, never stored.
export const SIGNALS: { id: string; label: string }[] = [
  { id: 'S1', label: 'Any day, top set R9.5+' },
  { id: 'S2', label: 'Volume block incomplete' },
  { id: 'S3', label: 'Carry skipped (fatigue)' },
  { id: 'S5', label: 'Bar speed ↓ on top set in 2+ sessions' },
  { id: 'S7', label: 'Giant block not completed as prescribed' },
]

// Macro shape: 12 training weeks (three 4-week mesocycles) + 1 deload week,
// extendable to a second identical deload week by the athlete (macro-level
// deload_extended flag).
export const MACRO_WEEKS = 13

// The Capability block's content, cycle 1: Hypertrophy — day-specific
// accessory list, 3 sets fixed regardless of week.
export const GIANT2_HYPERTROPHY_SETS = 3

// Giant/Volume block secondary occupant per day: the `db_row`/`pendlay_row`
// anchor LANES (from working_weights) hold BB Row (OHP) and Pull-ups (bench,
// two-mode). Squat/Deadlift train alone. Display label + reps-by-difficulty
// (fixed per set, only the main lift's reps descend across the four sets).
export const GIANT2_SECONDARY: Partial<Record<Lift, { key: string; name: string }>> = {
  ohp: { key: 'bb_row', name: 'BB Row' },
  bench: { key: 'pullup', name: 'Pull-ups' },
}
// Day -> anchor LANE (working_weights.lift) holding that day's secondary —
// distinct from GIANT2_SECONDARY's movement-library key above.
export const SECONDARY_LANE: Partial<Record<Lift, AnchorLift>> = { ohp: 'db_row', bench: 'pendlay_row' }
export const SECONDARY_REPS: Record<Difficulty, number> = { hard: 8, medium: 9, light: 10 }

// Giant block bodyweight accessory per day — rep-only, no load. `reps` is the
// app default; the athlete's rep target is Setup-editable (giant_accessory_config,
// capacity-config pattern) and merged over it.
export const GB_ACCESSORY: Partial<Record<Lift, { key: string; name: string; reps: number }>> = {
  squat: { key: 'ab_rollout', name: 'Ab-Roll', reps: 10 },
  deadlift: { key: 'ab_rollout', name: 'Ab-Roll', reps: 10 },
  bench: { key: 'leg_raises', name: 'Leg Raises', reps: 12 },
  ohp: { key: 'leg_raises', name: 'Leg Raises', reps: 12 },
}
// The all-defaults rep-target map ({ key: reps }) — what a fresh user sees;
// stored Setup values are merged over it on read.
export const GB_DEFAULT_REPS: Record<string, number> = Object.fromEntries(
  Object.values(GB_ACCESSORY).map((m) => [m.key, m.reps])
)

// Primer block content (session-view display). No load, no RPE — checkbox
// completion only. 2026-08-10: the bodyweight portion (holds + circuit) was
// replaced with a single sequence used by all four days — no upper/lower
// split anymore. Band activation still varies by day (GIANT2_DAY_TYPE) and
// still runs AFTER the bodyweight section, before the barbell warm-up.
export const GIANT2_PRIMER_HOLDS: { name: string; dose: string }[] = [
  { name: 'Deep Squat Hold', dose: '30–60s' },
  { name: 'Downward Dog', dose: '30–60s' },
]
// Then GIANT2_PRIMER_CIRCUIT_ROUNDS (2) rounds of:
export const GIANT2_PRIMER_CIRCUIT: { name: string; dose: string }[] = [
  { name: 'Cossack Squats', dose: '5 reps/side' },
  { name: '90/90 Switches', dose: '5 reps/side' },
  { name: 'Kneeling T-Spine Rotation', dose: '6 reps/side' },
  { name: 'Dolphin Press', dose: '6 reps' },
  { name: 'Dead Bugs', dose: '6 reps/side' },
]
export const GIANT2_PRIMER_CIRCUIT_ROUNDS = 2
export const GIANT2_PRIMER_BAND: Record<'upper' | 'lower', { name: string; dose: string }> = {
  upper: { name: 'Crossover Symmetry', dose: 'band activation sequence' },
  lower: { name: 'Hip Halo', dose: 'band activation sequence' },
}

// Cooldown block (session-view display) — a fifth Today-tab card, after
// Capability. Same sequence every day, no day-typing. Checkbox completion
// only, same shape as Primer — timed holds/stretches, not sets/reps/load.
export const GIANT2_COOLDOWN: { name: string; dose: string }[] = [
  { name: '90° Leg Raise Laydown', dose: '60s' },
  { name: 'Couch Stretch', dose: '2 min/side' },
  { name: 'Pigeon Pose', dose: '2 min/side' },
  { name: "Child's Pose", dose: '90s each: middle, left, right' },
  { name: 'Standing Fold', dose: '60s' },
]

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
// corrected) / Q1 (position broke). The load-progression rule this was meant
// to drive (two consecutive Q3 sessions in a lane steps the load up 2.5 kg
// snatch family / 5 kg clean-jerk family; two consecutive Q1 steps it down)
// is not implemented anywhere — coaching guidance only for now, applied by
// the athlete's own judgment. A logging concept, not a movement capability —
// lives on oly_logs, never on the movements table.
export const OLY_QUALITY: { id: string; label: string }[] = [
  { id: 'Q3', label: 'Q3 — every rep identical' },
  { id: 'Q2', label: 'Q2 — minor faults, self-corrected' },
  { id: 'Q1', label: 'Q1 — position broke' },
]

// Carries (C3): DL Farmer's / OHP Overhead / Squat Bear Hug / Bench Suitcase
// (see SEED_CARRY_KEYS in engine/program.ts). Always logged, guidance-only
// flat RPE 6 — copy, not a locked value.
export const GIANT2_CARRY_RPE_GUIDANCE = 'RPE 6'
