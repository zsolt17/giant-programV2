import React, { useState } from 'react'
import { C, HEADING, inp, lbl, pillColor } from './theme.js'
import { SessionForm, buildBlankSession } from './SessionForm.jsx'
import { TestingResultForm } from './TestingResultForm.jsx'
import { fmtClock } from './controls.jsx'
import { SCHEMES, LIFT_LABEL } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { parseLocalDate } from '../engine/date-engine'

function shortDate(iso) {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function SessionModal({ cell, macroNumber, macroId, weights, accessory, deloads = {}, existing, isBreak, onToggleBreak, onSaveSession, onDeleteSession, testingResults = [], onSaveTestingResult, onDeleteTestingResult, onClose }) {
  const isSpecial = cell.weekType === 'testing' || cell.weekType === 'deload'
  const dayType = cell.dayType
  const difficulty = cell.difficulty
  const cycle = cell.meso
  const base = !isSpecial && dayType ? weights?.[cycle]?.[dayType]?.[difficulty] : null
  const hasWeight = base != null
  const weekKey = `M${macroNumber}C${cycle}W${cell.week}`
  const isDeload = !isSpecial && !!deloads[weekKey]
  const top = hasWeight ? (isDeload ? deloadTop(base) : base) : null
  const cleanDefault = accessory?.[cycle]?.clean ?? ''

  const [draft, setDraft] = useState(
    () =>
      existing ||
      buildBlankSession({ date: cell.date, macroId, cycle, week: cell.week, weekType: cell.weekType, dayType, difficulty, baseTop: base, isDeload, cleanDefault })
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }))

  // Manual duration edit for a timed session (editable-after-the-fact fallback).
  const startedMs = draft.startedAt ? new Date(draft.startedAt).getTime() : null
  const durationMs = startedMs != null && draft.endedAt ? new Date(draft.endedAt).getTime() - startedMs : null
  const autoEnded = (draft.notes || '').includes('auto-ended at 90 min')
  function setDurationMin(val) {
    const n = parseFloat(val)
    if (startedMs == null || !Number.isFinite(n) || n < 0) return
    setField('endedAt', new Date(startedMs + n * 60000).toISOString())
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      const record = {
        ...draft,
        id: `${cell.date}-${dayType}-${difficulty[0].toUpperCase()}`,
        date: cell.date,
        macroId,
        cycle,
        week: cell.week,
        weekType: cell.weekType,
        dayType,
        difficulty,
        topReps: SCHEMES[difficulty].sets[3],
        topWeight: top,
      }
      await onSaveSession(record)
      onClose()
    } catch (e) {
      setErr(String(e?.message || e))
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
      setErr(String(e?.message || e))
    }
  }

  const overlay = {
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
  const sheet = { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 4, maxWidth: 520, width: '100%', padding: 18, marginTop: 20 }

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
                  cell.testRole === 'light' ? 'Light Session' : `Test: ${LIFT_LABEL[cell.testLift] || '—'}`
                ) : (
                  'Deload Session'
                )
              ) : (
                <span>
                  {LIFT_LABEL[dayType]} <span style={{ color: pillColor(difficulty) }}>· {difficulty.toUpperCase()}</span>
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
            <SessionForm dayType={dayType} difficulty={difficulty} top={top} hasWeight={hasWeight} isDeload={isDeload} draft={draft} setField={setField} />
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
