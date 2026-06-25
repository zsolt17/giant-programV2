import React, { useState, useRef, useEffect } from 'react'
import { C, cardStyle, HEADING, pillColor } from './theme.js'
import { Card } from './components.jsx'
import { SessionModal } from './SessionModal.jsx'
import { enumerateMacro, parseLocalDate, isoLocal, mondayOf, todayISO } from '../engine/date-engine'
import { LIFT_SHORT } from '../engine/constants'
import { fmt } from '../engine/loading'

function shortDate(iso) {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

const STATE_COLOR = { logged: C.green, missed: C.red, today: C.gold, upcoming: C.muted, break: C.blue }

export function Calendar({ startISO, macroNumber, macroId, weights, accessory, sessions, deloads, breakDays, testingResults, onToggleBreak, onSaveSession, onDeleteSession, onSaveTestingResult, onDeleteTestingResult }) {
  const rows = enumerateMacro(startISO, macroNumber)
  const todayStr = todayISO()
  const [modal, setModal] = useState(null)
  const currentRowRef = useRef(null)

  const loggedOnDate = {}
  sessions.forEach((s) => {
    loggedOnDate[s.date] = s
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

  function cellState(cell) {
    if (breakDays[cell.date]) return 'break'
    if (loggedOnDate[cell.date]) return 'logged'
    if (cell.date === todayStr) return 'today'
    if (cell.date < todayStr) return 'missed'
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
          {[
            ['logged', 'Logged'],
            ['missed', 'Missed'],
            ['today', 'Today'],
            ['upcoming', 'Upcoming'],
            ['break', 'Break'],
          ].map(([k, label]) => (
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
                          <div style={{ fontSize: 9, color: C.muted }}>{LIFT_SHORT[cell.testLift] || ''}</div>
                        </div>
                      )
                    ) : isDeload ? (
                      <div style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>Deload</div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: STATE_COLOR[st] === C.muted ? C.off : STATE_COLOR[st] }}>
                          {LIFT_SHORT[cell.dayType] || '—'}
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
          </div>
        )
      })}

      {modal && (
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
    </div>
  )
}
