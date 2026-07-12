import { useState, useRef, useEffect } from 'react'
import { C, cardStyle, HEADING, pillColor } from './theme'
import { Card } from './components'
import { SessionModal } from './SessionModal'
import { RunModal } from './RunModal'
import { enumerateMacro, parseLocalDate, isoLocal, mondayOf, todayISO } from '../engine/date-engine'
import { LIFT_SHORT, RUN_TYPE_LABEL } from '../engine/constants'
import { fmt } from '../engine/loading'
import { runSlotsForWeek, derivedPaceS, fmtPace } from '../engine/runs'
import type {
  MacroCell,
  Session,
  SessionDraft,
  WeightsByCycle,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  TestingResult,
  Run,
  RunDraft,
  RunSlot,
  RunTargetsByCycle,
} from '../engine/types'

function shortDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

type CellState = 'logged' | 'missed' | 'today' | 'upcoming' | 'break'
const STATE_COLOR: Record<CellState, string> = { logged: C.green, missed: C.red, today: C.gold, upcoming: C.muted, break: C.blue }

interface CalendarProps {
  startISO: string
  macroNumber: number
  macroId: string
  weights: WeightsByCycle
  accessory: AccessoryByCycle
  sessions: Session[]
  deloads: DeloadMap
  breakDays: BreakDayMap
  testingResults: TestingResult[]
  runs?: Run[]
  runTargets?: RunTargetsByCycle
  refPaceS?: number | null
  onToggleBreak: (iso: string, on: boolean) => void
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onDeleteSession: (id: string) => Promise<void>
  onSaveTestingResult: (r: TestingResult) => Promise<TestingResult>
  onDeleteTestingResult: (id: string) => void
  onSaveRun?: (record: RunDraft) => Promise<Run>
  onDeleteRun?: (id: string) => Promise<void>
  onSetRefPace?: (refPaceS: number | null) => Promise<void>
}

