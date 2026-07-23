import { Fragment, useState } from 'react'
import { C, pillColor } from './theme'
import { Card } from './components'
import { blockTitle, Row, speedArrow } from './controls'
import { LIFT_LABEL, PULLUP, DAY_META } from '../engine/constants'
import { fmt } from '../engine/loading'
import { clusterTotal, isUnbroken } from '../engine/pullups'
import type { Session, TestingResult, Lift, Difficulty } from '../engine/types'

// GiantFit lifts first; dips kept so legacy Giant top sets stay visible.
const LIFTS: Lift[] = ['deadlift', 'ohp', 'squat', 'bench', 'dips']
const DIFFS: Difficulty[] = ['hard', 'medium', 'light']

// Compact ` · …` suffixes for the recent-sessions feed line (empty = nothing logged).
function cardioSuffix(cals: (number | null)[]): string {
  if (!cals || !cals.some((c) => c != null)) return ''
  const str = cals.map((c) => (c == null ? '–' : c)).join('/')
  const total = cals.reduce<number>((a, c) => a + (c ?? 0), 0)
  return ` · cardio ${str} = ${total}`
}
function carrySuffix(s: Session): string {
  if (s.carrySkipped) return '' // 'carry skipped' is shown separately
  const r = s.carryRounds
  const d = s.carryDistance
  if (r == null && d == null) return ''
  if (r != null && d != null) return ` · carry ${r} × ${d} m`
  if (d != null) return ` · carry ${d} m`
  return ` · carry ${r} rds`
}
interface HistoryProps {
  sessions: Session[]
  testingResults?: TestingResult[]
  macroNumber: number
  onDeleteSession: (id: string) => void
}

export function History({ sessions, testingResults = [], macroNumber, onDeleteSession }: HistoryProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!sessions.length && !testingResults.length)
    return <Card style={{ textAlign: 'center', color: C.muted, padding: 40 }}>No sessions logged yet.</Card>

  // Latest logged top set per lift × difficulty.
  const latest: Record<string, Record<string, { w: number | null }>> = {}
  sessions
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((s) => {
      if (!s.dayType || !s.difficulty) return
      const byDiff = latest[s.dayType] || (latest[s.dayType] = {})
      if (s.rpe || s.topWeight) byDiff[s.difficulty] = { w: s.topWeight }
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
            <Fragment key={lift}>
              <span style={{ color: C.off }}>{LIFT_LABEL[lift]}</span>
              {DIFFS.map((d) => (
                <span key={d} style={{ textAlign: 'center', color: C.off, fontVariantNumeric: 'tabular-nums' }}>
                  {latest[lift]?.[d] ? latest[lift]![d].w : '—'}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </Card>

      {testingResults.length > 0 && (
        <Card>
          {blockTitle('Testing Results', 'recorded 2–3RM')}
          {['deadlift', 'squat', 'ohp', 'dips']
            .map((lift) => testingResults.find((r) => r.lift === lift))
            .filter((r): r is TestingResult => Boolean(r))
            .map((r) => (
              <Row key={r.id} a={LIFT_LABEL[r.lift as Lift]} b={r.testedOn || ''} c={`${r.weight != null ? r.weight + ' kg' : '—'} × ${r.reps ?? '—'}`} />
            ))}
        </Card>
      )}

      <ClusterTrend sessions={sessions} field="pullupCluster" title="Pull-up Cluster Trend" />
      <ClusterTrend sessions={sessions} field="dipsCluster" title="Dips Cluster Trend" />
      <CarryDistanceTrend sessions={sessions} />

      <Card>
        {blockTitle('Recent Sessions', `${sessions.length} logged`)}
        {sessions.slice(0, 50).map((s) => (
          <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
                {s.dayType ? LIFT_LABEL[s.dayType] : s.weekType}{' '}
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
              {cardioSuffix(s.cardioCals)}
              {carrySuffix(s)}
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

// Carry distance per round over time — grouped by day type, because the carry
// implement differs per day (farmer/suitcase/sandbag/overhead), so distances
// across days aren't comparable. Serves the "distance before weight" rule.
function CarryDistanceTrend({ sessions }: { sessions: Session[] }) {
  const withDist = sessions.filter((s) => s.dayType && !s.carrySkipped && s.carryDistance != null)
  if (!withDist.length) return null
  const days = LIFTS.filter((lift) => withDist.some((s) => s.dayType === lift))
  return (
    <Card>
      {blockTitle('Carry Distance', 'distance before weight')}
      {days.map((lift) => {
        const items = withDist.filter((s) => s.dayType === lift).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
        return (
          <div key={lift} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
              {LIFT_LABEL[lift]} · {DAY_META[lift].carry.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {items.map((s, i) => (
                <Fragment key={s.id}>
                  {i > 0 && <span style={{ color: C.muted }}>→</span>}
                  <span
                    title={`${s.date}${s.carryRounds != null ? ` · ${s.carryRounds} rounds` : ''}`}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 2, padding: '4px 8px', fontSize: 13, color: C.off, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.carryDistance} m
                    {s.carryRounds != null && <span style={{ color: C.muted, fontSize: 11 }}> ×{s.carryRounds}</span>}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Progress distance per round first (per carry implement); add load only once the distance target holds.
      </div>
    </Card>
  )
}

// Bodyweight-mode cluster trend (dips-day final-round clusters, oldest -> newest).
// Shared by pull-ups and dips — each logs its own cluster field while its anchor is 0.
function ClusterTrend({ sessions, field, title }: { sessions: Session[]; field: 'pullupCluster' | 'dipsCluster'; title: string }) {
  const items = sessions
    .filter((s) => s.dayType === 'dips' && s[field])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!items.length) return null
  return (
    <Card>
      {blockTitle(title, 'Dips day · toward unbroken')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {items.map((s, i) => {
          const total = clusterTotal(s[field])
          const unbroken = isUnbroken(s[field])
          return (
            <Fragment key={s.id}>
              {i > 0 && <span style={{ color: C.muted }}>→</span>}
              <span
                title={`${s.date} · ${s.difficulty} (target ${PULLUP[s.difficulty as Difficulty]})`}
                style={{
                  border: `1px solid ${unbroken ? C.green : C.border}`,
                  borderRadius: 2,
                  padding: '4px 8px',
                  fontSize: 13,
                  color: unbroken ? C.green : C.off,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s[field]}
                <span style={{ color: C.muted, fontSize: 11 }}> ={total}</span>
              </span>
            </Fragment>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Targets per round: Hard {PULLUP.hard} · Medium {PULLUP.medium} · Light {PULLUP.light}. Consolidate from the front —
        a bigger first cluster each session — until the round is unbroken, then set a weight in Setup to go weighted.
      </div>
    </Card>
  )
}
