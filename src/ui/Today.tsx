import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { C, HEADING, pillColor, inp, lbl } from './theme'
import { Card } from './components'
import { PositionHeader, fmtClock, errMsg } from './controls'
import { useWakeLock } from './useWakeLock'
import { SessionForm, buildBlankSession } from './SessionForm'
import { TestingResultForm } from './TestingResultForm'
import { ROTATION, SCHEMES, LIFT_LABEL, SIGNALS } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { todayISO, mondayOf, parseLocalDate, isoLocal } from '../engine/date-engine'
import { computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor } from '../engine/deload-rule'
import type {
  Position,
  Session,
  SessionDraft,
  WeightsByCycle,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  TestingResult,
  WeekType,
  Lift,
  Difficulty,
} from '../engine/types'

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
  testingResults?: TestingResult[]
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onApplyDeload: (weekKey: string, on: boolean) => Promise<void>
  onSaveTestingResult: (r: TestingResult) => Promise<TestingResult>
  onDeleteTestingResult: (id: string) => void
}

export function Today({
  computed,
  macroId,
  weights,
  accessory,
  sessions,
  deloads,
  breakDays = {},
  testingResults = [],
  onSaveSession,
  onApplyDeload,
  onSaveTestingResult,
  onDeleteTestingResult,
}: TodayProps) {
  const [viewDiff, setViewDiff] = useState<Difficulty | null>(null)
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
          All 15 weeks done. Head to Setup to start the next macrocycle — carry your C3 weights forward as the new starting
          loads.
        </div>
      </Card>
    )
  if (computed.weekType === 'testing') {
    if (computed.isSessionDay && computed.testRole === 'test' && computed.testLift) {
      return (
        <div>
          <PositionHeader computed={computed} label="Testing Week" />
          <TestingResultForm
            macroId={macroId}
            lift={computed.testLift}
            testedOn={todayISO()}
            results={testingResults}
            onSave={onSaveTestingResult}
            onDelete={onDeleteTestingResult}
          />
        </div>
      )
    }
    return (
      <div>
        <PositionHeader computed={computed} label="Testing Week" />
        <Card style={{ border: `1px solid ${C.gold}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {computed.isSessionDay && computed.testRole === 'light' ? 'Optional light session' : 'Testing week'}
          </div>
          <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5 }}>
            {computed.isSessionDay && computed.testRole === 'light'
              ? 'Optional easy session between the two test days — keep it light, just movement and a pump. Skip if you prefer.'
              : 'Test days are Monday & Friday this week. Open Today on a test day (or any test cell in the Calendar) to record your 2–3RM.'}
          </div>
        </Card>
      </div>
    )
  }
  if (computed.weekType === 'deload')
    return (
      <div>
        <PositionHeader computed={computed} label="Deload Week" />
        <Card style={{ border: `1px solid ${C.gold}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>End-of-macro deload</div>
          <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5 }}>
            Giant Block only at 50–60% of working loads, hard rep scheme. No volume, no carries. Keep skill days. This should
            feel easy — that's correct.
          </div>
        </Card>
      </div>
    )

  if (!computed.isSessionDay) {
    const ns = computed.nextSession
    return (
      <div>
        <PositionHeader computed={computed} />
        <Card style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: HEADING, fontSize: 22, color: C.gold, letterSpacing: '0.05em' }}>Skill day / Rest</div>
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
  const { meso: cycle, week, macro, difficulty: posDiff, weekIndex } = computed
  if (cycle == null || week == null || posDiff == null || weekIndex == null) return null
  const difficulty = viewDiff || posDiff
  const dayType = ROTATION[week - 1][difficulty]
  const base = weights?.[cycle]?.[dayType]?.[difficulty]
  const hasWeight = base != null
  const weekKey = weekKeyFor(macro, cycle, week)
  const isDeload = !!deloads[weekKey]
  const top = base != null ? (isDeload ? deloadTop(base) : base) : null
  const cleanDefault = accessory?.[cycle]?.clean ?? ''
  const sessionId = `${todayISO()}-${dayType}-${difficulty[0].toUpperCase()}`
  const existing = sessions.find((s) => s.id === sessionId)
  const currentWeekSessions = sessions.filter((s) => s.cycle === cycle && s.week === week)

  // Reactive-deload recommendation (based on previous week's signals).
  const prevWeekSessions = week > 1 ? sessions.filter((s) => s.cycle === cycle && s.week === week - 1) : []
  const recommend = shouldRecommendDeload({
    prevWeekSessions,
    alreadyDeloaded: isDeload,
    usedThisMeso: usedDeloadThisMeso(deloads, macro, cycle),
    breakComing: breakInWeek(computed.startISO ?? '', weekIndex, breakDays),
  })

  return (
    <div>
      {recommend && onApplyDeload && (
        <Card style={{ border: `1px solid ${C.red}`, background: 'rgba(232,136,136,0.10)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: C.red, textTransform: 'uppercase', marginBottom: 6 }}>Reactive deload recommended</div>
          <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5, marginBottom: 10 }}>
            Last week (W{week - 1}) logged 3+ fatigue signals. The rule recommends a deload: Giant Block only at ~70%, no
            volume, light/skipped carries. Skill days stay normal.
          </div>
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
        blank={() => buildBlankSession({ date: todayISO(), macroId, cycle, week, weekType: 'training', dayType, difficulty, baseTop: base, isDeload, cleanDefault })}
        headerSlot={<PositionHeader computed={computed} viewDiff={viewDiff} setViewDiff={setViewDiff} />}
        dayType={dayType}
        difficulty={difficulty}
        top={top}
        hasWeight={hasWeight}
        isDeload={isDeload}
        currentWeekSessions={currentWeekSessions}
        stamp={{ macroId, cycle, week, weekType: 'training', dayType, difficulty, topReps: SCHEMES[difficulty].sets[3], topWeight: top, date: todayISO(), id: sessionId }}
        onSaveSession={onSaveSession}
        saving={saving}
        setSaving={setSaving}
        saved={saved}
        setSaved={setSaved}
      />
    </div>
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
  currentWeekSessions: Session[]
  stamp: Stamp
  onSaveSession: (record: SessionDraft) => Promise<Session>
  saving: boolean
  setSaving: (b: boolean) => void
  saved: boolean
  setSaved: (b: boolean) => void
}

function SessionEditor({ sessionId, existing, blank, headerSlot, dayType, difficulty, top, hasWeight, isDeload, currentWeekSessions, stamp, onSaveSession, saving, setSaving, saved, setSaved }: SessionEditorProps) {
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

  async function persist(record: SessionDraft, flashSaved: boolean) {
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
    } finally {
      setSaving(false)
    }
  }

  const handleEnd = () => persist({ ...draft, ...stamp, endedAt: new Date().toISOString() }, true)
  const handleSave = () => persist({ ...draft, ...stamp }, true)

  // Manual duration edit (completed/auto-ended): recompute ended_at from started_at.
  function setDurationMin(val: string) {
    const n = parseFloat(val)
    if (startedMs == null || !Number.isFinite(n) || n < 0) return
    setField('endedAt', new Date(startedMs + n * 60000).toISOString())
  }

  const autoEnded = (draft.notes || '').includes(AUTO_END_NOTE)

  return (
    <div>
      {headerSlot}

      <TimerBar
        notStarted={notStarted}
        running={running}
        elapsedMs={elapsedMs}
        durationMs={durationMs}
        hasTimer={startedMs != null}
        autoEnded={autoEnded}
        saving={saving}
        onStart={handleStart}
        durationMin={durationMs != null ? Math.round(durationMs / 60000) : ''}
        onDurationMin={setDurationMin}
      />

      <SessionForm dayType={dayType} difficulty={difficulty} top={top} hasWeight={hasWeight} isDeload={isDeload} draft={draft} setField={setField} locked={notStarted} />

      {!notStarted && (
        <button
          onClick={running ? handleEnd : handleSave}
          disabled={saving}
          style={{ width: '100%', background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 14, fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : running ? 'End session' : 'Update session'}
        </button>
      )}
      {err && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>
      )}
      <SignalBanner currentWeekSessions={currentWeekSessions} draft={draft} />
    </div>
  )
}

interface TimerBarProps {
  notStarted: boolean
  running: boolean
  elapsedMs: number
  durationMs: number | null
  hasTimer: boolean
  autoEnded: boolean
  saving: boolean
  onStart: () => void
  durationMin: number | string
  onDurationMin: (val: string) => void
}

// Top of the session: Start button (not started) / live mm:ss (running) /
// duration + manual edit (completed).
function TimerBar({ notStarted, running, elapsedMs, durationMs, hasTimer, autoEnded, saving, onStart, durationMin, onDurationMin }: TimerBarProps) {
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
  if (running) {
    return (
      <Card style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>Session running</div>
        <div style={{ fontFamily: HEADING, fontSize: 44, color: C.gold, letterSpacing: '0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(elapsedMs)}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Auto-ends at 90 min.</div>
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
            <label style={lbl}>Edit (min)</label>
            <input style={inp} type="number" min="0" step="1" value={durationMin} onChange={(e) => onDurationMin(e.target.value)} />
          </div>
        )}
      </div>
    </Card>
  )
}

// Live fatigue-signal feedback for the current week, including the draft.
function SignalBanner({ currentWeekSessions, draft }: { currentWeekSessions: Session[]; draft: SessionDraft }) {
  // computeWeekSignals ignores cleanLoad (the only field that differs in a draft).
  const merged = currentWeekSessions.filter((s) => s.id !== draft.id).concat(draft as Session)
  const sig = computeWeekSignals(merged)
  if (sig.occurrences === 0) return null
  const fired = sig.fired
  return (
    <div style={{ marginTop: 16, padding: 14, borderRadius: 2, background: fired ? 'rgba(232,136,136,0.12)' : 'rgba(201,168,76,0.10)', border: `1px solid ${fired ? C.red : C.gold}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: fired ? C.red : C.gold, textTransform: 'uppercase', marginBottom: 6 }}>
        {fired ? 'Reactive deload triggered' : `Fatigue signals: ${sig.occurrences} occ · ${sig.sessionCount} day${sig.sessionCount === 1 ? '' : 's'}`}
      </div>
      <div style={{ fontSize: 12, color: C.off, lineHeight: 1.5 }}>{[...sig.types].map((id) => SIGNALS.find((x) => x.id === id)?.label).join(' · ')}</div>
      {fired && <div style={{ fontSize: 12, color: C.off, marginTop: 8, fontStyle: 'italic' }}>Next week the app will recommend a deload (unless a break is scheduled).</div>}
    </div>
  )
}
