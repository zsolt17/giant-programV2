// Calendar run-cell overlay — mirrors SessionModal (focus-trapped dialog, break
// toggle, shared form, Log/Update/Delete incl. retroactive edits). Wraps RunForm;
// testing-Saturday cells carry the 5k TT and the confirm-gated Set-P chip, the
// same shared components as the Today tab so the two surfaces can't drift.
import { useState, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { C, HEADING } from './theme'
import { RunForm, buildBlankRun, SetPaceChip } from './RunForm'
import { errMsg } from './controls'
import { RUN_TYPE_LABEL } from '../engine/constants'
import { parseLocalDate } from '../engine/date-engine'
import { weekKeyFor } from '../engine/deload-rule'
import type { Run, RunDraft, RunSlot, DeloadMap, RunTargetsByCycle } from '../engine/types'

function shortDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

interface RunModalProps {
  slot: RunSlot
  macroNumber: number
  macroId: string
  refPaceS: number | null
  runTargets: RunTargetsByCycle
  deloads?: DeloadMap
  existing?: Run
  isBreak: boolean
  onToggleBreak: (iso: string, on: boolean) => void
  onSaveRun: (record: RunDraft) => Promise<Run>
  onDeleteRun: (id: string) => Promise<void>
  onSetRefPace?: (refPaceS: number | null) => Promise<void>
  onClose: () => void
}

export function RunModal({
  slot,
  macroNumber,
  macroId,
  refPaceS,
  runTargets,
  deloads = {},
  existing,
  isBreak,
  onToggleBreak,
  onSaveRun,
  onDeleteRun,
  onSetRefPace,
  onClose,
}: RunModalProps) {
  const deloadWeek =
    slot.weekType === 'training' && slot.cycle != null && slot.week != null && !!deloads[weekKeyFor(macroNumber, slot.cycle, slot.week)]
  const targetKm = slot.weekType === 'training' && slot.cycle != null ? runTargets?.[slot.cycle]?.[slot.slot] ?? null : null

  const [draft, setDraft] = useState<RunDraft>(() => existing || buildBlankRun(slot, macroId))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onClose) // Esc to close, trap Tab, restore focus on close
  // Lock the background (calendar) from scrolling while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  const setField = <K extends keyof RunDraft>(k: K, v: RunDraft[K]) => setDraft((p) => ({ ...p, [k]: v }) as RunDraft)

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      // Stamp the computed slot on every save so a retro-logged run can't drift.
      const blank = buildBlankRun(slot, macroId)
      await onSaveRun({ ...draft, id: blank.id, date: blank.date, cycle: blank.cycle, week: blank.week, weekType: blank.weekType, runType: blank.runType })
      onClose()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }
  async function handleDelete() {
    setErr('')
    try {
      if (existing) await onDeleteRun(existing.id)
      onClose()
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 20,
    paddingLeft: 12,
    paddingRight: 12,
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    zIndex: 60, // above the fixed bottom nav, like SessionModal
  }
  const sheet: CSSProperties = { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 4, maxWidth: 520, width: '100%', padding: 18, marginTop: 20 }

  return (
    <div style={overlay} onClick={onClose}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="run-modal-title" tabIndex={-1} style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {shortDate(slot.date)}
              {slot.cycle ? ` · C${slot.cycle} W${slot.week}` : ''}
            </div>
            <div id="run-modal-title" style={{ fontFamily: HEADING, fontSize: 22, letterSpacing: '0.04em' }}>
              {RUN_TYPE_LABEL[deloadWeek ? 'easy' : slot.runType]} Run
              {slot.optional && <span style={{ fontSize: 12, color: C.muted }}> · optional</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Break toggle (always available, same semantics as lift days) */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.off, padding: '8px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}
        >
          <input type="checkbox" checked={isBreak} onChange={(e) => onToggleBreak(slot.date, e.target.checked)} />
          Mark this day as a break (exempt from missed + deload signals)
        </label>

        <RunForm slot={slot} refPaceS={refPaceS} targetKm={targetKm} deloadWeek={deloadWeek} draft={draft} setField={setField} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : existing ? 'Update' : 'Log run'}
          </button>
          {existing && (
            <button onClick={handleDelete} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '12px 16px', fontSize: 13, cursor: 'pointer' }}>
              Delete
            </button>
          )}
        </div>
        {slot.runType === 'tt' && existing && onSetRefPace && <SetPaceChip run={existing} refPaceS={refPaceS} onSetRefPace={onSetRefPace} />}
        {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>}
      </div>
    </div>
  )
}
