import { CompletionPick } from './controls'
import { SCHEMES, BLOCK_COMPLETION } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import type { Difficulty, Lift, WeekType, SessionDraft } from '../engine/types'

interface BlankSessionArgs {
  date: string
  macroId: string
  cycle?: number | null
  week?: number | null
  weekType: WeekType
  dayType?: Lift | null
  difficulty?: Difficulty | null
  // The Volume block's own difficulty (null = no Volume block this session —
  // C3 W4 or deload).
  volumeDifficulty?: Difficulty | null
  baseTop?: number | null
  isDeload?: boolean
}

// Build a blank session draft for a given slot. Ids drop the difficulty
// suffix (date-lift is already unique — day->lift is fixed, no rotation —
// and difficulty is no longer singular per session anyway).
export function buildBlankSession({ date, macroId, cycle, week, weekType, dayType, difficulty, volumeDifficulty, baseTop, isDeload }: BlankSessionArgs): SessionDraft {
  const scheme = difficulty ? SCHEMES[difficulty] : null
  const top = baseTop != null && isDeload ? deloadTop(baseTop) : baseTop ?? null
  return {
    id: `${date}-${dayType || 'x'}`,
    macroId,
    date,
    cycle: cycle ?? null,
    week: week ?? null,
    weekType,
    dayType: dayType ?? null,
    difficulty: difficulty ?? null,
    volumeDifficulty: volumeDifficulty ?? null,
    topReps: scheme ? scheme.sets[3] : null,
    topWeight: top,
    rpe: '',
    barSpeed: '',
    cardioCals: ['', '', '', ''],
    blockCompletion: 'completed',
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pullupCluster: '',
    primerDone: false,
    wodSkipped: false,
    wodSkipReason: '',
    cooldownDone: false,
    notes: '',
    startedAt: null,
    endedAt: null,
  }
}

// Giant Block adherence: top set keeps full RPE/speed; the rest of the block gets a
// one-tap "completed as prescribed" with a categorical reason dropdown when it wasn't.
// Any non-'completed' state drives the deload S7 signal.
export function BlockCompletion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <CompletionPick
      label="Giant block completed as prescribed ✓"
      options={BLOCK_COMPLETION}
      value={value}
      onChange={onChange}
      id="block-completion-reason"
    />
  )
}
