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
import { fmtPace, fmtRunDuration, parseClock, derivedPaceS, runIdFor, runStructureKey, runStructureText } from '../engine/runs'
import { errMsg } from './controls'
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
  // Structure description (engine-composed: pace guidance appended in pace mode).
  const structure = runStructureText(runStructureKey(slot, deloadWeek), refPaceS)

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
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 8 }}>{structure}</div>
        <Row a="Distance" b={slot.optional ? 'guidance — run or rest' : 'target, not prescription'} c={target} cls={C.gold} />
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
              // decimal keypad: iOS's numeric pad has no colon — "." works as the
              // separator (42.30 = 42:30), and bare digits parse too (4230 = 42:30).
              inputMode="decimal"
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

// After a saved time trial: an explicit, confirm-gated offer to make the TT pace
// the macro's new reference pace P. Never silent — a save alone never moves P.
// (P then carries into the next macro on "Start next macro", like C3→C1 weights.)
// Shared by the Today TT view and the Calendar's RunModal.
export function SetPaceChip({ run, refPaceS, onSetRefPace }: { run: { distanceKm: number | null; durationS: number | null }; refPaceS: number | null; onSetRefPace: (p: number | null) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pace = derivedPaceS(run.distanceKm, run.durationS)
  if (pace == null) return null
  const newP = Math.round(pace) // whole seconds for storage; NOT the 5 s/km prescription rounding
  if (refPaceS === newP)
    return (
      <div style={{ marginTop: 12, fontSize: 12, color: C.green }}>Reference pace P is set to this result ({fmtPace(newP)} /km) ✓</div>
    )
  async function apply() {
    setBusy(true)
    setErr('')
    try {
      await onSetRefPace(newP)
      setConfirm(false)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card style={{ marginTop: 12, border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.10)' }}>
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 2, padding: '10px 14px', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', width: '100%' }}
        >
          Set as new reference pace P → {fmtPace(newP)} /km
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.off }}>
            Replace {refPaceS != null ? `current P (${fmtPace(refPaceS)} /km)` : 'talk-test mode'} with {fmtPace(newP)} /km?
          </span>
          <button onClick={apply} disabled={busy} style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={() => setConfirm(false)} disabled={busy} aria-label="Cancel setting reference pace" style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}.</div>}
    </Card>
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
