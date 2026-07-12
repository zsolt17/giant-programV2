// The Giant Run — shared prescription + log fields for a run day. Reused by
// Today (inline) and the Calendar's RunModal, same split as SessionForm: the
// parent owns the draft + Save/Delete buttons. Pace guidance is mode-dependent
// (talk-test vs pace, engine/runs.ts); the logged pace is always DERIVED from
// distance + duration, displayed live, never stored.
import { useState, useEffect } from 'react'
import { C, HEADING, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row } from './controls'
import { RUN_TYPE_LABEL, RUN_COMPLETION, TT_KM } from '../engine/constants'
import { runMode, easyPace, qualityRange, fmtPace, fmtRunDuration, parseClock, derivedPaceS, runIdFor } from '../engine/runs'
import type { RunDraft, RunSlot } from '../engine/types'

// Build a blank run draft for a computed slot.
export function buildBlankRun(slot: RunSlot, macroId: string): RunDraft {
  return {
    id: runIdFor(slot.date, slot.runType),
    macroId,
    date: slot.date,
    cycle: slot.cycle,
    week: slot.week,
    weekType: slot.weekType,
    runType: slot.runType,
    distanceKm: slot.runType === 'tt' ? TT_KM : '',
    durationS: '',
    avgHr: '',
    completion: 'completed',
    notes: '',
  }
}

const num = (v: number | string | null | undefined): number | null =>
  v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)

interface RunFormProps {
  slot: RunSlot
  refPaceS: number | null
  targetKm: number | null // per-cycle target for the slot (guidance only)
  deloadWeek: boolean // reactive deload applied to this week → short easy only
  draft: RunDraft
  setField: <K extends keyof RunDraft>(k: K, v: RunDraft[K]) => void
}

export function RunForm({ slot, refPaceS, targetKm, deloadWeek, draft, setField }: RunFormProps) {
  const isTT = slot.runType === 'tt'
  const paceMode = runMode(refPaceS) === 'pace'

  // Duration is typed as min:sec text; the draft always holds parsed SECONDS
  // (or null while the text is incomplete), so persistence never sees the text.
  const [durText, setDurText] = useState(() => (num(draft.durationS) != null ? fmtRunDuration(num(draft.durationS)) : ''))
  useEffect(() => {
    setDurText(num(draft.durationS) != null ? fmtRunDuration(num(draft.durationS)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id])
  function onDuration(v: string) {
    setDurText(v)
    setField('durationS', parseClock(v))
  }

  // Reactive deload: the prescription collapses to a short easy run.
  const shownType = deloadWeek ? 'easy' : slot.runType
  const target = deloadWeek || slot.weekType === 'deload' ? 'short & easy' : isTT ? `${TT_KM} km` : targetKm != null ? `${targetKm} km` : '—'
  const guidance = (() => {
    if (isTT) return 'No prescribed pace — discover it. All-out but even; record the result.'
    if (!paceMode) return 'Talk test — fully conversational. No pace targets in this mesocycle.'
    const P = refPaceS as number
    if (shownType === 'quality') {
      const [qMin, qMax] = qualityRange(P)
      return `${fmtPace(qMin)}–${fmtPace(qMax)} /km`
    }
    return `${fmtPace(easyPace(P))} /km`
  })()

  const pace = derivedPaceS(num(draft.distanceKm), num(draft.durationS))

  return (
    <div>
      {/* Prescription */}
      <Card>
        {blockTitle(`${RUN_TYPE_LABEL[shownType]} Run`, slot.optional ? 'optional' : slot.weekType === 'training' ? `C${slot.cycle} · W${slot.week}` : slot.weekType)}
        {deloadWeek && (
          <div style={{ fontSize: 12, color: C.gold, lineHeight: 1.5, marginBottom: 6 }}>
            Reactive deload week — keep it a short, easy shakeout. Skip freely.
          </div>
        )}
        {slot.weekType === 'deload' && !deloadWeek && (
          <div style={{ fontSize: 12, color: C.gold, lineHeight: 1.5, marginBottom: 6 }}>
            End-of-macro deload — all runs optional, short easy only.
          </div>
        )}
        <Row a="Distance" b={slot.optional ? 'guidance — run or rest' : 'target, not prescription'} c={target} cls={C.gold} />
        <Row a="Pace" b={guidance} c="" cls={C.off} />
      </Card>

      {/* Log */}
      <Card>
        {blockTitle('Log', 'actuals')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 90 }}>
            <label style={lbl}>Distance (km)</label>
            <input
              data-run-distance="1"
              style={inp}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={draft.distanceKm ?? ''}
              readOnly={isTT}
              aria-label="Distance in kilometres"
              onChange={(e) => setField('distanceKm', e.target.value)}
            />
            {isTT && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>fixed 5 km</div>}
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <label style={lbl}>Duration (min:sec)</label>
            <input
              data-run-duration="1"
              style={inp}
              type="text"
              inputMode="numeric"
              placeholder="42:30"
              value={durText}
              aria-label="Duration as minutes and seconds"
              onChange={(e) => onDuration(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <label style={lbl}>Avg HR</label>
            <input
              data-run-hr="1"
              style={inp}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="—"
              value={draft.avgHr ?? ''}
              aria-label="Average heart rate (optional)"
              onChange={(e) => setField('avgHr', e.target.value)}
            />
          </div>
        </div>

        {/* Derived pace — prominent, especially for the time trial. */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase' }}>Pace</span>
          <span style={{ fontFamily: HEADING, fontSize: isTT ? 34 : 26, color: pace != null ? C.gold : C.muted, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtPace(pace)}
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>/km</span>
        </div>

        <RunCompletion value={draft.completion} onChange={(v) => setField('completion', v)} />
      </Card>

      {/* Notes */}
      <Card>
        <label style={lbl}>Notes</label>
        <textarea
          style={{ ...inp, minHeight: 60, resize: 'vertical' }}
          value={draft.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Route, surface, how it felt…"
        />
      </Card>
    </div>
  )
}

// Categorical run completion — same pattern as the Giant Block control: one-tap
// "completed ✓" default, a reason dropdown when it wasn't. cut_fatigue and
// felt_heavy drive the run deload signals (R1/R2); cut_schedule is neutral.
function RunCompletion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const completed = value === 'completed' || value === ''
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: completed ? C.green : C.off }}>
        <input type="checkbox" checked={completed} onChange={(e) => onChange(e.target.checked ? 'completed' : RUN_COMPLETION[0].id)} />
        Run completed ✓
      </label>
      {!completed && (
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>What happened?</label>
          <select style={inp} value={value} onChange={(e) => onChange(e.target.value)}>
            {RUN_COMPLETION.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
