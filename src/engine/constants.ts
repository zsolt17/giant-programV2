// Program constants — ported verbatim from the working index.html. These encode
// the fixed structure of The Giant Program and must not drift.
import type { Difficulty, Lift, Scheme, DayMeta } from './types'

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

// Antagonist / core / carry per lift day.
export const DAY_META: Record<Lift, DayMeta> = {
  deadlift: {
    antag: 'Sørensen Hold',
    antagType: 'hold',
    core: 'Ab Rollout',
    carry: { name: "Farmer's Carry", load: '60 kg / hand', perHand: true, dist: '20–30 m', sets: '3–4' },
  },
  ohp: {
    antag: 'Pull-ups',
    antagType: 'pullup',
    core: 'GHD Abs',
    carry: { name: 'Suitcase Carry', load: '50 kg / hand', perHand: true, dist: '20 m / side', sets: '3–4' },
  },
  squat: {
    antag: 'Copenhagen Plank',
    antagType: 'hold20',
    core: 'Leg Raises',
    carry: { name: 'Sandbag Bear Hug', load: '68–80 kg', perHand: false, dist: '20–30 m', sets: '3–4' },
  },
  dips: {
    antag: 'Ring Rows',
    antagType: 'ringrow',
    core: 'GHD Back Extension',
    carry: { name: 'Overhead Carry', load: '2 × 25 kg', perHand: true, dist: '20 m / side', sets: '3–4' },
  },
}

// Reactive-deload signals (revised rule — brief §5; supersedes the v7 book §7).
// S4 (Set 1 > R7) is notebook-only, not auto-detected, so it is not listed here.
export const SIGNALS: { id: string; label: string }[] = [
  { id: 'S1', label: 'Any day, top set R9.5+' },
  { id: 'S2', label: 'Volume block incomplete' },
  { id: 'S3', label: 'Carry skipped (fatigue)' },
  { id: 'S5', label: 'Bar speed ↓ on top set in 2+ sessions' },
]

// Macro shape.
export const MACRO_WEEKS = 15
export const DAY_SLOT: Record<number, Difficulty> = { 1: 'hard', 3: 'medium', 5: 'light' } // Mon/Wed/Fri -> difficulty

// Testing weeks (book §10): which lift is tested on which day.
// Keyed by weekIndex (12 = W13, 13 = W14) then weekday (1 Mon, 5 Fri). Wed = light.
export const TESTING_SCHEDULE: Record<number, Record<number, Lift>> = {
  12: { 1: 'deadlift', 5: 'dips' },
  13: { 1: 'squat', 5: 'ohp' },
}
