// The single source of truth for "what the Capability block contains today" —
// cycle-dispatched (capabilityProgramFor) and, for Hypertrophy/Oly, joined
// against whichever log table backs the active program. Giant/Volume/Primer/
// Cooldown don't need an equivalent here: they already read from the Session
// row alone (one field group, one place, nothing duplicated). Capability is
// the one block whose real content lives elsewhere (hypertrophy_logs/
// oly_logs, keyed by movementId) — every consumer had to independently
// re-derive "what's actually in today's Capability block," which is exactly
// how both the Carry-line-everywhere bug and the missing-Hypertrophy bug
// happened. This module is that one derivation; session-summary.ts renders
// it to text, CapabilityBlock.tsx (the live editable form) reads the same
// resolveItems/groupBySuperset it's built on.
import type { Session, HypertrophyLog, OlyLog, AccessoryByCycle } from './types'
import type { Movement } from './movements'
import { SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS, resolveItems, groupBySuperset } from './movements'
import { GIANT2_HYPERTROPHY_SETS, GIANT2_OLY_POSITION_WAVE, DAY_META } from './constants'
import { capabilityProgramFor } from './date-engine'
import { fmt } from './loading'

export interface HypertrophySetRecord {
  setNumber: number
  reps: number | null
  weight: number | null
  rpe: string
}
export interface HypertrophyExerciseRecord {
  key: string
  name: string
  note: string | null
  weightOptional: boolean
  sets: HypertrophySetRecord[]
}
export interface CapabilityHypertrophyRecord {
  program: 'hypertrophy'
  // Superset pairs grouped together (alternate between them); standalone
  // exercises are their own single-item group — same grouping the live
  // Hypertrophy form renders, not re-derived.
  groups: HypertrophyExerciseRecord[][]
}

export interface OlyExerciseRecord {
  key: string
  name: string
  note: string | null
  weight: number | null
  quality: string // no RPE field — Oly is quality-marked, never RPE-logged
}
export interface CapabilityOlyRecord {
  program: 'oly'
  // The week's hang-position guidance (GIANT2_OLY_POSITION_WAVE) — block-
  // level, not per-exercise, matching how the live Oly form shows it.
  positionGuidance: string | null
  exercises: OlyExerciseRecord[]
}

export interface CapabilityCarriesRecord {
  program: 'carries'
  name: string
  load: string
  skipped: boolean
  skipReason: string
  rounds: number | null
  distance: number | null
  rpe: string // single RPE-6 entry per carry — no per-set breakdown
}

export type CapabilityRecord = CapabilityHypertrophyRecord | CapabilityOlyRecord | CapabilityCarriesRecord

export interface CapabilityLogs {
  movements: Movement[]
  hypertrophyLogs: HypertrophyLog[]
  olyLogs: OlyLog[]
}

const EMPTY_LOGS: CapabilityLogs = { movements: [], hypertrophyLogs: [], olyLogs: [] }

// null = no Capability block this session (scheduled deload / non-training
// week, or no active cycle) — matches the live app, which never renders a
// Capability card there either. `logs` omitted (or partially supplied)
// still returns full exercise structure — names, note, superset pairing,
// Oly position guidance — with "—"/unset placeholders for anything not yet
// logged, the same way the Giant/Volume sections already show "—" for
// unlogged fields rather than omitting the block. `accessory` = the same
// per-cycle grid session-summary.ts already reads for the Giant secondary —
// resolves the carry weight override; omitted falls back to the day's
// static default load.
export function capabilityRecordFor(s: Session, logs: CapabilityLogs = EMPTY_LOGS, accessory?: AccessoryByCycle): CapabilityRecord | null {
  if (s.weekType !== 'training' || s.cycle == null || !s.dayType) return null
  const program = capabilityProgramFor(s.cycle)

  if (program === 'carries') {
    const meta = DAY_META[s.dayType]
    const w = accessory?.[s.cycle]?.[`carry_${s.dayType}`]
    const load = w != null ? `${fmt(w)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load
    return {
      program: 'carries',
      name: meta.carry.name,
      load,
      skipped: s.carrySkipped,
      skipReason: s.carrySkipReason,
      rounds: s.carryRounds,
      distance: s.carryDistance,
      rpe: s.carryRpe,
    }
  }

  if (program === 'hypertrophy') {
    const items = resolveItems(SEED_HYPERTROPHY_KEYS[s.dayType], logs.movements)
    const groups = groupBySuperset(items).map((group) =>
      group.map(
        (item): HypertrophyExerciseRecord => ({
          key: item.key,
          name: item.seed?.name ?? item.key,
          note: item.seed?.note ?? null,
          weightOptional: item.seed?.weightOptional ?? false,
          sets: Array.from({ length: GIANT2_HYPERTROPHY_SETS }, (_, i) => {
            const setNumber = i + 1
            const log = logs.hypertrophyLogs.find((l) => l.movementId === item.movementId && l.setNumber === setNumber)
            return { setNumber, reps: log?.repsDone ?? null, weight: log?.weight ?? null, rpe: log?.rpe ?? '' }
          }),
        })
      )
    )
    return { program: 'hypertrophy', groups }
  }

  // program === 'oly'
  const items = resolveItems(SEED_OLY_KEYS[s.dayType], logs.movements)
  const exercises = items.map(
    (item): OlyExerciseRecord => {
      const log = logs.olyLogs.find((l) => l.movementId === item.movementId)
      return { key: item.key, name: item.seed?.name ?? item.key, note: item.seed?.note ?? null, weight: log?.weight ?? null, quality: log?.quality ?? '' }
    }
  )
  return { program: 'oly', positionGuidance: s.week != null ? (GIANT2_OLY_POSITION_WAVE[s.week] ?? null) : null, exercises }
}
