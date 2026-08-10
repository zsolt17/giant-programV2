import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { C, HEADING, pillColor, lbl } from './theme'
import { Card } from './components'
import { PositionHeader, DurationEdit, fmtClock, errMsg } from './controls'
import { useWakeLock } from './useWakeLock'
import { Giant2SessionForm } from './Giant2SessionForm'
import { buildBlankSession } from './SessionForm'
import { SCHEMES, LIFT_LABEL, SIGNALS, SECONDARY_LANE } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { mondayOf, parseLocalDate, isoLocal } from '../engine/date-engine'
import { computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor } from '../engine/deload-rule'
import type {
  Position,
  Session,
  SessionDraft,
  WeightsByCycle,
  LiftWeights,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  WeekType,
  Lift,
  Difficulty,
  GiantAccessoryReps,
  HypertrophyLog,
  HypertrophyLogDraft,
  OlyLog,
  OlyLogDraft,
} from '../engine/types'
import type { Movement } from '../engine/movements'

// Capability block context — the FK needs the session row first, so its save
// upserts the current draft before writing the sub-record. Movements + BOTH
// log arrays (only one program is ever active for a given cycle, but the
// context doesn't need to know which).
interface CapabilityCtx {
  movements: Movement[]
  hypertrophyLogs: HypertrophyLog[]
  olyLogs: OlyLog[]
  onSaveHypertrophyLog: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
  onSaveOlyLog: (log: OlyLogDraft) => Promise<OlyLog>
}

// Is any break day inside the program week containing weekIndex?
function breakInWeek(startISO: string, weekIndex: number, breakDays: BreakDayMap): boolean {
  const monday = mondayOf(parseLocalDate(startISO))
  monday.setDate(monday.getDate() + weekIndex * 7)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (breakDays[isoLocal(d)]) return true
  }
  return false
}

// --- session timer helpers --------------------------------------------------
const CAP_MS = 90 * 60 * 1000 // 90-minute auto-end safeguard
const AUTO_END_NOTE = 'auto-ended at 90 min'

function appendNote(notes: string, addition: string): string {
  const n = (notes || '').trim()
  if (n.includes(addition)) return notes
  return n ? `${n} · ${addition}` : addition
}

// The prescribed-position stamp applied to a session record on every save.
interface Stamp {
  macroId: string
  cycle: number | null
  week: number | null
  weekType: WeekType
  dayType: Lift
  difficulty: Difficulty
  volumeDifficulty?: Difficulty | null
  topReps: number | null
  topWeight: number | null
  date: string
  id: string
}

interface TodayProps {
  computed: Position
  macroId: string
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  sessions: Session[]
  deloads: DeloadMap
  breakDays?: BreakDayMap
  deloadExtended?: boolean
  // The date the position was computed for (honours the dev ?today override).
  dateISO?: string
  // Giant Block accessory rep targets (Setup config, defaults merged).
  giantAccessory?: GiantAccessoryReps
  // The Capability block: the athlete's movement library + this macro's
  // Hypertrophy/Oly logs + save handlers.
  movements?: Movement[]
  hypertrophyLogs?: HypertrophyLog[]
  olyLogs?: OlyLog[]
  onSaveHypertrophyLog?: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
  onSaveOlyLog?: (log: OlyLogDraft) => Promise<OlyLog>
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onApplyDeload: (weekKey: string, on: boolean) => Promise<void>
  onExtendDeload?: (on: boolean) => Promise<void>
  onRunningChange?: (running: boolean) => void
}