export function Calendar({ startISO, macroNumber, macroId, weights, accessory, sessions, deloads, breakDays, testingResults, runs = [], runTargets = {}, refPaceS = null, onToggleBreak, onSaveSession, onDeleteSession, onSaveTestingResult, onDeleteTestingResult, onSaveRun, onDeleteRun, onSetRefPace }: CalendarProps) {
  const rows = enumerateMacro(startISO, macroNumber)
  const todayStr = todayISO()
  const [modal, setModal] = useState<{ cell: MacroCell } | { runSlot: RunSlot } | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)

  const loggedOnDate: Record<string, Session> = {}
  sessions.forEach((s) => {
    loggedOnDate[s.date] = s
  })
  const runOnDate: Record<string, Run> = {}
  runs.forEach((r) => {
    runOnDate[r.date] = r
  })

  const currentWeekIndex = (() => {
    for (const row of rows) {
      const monday = parseLocalDate(row.cells[0].date)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const td = parseLocalDate(todayStr)
      if (td >= monday && td <= sunday) return row.weekIndex
    }
    return -1
  })()

  useEffect(() => {
    if (currentRowRef.current) currentRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  function cellState(cell: MacroCell): CellState {
    if (breakDays[cell.date]) return 'break'
    if (loggedOnDate[cell.date]) return 'logged'
    if (cell.date === todayStr) return 'today'
    if (cell.date < todayStr) return 'missed'
    return 'upcoming'
  }

  // Same state semantics for run cells — except OPTIONAL run days (testing
  // Tue/Thu, all of deload W15) never go red: deliberate rest isn't a miss.
  function runCellState(slot: RunSlot): CellState {
    if (breakDays[slot.date]) return 'break'
    if (runOnDate[slot.date]) return 'logged'
    if (slot.date === todayStr) return 'today'
    if (slot.date < todayStr) return slot.optional ? 'upcoming' : 'missed'
    return 'upcoming'
  }

  return (
    <div>
      <Card>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 4 }}>
          Macro {macroNumber} · 15 weeks from {shortDate(isoLocal(mondayOf(parseLocalDate(startISO))))}. Tap any session to log,
          edit, or mark a break.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {([
            ['logged', 'Logged'],
            ['missed', 'Missed'],
            ['today', 'Today'],
            ['upcoming', 'Upcoming'],
            ['break', 'Break'],
          ] as [CellState, string][]).map(([k, label]) => (
            <span key={k} style={{ fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: STATE_COLOR[k], display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </Card>

      {rows.map((row) => {
        const isTest = row.weekType === 'testing'
        const isDeload = row.weekType === 'deload'
        const rowLabel = isTest ? 'Testing' : isDeload ? 'Deload' : `C${row.meso} · W${row.week}`
        return (
          <div
            key={row.weekIndex}
            ref={row.weekIndex === currentWeekIndex ? currentRowRef : null}
            style={{ ...cardStyle, padding: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: HEADING, fontSize: 16, letterSpacing: '0.06em', color: isTest || isDeload ? C.gold : C.off }}>
                {rowLabel}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>wk {row.displayWeek}/15</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {row.cells.map((cell) => {
                const st = cellState(cell)
                const logged = loggedOnDate[cell.date]
                return (
                  <button
                    key={cell.date}
                    onClick={() => setModal({ cell })}
                    style={{
                      background: st === 'today' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${st === 'today' ? C.gold : 'rgba(255,255,255,0.08)'}`,
                      borderLeft: `3px solid ${STATE_COLOR[st]}`,
                      borderRadius: 2,
                      padding: '7px 8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: C.off,
                      fontFamily: 'inherit',
                      minHeight: 58,
                    }}
                  >
                    <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>{shortDate(cell.date)}</div>
                    {isTest ? (
                      cell.testRole === 'light' ? (
                        <div>
                          <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>Light</div>
                          <div style={{ fontSize: 9, color: C.muted }}>optional</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>Test</div>
                          <div style={{ fontSize: 9, color: C.muted }}>{cell.testLift ? LIFT_SHORT[cell.testLift] : ''}</div>
                        </div>
                      )
                    ) : isDeload ? (
                      <div style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>Deload</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: STATE_COLOR[st] === C.muted ? C.off : STATE_COLOR[st] }}>
                          {cell.dayType ? LIFT_SHORT[cell.dayType] : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: pillColor(cell.difficulty), textTransform: 'uppercase' }}>{cell.difficulty}</div>
                      </div>
                    )}
                    {logged && (
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                        {fmt(logged.topWeight)}
                        {logged.rpe ? ' ' + logged.rpe : ''}
                      </div>
                    )}
                    {st === 'break' && <div style={{ fontSize: 9, color: C.blue, marginTop: 2 }}>break</div>}
                  </button>
                )
              })}
            </div>

            {/* Giant Run row — Tue/Thu/Sat under the lift row (the week block grows
                vertically; cells stay 3-up so iPhone sizing matches the lift row). */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
              {runSlotsForWeek(startISO, macroNumber, row.weekIndex).map((slot) => {
                const st = runCellState(slot)
                const loggedRun = runOnDate[slot.date]
                const pace = loggedRun ? derivedPaceS(loggedRun.distanceKm, loggedRun.durationS) : null
                return (
                  <button
                    key={slot.date}
                    onClick={() => setModal({ runSlot: slot })}
                    style={{
                      background: st === 'today' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${st === 'today' ? C.gold : 'rgba(255,255,255,0.06)'}`,
                      borderLeft: `3px solid ${STATE_COLOR[st]}`,
                      borderRadius: 2,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: C.off,
                      fontFamily: 'inherit',
                      minHeight: 44,
                    }}
                  >
                    <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{shortDate(slot.date)}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: STATE_COLOR[st] === C.muted ? C.off : STATE_COLOR[st] }}>
                      {slot.runType === 'tt' ? '5k TT' : `${RUN_TYPE_LABEL[slot.runType]} run`}
                      {slot.optional && <span style={{ fontSize: 8.5, color: C.muted, fontWeight: 400 }}> · opt</span>}
                    </div>
                    {loggedRun && loggedRun.distanceKm != null && (
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                        {loggedRun.distanceKm} km{pace != null ? ` · ${fmtPace(pace)}/km` : ''}
                      </div>
                    )}
                    {st === 'break' && <div style={{ fontSize: 9, color: C.blue, marginTop: 2 }}>break</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {modal && 'cell' in modal && (
        <SessionModal
          cell={modal.cell}
          macroNumber={macroNumber}
          macroId={macroId}
          weights={weights}
          accessory={accessory}
          deloads={deloads}
          existing={loggedOnDate[modal.cell.date]}
          isBreak={!!breakDays[modal.cell.date]}
          onToggleBreak={onToggleBreak}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          testingResults={testingResults}
          onSaveTestingResult={onSaveTestingResult}
          onDeleteTestingResult={onDeleteTestingResult}
          onClose={() => setModal(null)}
        />
      )}

      {modal && 'runSlot' in modal && onSaveRun && onDeleteRun && (
        <RunModal
          slot={modal.runSlot}
          macroNumber={macroNumber}
          macroId={macroId}
          refPaceS={refPaceS}
          runTargets={runTargets}
          deloads={deloads}
          existing={runOnDate[modal.runSlot.date]}
          isBreak={!!breakDays[modal.runSlot.date]}
          onToggleBreak={onToggleBreak}
          onSaveRun={onSaveRun}
          onDeleteRun={onDeleteRun}
          onSetRefPace={onSetRefPace}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
