import { useState } from 'react'
import type { CSSProperties } from 'react'
import { C, HEADING, inp, lbl, pillColor } from './theme'
import { SessionForm, buildBlankSession } from './SessionForm'
import { TestingResultForm } from './TestingResultForm'
import { fmtClock, errMsg } from './controls'
import { SCHEMES, LIFT_LABEL } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { parseLocalDate } from '../engine/date-engine'
import type {
  MacroCell,
  Session,
  SessionDraft,
  WeightsByCycle,
  AccessoryByCycle,
  DeloadMap,
  TestingResult,
} from '../engine/types'

function shortDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

interface SessionModalProps {
  cell: MacroCell
  macroNumber: number
  macroId: string
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  deloads?: DeloadMap
  existing?: Session
  isBreak: boolean
  onToggleBreak: (iso: string, on: boolean) => void
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onDeleteSession: (id: string) => Promise<void>
  testingResults?: TestingResult[]
  onSaveTestingResult: (r: TestingResult) => Promise<TestingResult>
  onDeleteTestingResult: (id: string) => void
  onClose: () => void
}

export function SessionModal({
  cell,
  macroNumber,
  macroId,
  weights,
  accessory,
  deloads = {},
  existing,
  isBreak,
  onToggleBreak,
  onSaveSession,
  onDeleteSession,
  testingResults = [],
  onSaveTestingResult,
  onDeleteTestingResult,
  onClose,
}: SessionModalProps) {
  const isSpecial = cell.weekType === 'testing' || cell.weekType === 'deload'
  const dayType = cell.dayType
  const difficulty = cell.difficulty
  const cycle = cell.meso
  const base = !isSpecial && dayType && cycle != null && difficulty ? weights?.[cycle]?.[dayType]?.[difficulty] : null
  const hasWeight = base != null
  const weekKey = `M${macroNumber}C${cycle}W${cell.week}`
  const isDeload = !isSpecial && !!deloads[weekKey]
  const top = base != null ? (isDeload ? deloadTop(base) : base) : null
  const cleanDefault = cycle != null ? accessory?.[cycle]?.clean ?? '' : ''

  const [draft, setDraft] = useState<SessionDraft>(
    () =>
      existing ||
      buildBlankSession({ date: cell.date, macroId, cycle, week: cell.week, weekType: cell.weekType, dayType, difficulty, baseTop: base, isDeload, cleanDefault })
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const setField = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setDraft((p) => ({ ...p, [k]: v }) as SessionDraft)

  // Manual duration edit for a timed session (editable-after-the-fact fallback).
  const startedMs = draft.startedAt ? new Date(draft.startedAt).getTime() : null
  const durationMs = startedMs != null && draft.endedAt ? new Date(draft.endedAt).getTime() - startedMs : null
  const autoEnded = (draft.notes || '').includes('auto-ended at 90 min')
  function setDurationMin(val: string) {
    const n = parseFloat(val)
    if (startedMs == null || !Number.isFinite(n) || n < 0) return
    setField('endedAt', new Date(startedMs + n * 60000).toISOString())
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      // Reached only on a normal training cell, where dayType/difficulty are set.
      const record: SessionDraft = {
        ...draft,
        id: `${cell.date}-${dayType}-${difficulty![0].toUpperCase()}`,
        date: cell.date,
        macroId,
        cycle,
        week: cell.week,
        weekType: cell.weekType,
        dayType,
        difficulty,
        topReps: SCHEMES[difficulty!].sets[3],
        topWeight: top,
      }
      await onSaveSession(record)
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
      if (existing) await onDeleteSession(existing.id)
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
    padding: '20px 12px',
    overflowY: 'auto',
    zIndex: 50,
  }
  const sheet: CSSProperties = { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 4, maxWidth: 520, width: '100%', padding: 18, marginTop: 20 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {shortDate(cell.date)}
              {cell.meso ? ` · C${cell.meso} W${cell.week}` : ''}
            </div>
            <div style={{ fontFamily: HEADING, fontSize: 22, letterSpacing: '0.04em' }}>
              {isSpecial ? (
                cell.weekType === 'testing' ? (
                  cell.testRole === 'light' ? 'Light Session' : `Test: ${cell.testLift ? LIFT_LABEL[cell.testLift] : '—'}`
                ) : (
                  'Deload Session'
                )
              ) : (
                <span>
                  {dayType ? LIFT_LABEL[dayType] : ''} <span style={{ color: pillColor(difficulty) }}>· {difficulty?.toUpperCase()}</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Break toggle (always available) */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.off, padding: '8px 0', borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}
        >
          <input type="checkbox" checked={isBreak} onChange={(e) => onToggleBreak(cell.date, e.target.checked)} />
          Mark this day as a break (exempt from missed + deload signals)
        </label>

        {cell.weekType === 'testing' && cell.testRole === 'test' && cell.testLift ? (
          <TestingResultForm
            macroId={macroId}
            lift={cell.testLift}
            testedOn={cell.date}
            results={testingResults}
            onSave={onSaveTestingResult}
            onDelete={(id) => {
              onDeleteTestingResult(id)
              onClose()
            }}
          />
        ) : isSpecial ? (
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {cell.weekType === 'testing'
              ? 'Optional light session between the two test days — keep it easy. Log in your notebook if you do it.'
              : 'End-of-macro deload — Giant Block only at 50–60%. Nothing to log in detail here.'}
          </div>
        ) : (
          <>
            <SessionForm dayType={dayType!} difficulty={difficulty!} top={top} hasWeight={hasWeight} isDeload={isDeload} draft={draft} setField={setField} />
            {draft.startedAt && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>Duration</div>
                  <div style={{ fontFamily: HEADING, fontSize: 24, color: C.off, fontVariantNumeric: 'tabular-nums' }}>
                    {durationMs != null ? fmtClock(durationMs) : '—'}
                  </div>
                  {autoEnded && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Auto-ended at 90 min</div>}
                </div>
                <div style={{ width: 110 }}>
                  <label style={lbl}>Edit (min)</label>
                  <input
                    style={inp}
                    type="number"
                    min="0"
                    step="1"
                    value={durationMs != null ? Math.round(durationMs / 60000) : ''}
                    onChange={(e) => setDurationMin(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : existing ? 'Update' : 'Log session'}
              </button>
              {existing && (
                <button onClick={handleDelete} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '12px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Delete
                </button>
              )}
            </div>
            {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>}
          </>
        )}
      </div>
    </div>
  )
}