export function Today({
  computed,
  macroId,
  weights,
  accessory,
  sessions,
  deloads,
  breakDays = {},
  deloadExtended = false,
  dateISO,
  giantAccessory,
  movements = [],
  hypertrophyLogs = [],
  olyLogs = [],
  onSaveSession,
  onApplyDeload,
  onSaveHypertrophyLog,
  onSaveOlyLog,
  onExtendDeload,
  onRunningChange,
}: TodayProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (computed.beforeStart)
    return (
      <Card style={{ textAlign: 'center', color: C.muted, padding: 30 }}>
        Macro hasn't started yet. First session: {isoLocal(mondayOf(parseLocalDate(computed.startISO || '')))}.
      </Card>
    )
  if (computed.complete)
    return (
      <Card style={{ border: `1px solid ${C.gold}`, textAlign: 'center', padding: 30 }}>
        <div style={{ fontFamily: HEADING, fontSize: 24, color: C.gold, letterSpacing: '0.05em', marginBottom: 8 }}>MACRO COMPLETE</div>
        <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5 }}>
          All {computed.totalWeeks} weeks done. Head to Setup to start the next macrocycle — carry your C3 weights forward
          as the new starting loads.
        </div>
      </Card>
    )
  const today = dateISO || isoLocal(new Date())

  // The deload week DOES carry a dayType (fixed day->lift applies deload or
  // not): Giant block only, ~70% of the last training cycle's (C3) Hard
  // anchor, fixed Hard rep scheme (no H/M/L that week — 'hard' is used
  // purely as the SCHEMES lookup).
  if (computed.weekType === 'deload' && computed.dayType) {
    const dayType = computed.dayType as Lift
    const difficulty: Difficulty = 'hard'
    const REFERENCE_CYCLE = 3 // the last training cycle — deload continues off it
    const base = weights?.[REFERENCE_CYCLE]?.[dayType]?.hard
    const hasWeight = base != null
    const top = base != null ? deloadTop(base) : null
    const laneKey = SECONDARY_LANE[dayType]
    const secondaryCell = laneKey ? weights?.[REFERENCE_CYCLE]?.[laneKey] ?? null : null
    const sessionId = `${today}-${dayType}`
    const existing = sessions.find((s) => s.id === sessionId)
    const currentWeekSessions = sessions.filter((s) => s.weekType === 'deload' && s.date.slice(0, 7) === today.slice(0, 7))
    return (
      <div>
        <SessionEditor
          key={sessionId}
          sessionId={sessionId}
          existing={existing}
          blank={() =>
            buildBlankSession({ date: today, macroId, cycle: null, week: null, weekType: 'deload', dayType, difficulty, volumeDifficulty: null, baseTop: base, isDeload: true })
          }
          headerSlot={<PositionHeader computed={computed} label={`Deload Week${deloadExtended ? ' · extended' : ''}`} />}
          dayType={dayType}
          difficulty={difficulty}
          top={top}
          hasWeight={hasWeight}
          isDeload={true}
          volumeDifficulty={null}
          volumeTop={null}
          secondaryCell={secondaryCell}
          giantAccessory={giantAccessory}
          currentWeekSessions={currentWeekSessions}
          stamp={{ macroId, cycle: null, week: null, weekType: 'deload', dayType, difficulty, volumeDifficulty: null, topReps: SCHEMES.hard.sets[3], topWeight: top, date: today, id: sessionId }}
          onSaveSession={onSaveSession}
          onRunningChange={onRunningChange}
          saving={saving}
          setSaving={setSaving}
          saved={saved}
          setSaved={setSaved}
        />
        {onExtendDeload && <DeloadExtend extended={deloadExtended} onExtendDeload={onExtendDeload} />}
      </div>
    )
  }

  if (!computed.isSessionDay) {
    const ns = computed.nextSession
    return (
      <div>
        <PositionHeader computed={computed} />
        <Card style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: HEADING, fontSize: 22, color: C.gold, letterSpacing: '0.05em' }}>Rest Day</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>No strength session scheduled today.</div>
          {ns && ns.dayType && (
            <div style={{ fontSize: 13, color: C.off, marginTop: 12 }}>
              Next: {LIFT_LABEL[ns.dayType]} <span style={{ color: pillColor(ns.difficulty) }}>· {ns.difficulty?.toUpperCase()}</span> ({ns.date})
            </div>
          )}
        </Card>
      </div>
    )
  }

  // --- normal training session ---------------------------------------------
  // On a training session day the date engine guarantees these are all set.
  const { meso: cycle, week, macro, difficulty, weekIndex } = computed
  if (cycle == null || week == null || difficulty == null || weekIndex == null) return null
  const dayType = computed.dayType as Lift
  const base = weights?.[cycle]?.[dayType]?.[difficulty]
  const hasWeight = base != null
  const weekKey = weekKeyFor(macro, cycle, week)
  const isDeload = !!deloads[weekKey]
  const top = base != null ? (isDeload ? deloadTop(base) : base) : null
  // The Volume block's OWN difficulty (independent of the Giant block's
  // above) and its day-top off the SAME per-cycle cascade — just indexed by
  // the other difficulty. Null volumeDifficulty (C3 W4) means no Volume block.
  const volumeDifficulty = computed.volumeDifficulty ?? null
  const volumeTop = volumeDifficulty ? weights?.[cycle]?.[dayType]?.[volumeDifficulty] ?? null : null
  const carryDefault = accessory?.[cycle]?.[`carry_${dayType}`] ?? ''
  // The day's secondary (db_row/pendlay_row lane — BB Row on OHP day, Pull-ups on bench day).
  const laneKey = SECONDARY_LANE[dayType]
  const secondaryCell = laneKey ? weights?.[cycle]?.[laneKey] ?? null : null
  const sessionId = `${today}-${dayType}`
  const existing = sessions.find((s) => s.id === sessionId)
  const currentWeekSessions = sessions.filter((s) => s.cycle === cycle && s.week === week)

  // Capability block context — only when the cycle actually has one (never
  // on deload, cycle is null there). The block itself decides Hypertrophy/
  // Oly/Carries by cycle; this context just supplies the data both
  // per-movement log types might need.
  const capabilityCtx: CapabilityCtx | null =
    onSaveHypertrophyLog && onSaveOlyLog
      ? {
          movements,
          hypertrophyLogs: hypertrophyLogs.filter((l) => l.sessionId === sessionId),
          olyLogs: olyLogs.filter((l) => l.sessionId === sessionId),
          onSaveHypertrophyLog,
          onSaveOlyLog,
        }
      : null

  // Reactive-deload recommendation, based on the previous week's signals.
  const prevWeekSessions = week > 1 ? sessions.filter((s) => s.cycle === cycle && s.week === week - 1) : []
  const recommend = shouldRecommendDeload({
    prevWeekSessions,
    alreadyDeloaded: isDeload,
    usedThisMeso: usedDeloadThisMeso(deloads, macro, cycle),
    breakComing: breakInWeek(computed.startISO ?? '', weekIndex, breakDays),
  })
  const prevSig = recommend ? computeWeekSignals(prevWeekSessions) : null

  return (
    <div>
      {recommend && onApplyDeload && (
        <Card style={{ border: `1px solid ${C.red}`, background: 'rgba(232,136,136,0.10)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: C.red, textTransform: 'uppercase', marginBottom: 6 }}>Reactive deload recommended</div>
          <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5, marginBottom: 10 }}>
            Last week (W{week - 1}) logged 3+ fatigue signals. The rule recommends a deload: Giant Block only at ~70%, no
            volume, light/skipped carries.
          </div>
          {prevSig && prevSig.types.size > 0 && (
            <div style={{ fontSize: 12, color: C.off, lineHeight: 1.6, marginBottom: 10 }}>
              {[...prevSig.types].map((id) => (
                <div key={id}>
                  <span style={{ color: C.red, fontWeight: 600 }}>{id}</span> · {signalLabel(id)}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onApplyDeload(weekKey, true)} style={{ background: C.red, color: C.dark, border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Apply deload
            </button>
            <button onClick={() => onApplyDeload(weekKey, false)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, fontSize: 12, padding: '8px 14px', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8, fontStyle: 'italic' }}>Dismiss if it was a one-off or a break is already coming.</div>
        </Card>
      )}

      {isDeload && (
        <Card style={{ border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: C.gold, textTransform: 'uppercase' }}>Deload week active</div>
            <div style={{ fontSize: 12, color: C.off, marginTop: 4 }}>Giant Block only · loads ~70% · volume &amp; carry off</div>
          </div>
          {onApplyDeload && (
            <button onClick={() => onApplyDeload(weekKey, false)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>
              Undo
            </button>
          )}
        </Card>
      )}

      <SessionEditor
        key={sessionId + (isDeload ? '-d' : '')}
        sessionId={sessionId}
        existing={existing}
        blank={() => buildBlankSession({ date: today, macroId, cycle, week, weekType: 'training', dayType, difficulty, volumeDifficulty, baseTop: base, isDeload })}
        headerSlot={<PositionHeader computed={computed} />}
        dayType={dayType}
        difficulty={difficulty}
        top={top}
        hasWeight={hasWeight}
        isDeload={isDeload}
        volumeDifficulty={volumeDifficulty}
        volumeTop={volumeTop}
        carryLoad={carryDefault}
        secondaryCell={secondaryCell}
        giantAccessory={giantAccessory}
        cycle={cycle}
        weekInCycle={week}
        capabilityCtx={capabilityCtx}
        currentWeekSessions={currentWeekSessions}
        stamp={{
          macroId,
          cycle,
          week,
          weekType: 'training',
          dayType,
          difficulty,
          volumeDifficulty,
          topReps: SCHEMES[difficulty].sets[3],
          topWeight: top,
          date: today,
          id: sessionId,
        }}
        onSaveSession={onSaveSession}
        onRunningChange={onRunningChange}
        saving={saving}
        setSaving={setSaving}
        saved={saved}
        setSaved={setSaved}
      />
    </div>
  )
}

// "Extend deload one week" — decided during the deload itself, never
// pre-planned. Confirm-gated (like Start-next-macro); undoable while extended.
function DeloadExtend({ extended, onExtendDeload }: { extended: boolean; onExtendDeload: (on: boolean) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function apply(on: boolean) {
    setBusy(true)
    setErr('')
    try {
      await onExtendDeload(on)
      setConfirm(false)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      {extended ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: C.gold, textTransform: 'uppercase' }}>Deload extended</div>
            <div style={{ fontSize: 12, color: C.off, marginTop: 4 }}>A second identical deload week follows; the macro completes after it.</div>
          </div>
          <button onClick={() => apply(false)} disabled={busy} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, fontSize: 11, padding: '5px 10px', cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? '…' : 'Undo'}
          </button>
        </div>
      ) : !confirm ? (
        <>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
            Still cooked? You can extend the deload by one identical week — decide here, during the deload, not in advance.
          </div>
          <button
            onClick={() => setConfirm(true)}
            style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 2, padding: '10px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Extend deload one week…
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.off }}>Add a second deload week?</span>
          <button onClick={() => apply(true)} disabled={busy} style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Saving…' : 'Yes, extend'}
          </button>
          <button onClick={() => setConfirm(false)} disabled={busy} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}.</div>}
    </Card>
  )
}

interface SessionEditorProps {
  sessionId: string
  existing?: Session
  blank: () => SessionDraft
  headerSlot: ReactNode
  dayType: Lift
  difficulty: Difficulty
  top: number | null
  hasWeight: boolean
  isDeload: boolean
  volumeDifficulty?: Difficulty | null
  volumeTop?: number | null
  carryLoad?: number | string | null
  secondaryCell?: LiftWeights | null
  giantAccessory?: GiantAccessoryReps
  // The cycle (null on deload — nothing renders), the week within it (Oly's
  // position-wave text), and the Capability block's log context.
  cycle?: number | null
  weekInCycle?: number | null
  capabilityCtx?: CapabilityCtx | null
  currentWeekSessions: Session[]
  stamp: Stamp
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onRunningChange?: (running: boolean) => void
  saving: boolean
  setSaving: (b: boolean) => void
  saved: boolean
  setSaved: (b: boolean) => void
}

function SessionEditor({
  sessionId,
  existing,
  blank,
  headerSlot,
  dayType,
  difficulty,
  top,
  hasWeight,
  isDeload,
  volumeDifficulty,
  volumeTop,
  carryLoad,
  secondaryCell,
  giantAccessory,
  cycle,
  weekInCycle,
  capabilityCtx = null,
  currentWeekSessions,
  stamp,
  onSaveSession,
  onRunningChange,
  saving,
  setSaving,
  saved,
  setSaved,
}: SessionEditorProps) {
  const [draft, setDraft] = useState<SessionDraft>(() => existing || blank())
  const [err, setErr] = useState('')
  const [nowTs, setNowTs] = useState(() => Date.now())
  const autoEndingRef = useRef(false)

  useEffect(() => {
    setDraft(existing || blank())
    setSaved(false)
    setErr('')
    autoEndingRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const setField = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setDraft((p) => ({ ...p, [k]: v }) as SessionDraft)

  // Three states derived from the timestamps (no phase column).
  const running = !!draft.startedAt && !draft.endedAt
  const completed = !running && (!!existing || !!draft.endedAt)
  const notStarted = !running && !completed

  // Keep the screen awake while a session is running (battery-friendly: only then).
  useWakeLock(running)

  // Report running up so the Shell reserves top space for the fixed session bar;
  // always clear it when this editor unmounts (e.g. switching tabs).
  useEffect(() => {
    onRunningChange?.(running)
  }, [running, onRunningChange])
  useEffect(() => () => onRunningChange?.(false), [onRunningChange])

  // Tick only to re-render while running; the shown time is always recomputed from
  // started_at, so sleep / backgrounding / reopen read correctly.
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [running])

  const startedMs = draft.startedAt ? new Date(draft.startedAt).getTime() : null
  const elapsedMs = startedMs != null ? nowTs - startedMs : 0
  const durationMs = startedMs != null && draft.endedAt ? new Date(draft.endedAt).getTime() - startedMs : null

  // 90-min safeguard, evaluated from started_at (fires even if the app was closed
  // when the limit passed — checked on every render/open while running).
  useEffect(() => {
    if (running && startedMs != null && nowTs - startedMs >= CAP_MS && !autoEndingRef.current) {
      autoEndingRef.current = true
      const record: SessionDraft = {
        ...draft,
        ...stamp,
        endedAt: new Date(startedMs + CAP_MS).toISOString(),
        notes: appendNote(draft.notes, AUTO_END_NOTE),
      }
      setDraft(record)
      onSaveSession(record).catch((e) => setErr(errMsg(e)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, nowTs, startedMs])

  // Persist on Start so the running state survives a reload; only flip the UI to
  // running after the save succeeds.
  async function handleStart() {
    setSaving(true)
    setErr('')
    const record: SessionDraft = { ...draft, ...stamp, startedAt: new Date().toISOString(), endedAt: null }
    try {
      await onSaveSession(record)
      setDraft(record)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // `rethrow`: card-level saves need to know if the write actually landed —
  // Giant2SessionForm only collapses a card on a SUCCESSFUL save, so a failed
  // Done doesn't silently discard an edit behind a card that looks complete.
  // The main Start/End/Update buttons don't check their own promise, so they
  // keep the original swallow-and-show-inline-error behavior (rethrow=false).
  async function persist(record: SessionDraft, flashSaved: boolean, rethrow = false) {
    setSaving(true)
    setErr('')
    try {
      await onSaveSession(record)
      setDraft(record)
      if (flashSaved) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1800)
      }
    } catch (e) {
      setErr(errMsg(e))
      if (rethrow) throw e
    } finally {
      setSaving(false)
    }
  }

  const handleEnd = () => persist({ ...draft, ...stamp, endedAt: new Date().toISOString() }, true)
  const handleSave = () => persist({ ...draft, ...stamp }, true)

  // A card's "Done" press — persists the draft (optionally patched, e.g.
  // Primer's primerDone) so the card's completion survives a reload; no
  // "Saved ✓" flash since the card collapsing IS the feedback. Rethrows on
  // failure so the card stays open instead of collapsing over a lost edit.
  const saveCard = (patch?: Partial<SessionDraft>) => persist({ ...draft, ...patch, ...stamp }, false, true)

  // Manual duration edit (completed/auto-ended): recompute ended_at from
  // started_at. Takes SECONDS (DurationEdit parses min:sec text).
  function setDurationSec(s: number) {
    if (startedMs == null || s < 0) return
    setField('endedAt', new Date(startedMs + s * 1000).toISOString())
  }

  const autoEnded = (draft.notes || '').includes(AUTO_END_NOTE)

  // Capability block: FK needs the session row, so its save upserts the
  // current draft first (idempotent) and then writes the sub-record.
  const capability = capabilityCtx
    ? {
        movements: capabilityCtx.movements,
        hypertrophyLogs: capabilityCtx.hypertrophyLogs,
        olyLogs: capabilityCtx.olyLogs,
        onSaveHypertrophyLog: async (l: HypertrophyLogDraft) => {
          await onSaveSession({ ...draft, ...stamp })
          return capabilityCtx.onSaveHypertrophyLog(l)
        },
        onSaveOlyLog: async (l: OlyLogDraft) => {
          await onSaveSession({ ...draft, ...stamp })
          return capabilityCtx.onSaveOlyLog(l)
        },
      }
    : null

  return (
    <div>
      {headerSlot}

      {/* Start (not started) / duration + edit (completed). When running, controls
          live entirely in the fixed SessionControlBar below — nothing up here. */}
      {!running && (
        <TimerBar
          notStarted={notStarted}
          durationMs={durationMs}
          hasTimer={startedMs != null}
          autoEnded={autoEnded}
          saving={saving}
          onStart={handleStart}
          onDurationSec={setDurationSec}
        />
      )}

      <Giant2SessionForm
        dayType={dayType}
        difficulty={difficulty}
        volumeDifficulty={volumeDifficulty ?? null}
        top={top}
        volumeTop={volumeTop ?? null}
        hasWeight={hasWeight}
        isDeload={isDeload}
        draft={draft}
        setField={setField}
        locked={notStarted}
        onSaveCard={saveCard}
        saving={saving}
        secondaryCell={secondaryCell}
        giantAccessory={giantAccessory}
        cycle={cycle}
        weekInCycle={weekInCycle}
        carryLoad={carryLoad}
        capability={capability}
      />

      {completed && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 14, fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Update session'}
        </button>
      )}
      {err && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>
      )}
      <SignalBanner currentWeekSessions={currentWeekSessions} draft={draft} />

      {running && <SessionControlBar elapsedMs={elapsedMs} saving={saving} onEnd={handleEnd} />}
    </div>
  )
}

interface TimerBarProps {
  notStarted: boolean
  durationMs: number | null
  hasTimer: boolean
  autoEnded: boolean
  saving: boolean
  onStart: () => void
  onDurationSec: (seconds: number) => void
}

// Top of the session in the non-running states: Start button (not started) /
// duration + manual edit (completed). The running state has no top element —
// its controls live in the fixed SessionControlBar.
function TimerBar({ notStarted, durationMs, hasTimer, autoEnded, saving, onStart, onDurationSec }: TimerBarProps) {
  if (notStarted) {
    return (
      <Card style={{ textAlign: 'center' }}>
        <button
          onClick={onStart}
          disabled={saving}
          style={{ width: '100%', background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 14, fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Starting…' : 'Start session'}
        </button>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Fields unlock once you start. (Logging via the Calendar skips the timer.)</div>
      </Card>
    )
  }
  // completed
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>Duration</div>
          <div style={{ fontFamily: HEADING, fontSize: 28, color: C.off, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {hasTimer ? fmtClock(durationMs) : 'Not timed'}
          </div>
          {autoEnded && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Auto-ended at 90 min — adjust if needed.</div>}
        </div>
        {hasTimer && (
          <div style={{ width: 110 }}>
            <label style={lbl}>Edit (min:sec)</label>
            <DurationEdit valueMs={durationMs} onCommit={onDurationSec} />
          </div>
        )}
      </div>
    </Card>
  )
}

// Fixed, always-visible control for a RUNNING session: live mm:ss (left, computed
// from started_at) + End with a quick confirm (right). Pinned to the viewport top
// (the bottom is owned by the nav); floats below the iOS status bar / notch via the
// top safe-area inset. The Shell reserves matching top space while running.
function SessionControlBar({ elapsedMs, saving, onEnd }: { elapsedMs: number; saving: boolean; onEnd: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: C.navy,
        borderBottom: '1px solid rgba(201,168,76,0.35)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        padding: '10px 16px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))',
      }}
    >
      <div aria-label="Session time" style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase' }}>Session running</div>
        <div style={{ fontFamily: HEADING, fontSize: 30, color: C.gold, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{fmtClock(elapsedMs)}</div>
        <div style={{ fontSize: 10, color: C.muted }}>Auto-ends at 90 min</div>
      </div>

      {confirm ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: C.off }}>End?</span>
          <button
            onClick={onEnd}
            disabled={saving}
            style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '11px 18px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirm(false)}
            disabled={saving}
            aria-label="Cancel ending session"
            style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, padding: '11px 13px', fontSize: 13, cursor: 'pointer' }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '13px 22px', fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          End session
        </button>
      )}
    </div>
  )
}

