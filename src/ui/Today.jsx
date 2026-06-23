import React, { useState, useEffect } from 'react'
import { C, cardStyle, HEADING, pillColor } from './theme.js'
import { Card } from './components.jsx'
import { PositionHeader } from './controls.jsx'
import { SessionForm, buildBlankSession } from './SessionForm.jsx'
import { TestingResultForm } from './TestingResultForm.jsx'
import { ROTATION, SCHEMES, LIFT_LABEL, SIGNALS } from '../engine/constants.js'
import { deloadTop } from '../engine/loading.js'
import { todayISO, mondayOf, parseLocalDate, isoLocal } from '../engine/date-engine.js'
import { computeWeekSignals, shouldRecommendDeload, usedDeloadThisMeso, weekKeyFor } from '../engine/deload-rule.js'

// Is any break day inside the program week containing weekIndex?
function breakInWeek(startISO, weekIndex, breakDays) {
  const monday = mondayOf(parseLocalDate(startISO))
  monday.setDate(monday.getDate() + weekIndex * 7)
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    if (breakDays[isoLocal(d)]) return true
  }
  return false
}

export function Today({ computed, macroId, weights, accessory, sessions, deloads, breakDays = {}, testingResults = [], onSaveSession, onApplyDeload, onSaveTestingResult, onDeleteTestingResult }) {
  const [viewDiff, setViewDiff] = useState(null)
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
              Next: {LIFT_LABEL[ns.dayType]} <span style={{ color: pillColor(ns.difficulty) }}>· {ns.difficulty.toUpperCase()}</span> ({ns.date})
            </div>
          )}
        </Card>
      </div>
    )
  }

  // --- normal training session ---------------------------------------------
  const difficulty = viewDiff || computed.difficulty
  const cycle = computed.meso
  const week = computed.week
  const macro = computed.macro
  const dayType = ROTATION[week - 1][difficulty]
  const base = weights?.[cycle]?.[dayType]?.[difficulty]
  const hasWeight = base != null
  const weekKey = weekKeyFor(macro, cycle, week)
  const isDeload = !!deloads[weekKey]
  const top = hasWeight ? (isDeload ? deloadTop(base) : base) : null
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
    breakComing: breakInWeek(computed.startISO, computed.weekIndex, breakDays),
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

function SessionEditor({ sessionId, existing, blank, headerSlot, dayType, difficulty, top, hasWeight, isDeload, currentWeekSessions, stamp, onSaveSession, saving, setSaving, saved, setSaved }) {
  const [draft, setDraft] = useState(() => existing || blank())
  useEffect(() => {
    setDraft(existing || blank())
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }))

  async function handleSave() {
    setSaving(true)
    const record = { ...draft, ...stamp }
    await onSaveSession(record)
    setDraft(record)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div>
      {headerSlot}
      <SessionForm dayType={dayType} difficulty={difficulty} top={top} hasWeight={hasWeight} isDeload={isDeload} draft={draft} setField={setField} />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 14, fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : existing ? 'Update session' : 'Save session'}
      </button>
      <SignalBanner currentWeekSessions={currentWeekSessions} draft={draft} />
    </div>
  )
}

// Live fatigue-signal feedback for the current week, including the draft.
function SignalBanner({ currentWeekSessions, draft }) {
  const merged = currentWeekSessions.filter((s) => s.id !== draft.id).concat(draft)
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
