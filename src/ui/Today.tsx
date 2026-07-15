import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { C, HEADING, pillColor, lbl } from './theme'
import { Card } from './components'
import { PositionHeader, DurationEdit, fmtClock, errMsg } from './controls'
import { useWakeLock } from './useWakeLock'
import { SessionForm, buildBlankSession } from './SessionForm'
import { TestingSessionView } from './TestingSession'
import { RunForm, buildBlankRun, SetPaceChip } from './RunForm'
import { ROTATION, SCHEMES, LIFT_LABEL, SIGNALS, RUN_SIGNALS, SECONDARY_ITEM, RUN_TYPE_LABEL } from '../engine/constants'
import { deloadTop } from '../engine/loading'
import { runSlotFor } from '../engine/runs'
import { todayISO, mondayOf, parseLocalDate, isoLocal } from '../engine/date-engine'
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
  TestingResult,
  WeekType,
  Lift,
  Difficulty,
  Run,
  RunDraft,
  RunSlot,
  RunTargetsByCycle,
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
  runs?: Run[]
  runTargets?: RunTargetsByCycle
  refPaceS?: number | null
  // The macro's shape (weeks + athlete deload extension) — feeds the engine.
  macroWeeks?: number
  deloadExtended?: boolean
  // The date the position was computed for (honours the dev ?today override).
  dateISO?: string
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onDeleteSession: (id: string) => Promise<void>
  onApplyDeload: (weekKey: string, on: boolean) => Promise<void>
  onSaveTestingResult: (r: TestingResult) => Promise<TestingResult>
  onDeleteTestingResult: (id: string) => void
  onSaveRun?: (record: RunDraft) => Promise<Run>
  onSetRefPace?: (refPaceS: number | null) => Promise<void>
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
  testingResults = [],
  runs = [],
  runTargets = {},
  refPaceS = null,
  macroWeeks,
  deloadExtended = false,
  dateISO,
  onSaveSession,
  onDeleteSession,
  onApplyDeload,
  onSaveTestingResult,
  onDeleteTestingResult,
  onSaveRun,
  onSetRefPace,
  onExtendDeload,
  onRunningChange,
}: TodayProps) {
  const shape = { weeks: macroWeeks, deloadExtended }
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
          All {computed.totalWeeks} weeks done. Head to Setup to start the next macrocycle — carry your C3 weights forward
          as the new starting loads.
        </div>
      </Card>
    )
  // Run day (Tue/Thu/Sat)? Never collides with lift session days (Mon/Wed/Fri):
  // training + deload weeks render the run session; the testing-week Saturday is
  // the 5k time trial. Reactive-deload weeks collapse to short-easy-only.
  const today = dateISO || todayISO()
  const runSlot = computed.startISO ? runSlotFor(computed.startISO, computed.macro, parseLocalDate(today), shape) : null
  if (runSlot && onSaveRun) {
    const runDeloadWeek =
      runSlot.weekType === 'training' &&
      runSlot.cycle != null &&
      runSlot.week != null &&
      !!deloads[weekKeyFor(computed.macro, runSlot.cycle, runSlot.week)]
    const targetRaw = runSlot.weekType === 'training' && runSlot.cycle != null ? runTargets?.[runSlot.cycle]?.[runSlot.slot] : null
    const isTraining = runSlot.weekType === 'training'
    return (
      <div>
        <PositionHeader computed={computed} label={`${RUN_TYPE_LABEL[runDeloadWeek ? 'easy' : runSlot.runType]} Run`} />
        <RunDay
          key={runSlot.date}
          slot={runSlot}
          macroId={macroId}
          refPaceS={refPaceS}
          targetKm={targetRaw ?? null}
          deloadWeek={runDeloadWeek}
          existing={runs.find((r) => r.date === runSlot.date)}
          // Pooled weekly signal feedback (training weeks only — testing/deload
          // weeks never feed the recommendation).
          weekSessions={isTraining ? sessions.filter((s) => s.cycle === runSlot.cycle && s.week === runSlot.week) : []}
          weekRuns={isTraining ? runs.filter((r) => r.cycle === runSlot.cycle && r.week === runSlot.week) : []}
          allRuns={runs}
          onSaveRun={onSaveRun}
          onSetRefPace={onSetRefPace}
        />
      </div>
    )
  }

  if (computed.weekType === 'testing') {
    if (computed.isSessionDay && computed.testRole === 'test' && computed.testLift) {
      // Full session structure computed off the C3 Hard anchor (exact, never rounded);
      // Set 4 is the open recording field. Result still saves to testing_results.
      return (
        <div>
          <PositionHeader computed={computed} label="Testing Week" />
          <TestingSessionView
            macroId={macroId}
            lift={computed.testLift}
            c3Hard={weights?.[3]?.[computed.testLift]?.hard ?? null}
            testedOn={todayISO()}
            results={testingResults}
            onSave={onSaveTestingResult}
            onDelete={onDeleteTestingResult}
            companion={sessions.find((s) => s.id === `${todayISO()}-${computed.testLift}-TEST`) ?? null}
            onSaveSession={onSaveSession}
            onDeleteSession={onDeleteSession}
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
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            End-of-macro deload{deloadExtended ? ' · extended' : ''}
          </div>
          <div style={{ fontSize: 13, color: C.off, lineHeight: 1.5 }}>
            Giant Block only at 50–60% of working loads, hard rep scheme. No volume, no carries. Keep skill days. This should
            feel easy — that's correct.
          </div>
        </Card>
        {onExtendDeload && <DeloadExtend extended={deloadExtended} onExtendDeload={onExtendDeload} />}
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
  const top = base != null ? (isDeload ? deloadTop(base, dayType) : base) : null
  const carryDefault = accessory?.[cycle]?.[`carry_${dayType}`] ?? ''
  const secondaryItem = SECONDARY_ITEM[dayType]
  const secondaryDefault = secondaryItem ? accessory?.[cycle]?.[secondaryItem] ?? '' : ''
  const pullupCell = dayType === 'dips' ? weights?.[cycle]?.pullup ?? null : null
  const sessionId = `${todayISO()}-${dayType}-${difficulty[0].toUpperCase()}`
  const existing = sessions.find((s) => s.id === sessionId)
  const currentWeekSessions = sessions.filter((s) => s.cycle === cycle && s.week === week)
  const currentWeekRuns = runs.filter((r) => r.cycle === cycle && r.week === week)

  // Reactive-deload recommendation (based on previous week's signals — lifts and
  // runs pooled).
  const prevWeekSessions = week > 1 ? sessions.filter((s) => s.cycle === cycle && s.week === week - 1) : []
  const prevWeekRuns = week > 1 ? runs.filter((r) => r.cycle === cycle && r.week === week - 1) : []
  const recommend = shouldRecommendDeload({
    prevWeekSessions,
    prevWeekRuns,
    priorRuns: runs,
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
        blank={() => buildBlankSession({ date: todayISO(), macroId, cycle, week, weekType: 'training', dayType, difficulty, baseTop: base, isDeload })}
        headerSlot={<PositionHeader computed={computed} viewDiff={viewDiff} setViewDiff={setViewDiff} />}
        dayType={dayType}
        difficulty={difficulty}
        top={top}
        hasWeight={hasWeight}
        isDeload={isDeload}
        carryLoad={carryDefault}
        secondaryLoad={secondaryDefault}
        pullupCell={pullupCell}
        currentWeekSessions={currentWeekSessions}
        currentWeekRuns={currentWeekRuns}
        allRuns={runs}
        stamp={{ macroId, cycle, week, weekType: 'training', dayType, difficulty, topReps: SCHEMES[difficulty].sets[3], topWeight: top, date: todayISO(), id: sessionId }}
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

interface RunDayProps {
  slot: RunSlot
  macroId: string
  refPaceS: number | null
  targetKm: number | null
  deloadWeek: boolean
  existing?: Run
  weekSessions?: Session[]
  weekRuns?: Run[]
  allRuns?: Run[]
  onSaveRun: (record: RunDraft) => Promise<Run>
  onSetRefPace?: (refPaceS: number | null) => Promise<void>
}

// The run-day editor: RunForm + save, no timer (duration is a logged field).
// The slot stamp (id/date/cycle/week/weekType/runType) is applied on every save
// so a draft can't drift from the computed schedule.
function RunDay({ slot, macroId, refPaceS, targetKm, deloadWeek, existing, weekSessions = [], weekRuns = [], allRuns = [], onSaveRun, onSetRefPace }: RunDayProps) {
  const [draft, setDraft] = useState<RunDraft>(() => existing || buildBlankRun(slot, macroId))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const setField = <K extends keyof RunDraft>(k: K, v: RunDraft[K]) => setDraft((p) => ({ ...p, [k]: v }) as RunDraft)

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      const blank = buildBlankRun(slot, macroId)
      await onSaveRun({ ...draft, id: blank.id, date: blank.date, cycle: blank.cycle, week: blank.week, weekType: blank.weekType, runType: blank.runType })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <RunForm slot={slot} refPaceS={refPaceS} targetKm={targetKm} deloadWeek={deloadWeek} draft={draft} setField={setField} />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 14, fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : existing ? 'Update run' : 'Log run'}
      </button>
      {err && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>
      )}
      {slot.runType === 'tt' && existing && onSetRefPace && <SetPaceChip run={existing} refPaceS={refPaceS} onSetRefPace={onSetRefPace} />}
      {slot.weekType === 'training' && <SignalBanner currentWeekSessions={weekSessions} weekRuns={weekRuns} allRuns={allRuns} runDraft={draft} />}
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
  carryLoad?: number | string | null
  secondaryLoad?: number | string | null
  pullupCell?: LiftWeights | null
  currentWeekSessions: Session[]
  currentWeekRuns?: Run[]
  allRuns?: Run[]
  stamp: Stamp
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onRunningChange?: (running: boolean) => void
  saving: boolean
  setSaving: (b: boolean) => void
  saved: boolean
  setSaved: (b: boolean) => void
}

function SessionEditor({ sessionId, existing, blank, headerSlot, dayType, difficulty, top, hasWeight, isDeload, carryLoad, secondaryLoad, pullupCell, currentWeekSessions, currentWeekRuns = [], allRuns = [], stamp, onSaveSession, onRunningChange, saving, setSaving, saved, setSaved }: SessionEditorProps) {
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

  // Manual duration edit (completed/auto-ended): recompute ended_at from
  // started_at. Takes SECONDS (DurationEdit parses min:sec text).
  function setDurationSec(s: number) {
    if (startedMs == null || s < 0) return
    setField('endedAt', new Date(startedMs + s * 1000).toISOString())
  }

  const autoEnded = (draft.notes || '').includes(AUTO_END_NOTE)

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

      <SessionForm dayType={dayType} difficulty={difficulty} top={top} hasWeight={hasWeight} isDeload={isDeload} draft={draft} setField={setField} locked={notStarted} carryLoad={carryLoad} secondaryLoad={secondaryLoad} pullupCell={pullupCell} />

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
      <SignalBanner currentWeekSessions={currentWeekSessions} weekRuns={currentWeekRuns} allRuns={allRuns} draft={draft} />

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

// Label lookup spans the lift + run signal sets (pooled week).
export function signalLabel(id: string): string | undefined {
  return (SIGNALS.find((x) => x.id === id) || RUN_SIGNALS.find((x) => x.id === id))?.label
}

const numOrNull = (v: number | string | null | undefined): number | null =>
  v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)

// Live fatigue-signal feedback for the current week (lifts + runs pooled),
// including the in-progress draft (session or run).
function SignalBanner({
  currentWeekSessions,
  weekRuns = [],
  allRuns = [],
  draft,
  runDraft,
}: {
  currentWeekSessions: Session[]
  weekRuns?: Run[]
  allRuns?: Run[]
  draft?: SessionDraft
  runDraft?: RunDraft
}) {
  // computeWeekSignals ignores the fields that differ between draft and Session.
  const mergedSessions = draft ? currentWeekSessions.filter((s) => s.id !== draft.id).concat(draft as Session) : currentWeekSessions
  const mergedRuns = runDraft
    ? weekRuns
        .filter((r) => r.id !== runDraft.id)
        .concat({ ...runDraft, distanceKm: numOrNull(runDraft.distanceKm), durationS: numOrNull(runDraft.durationS), avgHr: numOrNull(runDraft.avgHr) })
    : weekRuns
  const sig = computeWeekSignals(mergedSessions, mergedRuns, allRuns)
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