export function signalLabel(id: string): string | undefined {
  return SIGNALS.find((x) => x.id === id)?.label
}

// Live fatigue-signal feedback for the current week, including the
// in-progress draft.
function SignalBanner({ currentWeekSessions, draft }: { currentWeekSessions: Session[]; draft?: SessionDraft }) {
  // computeWeekSignals ignores the fields that differ between draft and Session.
  const mergedSessions = draft ? currentWeekSessions.filter((s) => s.id !== draft.id).concat(draft as Session) : currentWeekSessions
  const sig = computeWeekSignals(mergedSessions)
  if (sig.occurrences === 0) return null
  const fired = sig.fired
  return (
    <div style={{ marginTop: 16, padding: 14, borderRadius: 2, background: fired ? 'rgba(232,136,136,0.12)' : 'rgba(201,168,76,0.10)', border: `1px solid ${fired ? C.red : C.gold}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: fired ? C.red : C.gold, textTransform: 'uppercase', marginBottom: 6 }}>
        {fired ? 'Reactive deload triggered' : `Fatigue signals: ${sig.occurrences} occ · ${sig.sessionCount} day${sig.sessionCount === 1 ? '' : 's'}`}
      </div>
      <div style={{ fontSize: 12, color: C.off, lineHeight: 1.5 }}>{[...sig.types].map(signalLabel).filter(Boolean).join(' · ')}</div>
      {fired && <div style={{ fontSize: 12, color: C.off, marginTop: 8, fontStyle: 'italic' }}>Next week the app will recommend a deload (unless a break is scheduled).</div>}
    </div>
  )
}
