import { useState, useRef, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { C, HEADING, lbl, pillColor } from './theme'
import { Giant2SessionForm } from './Giant2SessionForm'
import { buildBlankSession } from './SessionForm'
import { fmtClock, DurationEdit, errMsg } from './controls'
import { SCHEMES, LIFT_LABEL, SECONDARY_LANE } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { parseLocalDate } from '../engine/date-engine'
import type { MacroCell, Session, SessionDraft, WeightsByCycle, AccessoryByCycle, DeloadMap, GiantAccessoryReps, Difficulty, HypertrophyLog, HypertrophyLogDraft, OlyLog, OlyLogDraft } from '../engine/types'
import type { Movement } from '../engine/movements'

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
  // Giant Block accessory rep targets (Setup config, defaults merged).
  giantAccessory?: GiantAccessoryReps
  // The Capability block: the athlete's movement library + this macro's
  // Hypertrophy/Oly logs + save handlers.
  movements?: Movement[]
  hypertrophyLogs?: HypertrophyLog[]
  olyLogs?: OlyLog[]
  onSaveHypertrophyLog?: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
  onSaveOlyLog?: (log: OlyLogDraft) => Promise<OlyLog>
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
  giantAccessory,
  movements = [],
  hypertrophyLogs = [],
  olyLogs = [],
  onSaveHypertrophyLog,
  onSaveOlyLog,
  onClose,
}: SessionModalProps) {
  // The deload week is a real, loggable session (fixed day->lift, no H/M/L
  // Giant difficulty that week — 'hard' below is purely the SCHEMES lookup).
  // The weight LOOKUP uses a separate reference cycle (3, the last training
  // cycle) since cell.meso is null on deload.
  const isDeloadWeek = cell.weekType === 'deload'
  const dayType = cell.dayType
  const difficulty: Difficulty | null = isDeloadWeek ? 'hard' : cell.difficulty
  const weightCycle = isDeloadWeek ? 3 : cell.meso
  const base = dayType && weightCycle != null && difficulty ? weights?.[weightCycle]?.[dayType]?.[difficulty] : null
  const hasWeight = base != null
  const weekKey = `M${macroNumber}C${cell.meso}W${cell.week}`
  const isDeload = cell.weekType === 'deload' || !!deloads[weekKey]
  const top = base != null ? (isDeload ? deloadTop(base) : base) : null
  // The Volume block's own difficulty (already computed by enumerateMacro/
  // corePosition onto the cell) + its day-top off the SAME per-cycle cascade.
  // Null on deload (no Volume block).
  const volumeDifficulty = cell.volumeDifficulty ?? null
  const volumeTop = volumeDifficulty && dayType && weightCycle != null ? weights?.[weightCycle]?.[dayType]?.[volumeDifficulty] ?? null : null
  const carryDefault = weightCycle != null && dayType ? accessory?.[weightCycle]?.[`carry_${dayType}`] ?? '' : ''
  // The day's secondary cell (db_row/pendlay_row lane — BB Row on OHP day, Pull-ups on bench day).
  const laneKey = dayType ? SECONDARY_LANE[dayType] : undefined
  const secondaryCell = laneKey && weightCycle != null ? weights?.[weightCycle]?.[laneKey] ?? null : null
  // The STORED record's cycle/week are the cell's own (null on deload) — only
  // the WEIGHT lookup above uses the reference cycle.
  const cycle = isDeloadWeek ? null : cell.meso

  const [draft, setDraft] = useState<SessionDraft>(
    () =>
      existing ||
      buildBlankSession({ date: cell.date, macroId, cycle, week: cell.week, weekType: cell.weekType, dayType, difficulty, volumeDifficulty, baseTop: base, isDeload })
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onClose) // Esc to close, trap Tab, restore focus on close
  // Lock the background (calendar) from scrolling while the modal is open — otherwise
  // touch-scrolling leaks to the page behind and the fixed overlay appears frozen.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  const setField = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setDraft((p) => ({ ...p, [k]: v }) as SessionDraft)

  // Manual duration edit for a timed session (editable-after-the-fact fallback).
  // Takes SECONDS (DurationEdit parses min:sec text).
  const startedMs = draft.startedAt ? new Date(draft.startedAt).getTime() : null
  const durationMs = startedMs != null && draft.endedAt ? new Date(draft.endedAt).getTime() - startedMs : null
  const autoEnded = (draft.notes || '').includes('auto-ended at 90 min')
  function setDurationSec(s: number) {
    if (startedMs == null || s < 0) return
    setField('endedAt', new Date(startedMs + s * 1000).toISOString())
  }

  // The stamped record for this cell. Shared by Save and the Capability
  // block's ensure-session-first save.
  const buildRecord = (): SessionDraft => ({
    ...draft,
    id: `${cell.date}-${dayType}`,
    date: cell.date,
    macroId,
    cycle,
    week: cell.week,
    weekType: cell.weekType,
    dayType,
    difficulty,
    volumeDifficulty,
    topReps: SCHEMES[difficulty!].sets[3],
    topWeight: top,
  })

  // The Capability block: same FK-needs-the-session-row-first pattern as
  // every other sub-record save. Absent on deload (cycle null — nothing
  // renders for it there).
  const sessionId = dayType && difficulty ? `${cell.date}-${dayType}` : null
  const capabilityProp =
    sessionId && cycle != null && onSaveHypertrophyLog && onSaveOlyLog
      ? {
          movements,
          hypertrophyLogs: hypertrophyLogs.filter((l) => l.sessionId === sessionId),
          olyLogs: olyLogs.filter((l) => l.sessionId === sessionId),
          onSaveHypertrophyLog: async (l: HypertrophyLogDraft) => {
            await onSaveSession(buildRecord())
            return onSaveHypertrophyLog(l)
          },
          onSaveOlyLog: async (l: OlyLogDraft) => {
            await onSaveSession(buildRecord())
            return onSaveOlyLog(l)
          },
        }
      : null

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await onSaveSession(buildRecord())
      onClose()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }
  // A card's "Done" press — persists immediately (optionally patched, e.g.
  // Primer's primerDone) but does NOT close the modal, unlike the main Save
  // button below. Rethrows on failure so the card stays open instead of
  // collapsing over a lost edit.
  async function saveCard(patch?: Partial<SessionDraft>) {
    setSaving(true)
    setErr('')
    try {
      const record = { ...buildRecord(), ...patch }
      await onSaveSession(record)
      setDraft((p) => ({ ...p, ...patch }))
    } catch (e) {
      setErr(errMsg(e))
      throw e
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
    paddingTop: 20,
    paddingLeft: 12,
    paddingRight: 12,
    // Clear the home-indicator inset so the Log button isn't cut off at the bottom.
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
    overflowY: 'auto',
    overscrollBehavior: 'contain', // don't chain scroll to the page behind
    // Above the fixed bottom nav (zIndex 50) — otherwise the nav covers the Log button.
    zIndex: 60,
  }
  const sheet: CSSProperties = { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 4, maxWidth: 520, width: '100%', padding: 18, marginTop: 20 }

  return (
    <div style={overlay} onClick={onClose}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="session-modal-title" tabIndex={-1} style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {shortDate(cell.date)}
              {cell.meso ? ` · C${cell.meso} W${cell.week}` : ''}
            </div>
            <div id="session-modal-title" style={{ fontFamily: HEADING, fontSize: 22, letterSpacing: '0.04em' }}>
              {isDeloadWeek ? (
                'Deload Session'
              ) : (
                <span>
                  {dayType ? LIFT_LABEL[dayType] : ''} <span style={{ color: pillColor(difficulty) }}>· {difficulty?.toUpperCase()}</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
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

        <Giant2SessionForm
          dayType={dayType!}
          difficulty={difficulty!}
          volumeDifficulty={volumeDifficulty}
          top={top}
          volumeTop={volumeTop}
          hasWeight={hasWeight}
          isDeload={isDeload}
          draft={draft}
          setField={setField}
          onSaveCard={saveCard}
          sequential={false}
          saving={saving}
          secondaryCell={secondaryCell}
          giantAccessory={giantAccessory}
          cycle={cycle}
          weekInCycle={cell.week}
          carryLoad={carryDefault}
          capability={capabilityProp}
        />
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
              <label style={lbl}>Edit (min:sec)</label>
              <DurationEdit valueMs={durationMs} onCommit={setDurationSec} />
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
      </div>
    </div>
  )
}
