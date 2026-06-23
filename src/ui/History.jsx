import React, { useState } from 'react'
import { C } from './theme.js'
import { Card } from './components.jsx'
import { blockTitle, Row, speedArrow } from './controls.jsx'
import { pillColor } from './theme.js'
import { LIFT_LABEL, PULLUP } from '../engine/constants.js'
import { fmt } from '../engine/loading.js'
import { clusterTotal, isUnbroken } from '../engine/pullups.js'

const LIFTS = ['deadlift', 'ohp', 'squat', 'dips']
const DIFFS = ['hard', 'medium', 'light']

export function History({ sessions, testingResults = [], macroNumber, onDeleteSession }) {
  const [confirmId, setConfirmId] = useState(null)

  if (!sessions.length && !testingResults.length)
    return <Card style={{ textAlign: 'center', color: C.muted, padding: 40 }}>No sessions logged yet.</Card>

  // Latest logged top set per lift × difficulty.
  const latest = {}
  sessions
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((s) => {
      if (!s.dayType) return
      latest[s.dayType] = latest[s.dayType] || {}
      if (s.rpe || s.topWeight) latest[s.dayType][s.difficulty] = { w: s.topWeight }
    })

  return (
    <div>
      <Card>
        {blockTitle('Working Top Sets', 'latest logged')}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 4, fontSize: 12 }}>
          <span />
          <span style={{ color: C.red, textAlign: 'center', fontWeight: 600 }}>H</span>
          <span style={{ color: C.gold, textAlign: 'center', fontWeight: 600 }}>M</span>
          <span style={{ color: C.green, textAlign: 'center', fontWeight: 600 }}>L</span>
          {LIFTS.map((lift) => (
            <React.Fragment key={lift}>
              <span style={{ color: C.off }}>{LIFT_LABEL[lift]}</span>
              {DIFFS.map((d) => (
                <span key={d} style={{ textAlign: 'center', color: C.off, fontVariantNumeric: 'tabular-nums' }}>
                  {latest[lift]?.[d] ? latest[lift][d].w : '—'}
                </span>
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {testingResults.length > 0 && (
        <Card>
          {blockTitle('Testing Results', 'recorded 2–3RM')}
          {['deadlift', 'squat', 'ohp', 'dips']
            .map((lift) => testingResults.find((r) => r.lift === lift))
            .filter(Boolean)
            .map((r) => (
              <Row key={r.id} a={LIFT_LABEL[r.lift]} b={r.testedOn || ''} c={`${r.weight != null ? r.weight + ' kg' : '—'} × ${r.reps ?? '—'}`} />
            ))}
        </Card>
      )}

      <PullupTrend sessions={sessions} />

      <Card>
        {blockTitle('Recent Sessions', `${sessions.length} logged`)}
        {sessions.slice(0, 50).map((s) => (
          <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
                {LIFT_LABEL[s.dayType] || s.weekType}{' '}
                {s.difficulty && <span style={{ color: pillColor(s.difficulty), fontSize: 11 }}>{s.difficulty.toUpperCase()}</span>}
              </span>
              <span style={{ fontSize: 11, color: C.muted }}>
                {s.date} · M{macroNumber}
                {s.cycle ? `C${s.cycle}` : ''}
                {s.week ? `W${s.week}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Top {fmt(s.topWeight)} × {s.topReps} {s.rpe && `| ${s.rpe}`} {s.barSpeed && `| ${speedArrow(s.barSpeed)}`}
              {s.carrySkipped && ' · carry skipped'}
              {s.volDone === false && ' · volume incomplete'}
            </div>
            {s.notes && <div style={{ fontSize: 12, color: C.off, marginTop: 3, fontStyle: 'italic' }}>{s.notes}</div>}
            <div style={{ marginTop: 6 }}>
              {confirmId === s.id ? (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.red }}>Delete?</span>
                  <button
                    onClick={() => {
                      onDeleteSession(s.id)
                      setConfirmId(null)
                    }}
                    style={{ background: C.red, color: C.dark, border: 'none', borderRadius: 2, fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}
                  >
                    Yes
                  </button>
                  <button onClick={() => setConfirmId(null)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmId(s.id)} style={{ background: 'transparent', color: C.muted, border: 'none', fontSize: 11, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

// Phase-1 pull-up cluster trend (OHP-day final-round clusters, oldest -> newest).
function PullupTrend({ sessions }) {
  const items = sessions
    .filter((s) => s.dayType === 'ohp' && s.pullupCluster)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!items.length) return null
  return (
    <Card>
      {blockTitle('Pull-up Cluster Trend', 'OHP day · toward unbroken')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {items.map((s, i) => {
          const total = clusterTotal(s.pullupCluster)
          const unbroken = isUnbroken(s.pullupCluster)
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span style={{ color: C.muted }}>→</span>}
              <span
                title={`${s.date} · ${s.difficulty} (target ${PULLUP[s.difficulty]})`}
                style={{
                  border: `1px solid ${unbroken ? C.green : C.border}`,
                  borderRadius: 2,
                  padding: '4px 8px',
                  fontSize: 13,
                  color: unbroken ? C.green : C.off,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.pullupCluster}
                <span style={{ color: C.muted, fontSize: 11 }}> ={total}</span>
              </span>
            </React.Fragment>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Targets per round: Hard {PULLUP.hard} · Medium {PULLUP.medium} · Light {PULLUP.light}. Consolidate from the front —
        a bigger first cluster each session — until the round is unbroken, then switch to weighted (a later update).
      </div>
    </Card>
  )
}
