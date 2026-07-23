import { Fragment, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { C as TH, HEADING, BODY } from './theme'
import { useFocusTrap } from './useFocusTrap'
import { toTrendSessions, toAccessoryTrend, toCarrySessions, toAttendance, toRunTrend, macroLabels } from '../engine/trends'
import { fmtPace } from '../engine/runs'
import { RUN_TYPE_LABEL } from '../engine/constants'
import type { TrendsData, TrendSession, TrendAccessory, TrendCarry, TrendDay, TrendRun, RunType, CarryType, AttMacro, AttStatus } from '../engine/types'

// Mockup palette remapped onto the navy/gold system (the mockup's amber ≈ our gold).
const C = {
  bg: TH.dark,
  card: '#212e47',
  inset: '#18222f',
  border: TH.border,
  line: 'rgba(255,255,255,0.06)',
  muted: 'rgba(255,255,255,0.20)',
  dim: TH.muted,
  label: TH.muted,
  text: TH.off,
  bright: TH.white,
  amber: TH.gold,
  amberDim: 'rgba(201,168,76,0.40)',
  slate: TH.blue,
  purple: '#b39ddb',
  green: TH.green,
  red: TH.red,
  onAmber: TH.dark,
}
const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const tick = { fill: C.dim, fontSize: 9, fontFamily: BODY }

const LIFT_COLORS: Record<string, string> = { DL: C.amber, OHP: C.slate, Squat: C.purple, Dips: C.green }
const CARRY_TYPES: CarryType[] = ['Farmer', 'Suitcase', 'Sandbag', 'Overhead']
const CARRY_COLORS: Record<CarryType, string> = { Farmer: C.amber, Suitcase: C.slate, Sandbag: C.purple, Overhead: C.green }
const STATUS_COLOR: Record<string, string> = { done: C.green, missed: C.red, deload: C.amber, holiday: C.slate, test: C.purple, upcoming: C.muted }
const SLOTS = ['Mon', 'Wed', 'Fri']
const ALL_LIFTS: TrendDay[] = ['DL', 'OHP', 'Squat', 'Dips']
const AUX_VIEWS = ['Lifts', 'Runs', 'Accessories', 'Carries', 'Session'] as const
type View = (typeof AUX_VIEWS)[number]
const ALL_RUN_TYPES: RunType[] = ['easy', 'quality', 'long', 'tt']
const RUN_COLORS: Record<RunType, string> = { easy: C.green, quality: C.amber, long: C.slate, tt: C.purple }

// ─── shared UI ───────────────────────────────────────────────────────────────
interface TipProps {
  active?: boolean
  // recharts hands back loosely-typed payload entries
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[]
  label?: string
}

function DarkTooltip({ active, payload, label, unit = '' }: TipProps & { unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: C.label, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.amber, display: 'flex', gap: 8 }}>
          <span style={{ color: C.dim }}>{p.name}</span>
          <span style={{ fontWeight: 600, ...num }}>
            {p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

function Card({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 16px', marginBottom: 16, ...style }}>{children}</div>
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: C.amber, textTransform: 'uppercase', marginBottom: 3 }}>{sub}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.bright, letterSpacing: '-0.01em' }}>{title}</div>
    </div>
  )
}

function StatPill({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: C.inset, borderRadius: 8, padding: '9px 10px', flex: 1, border: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: accent || C.bright, ...num }}>{value}</span>
      <span style={{ fontSize: 9, color: C.dim, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

function Btn({ children, onClick, active, color }: { children: ReactNode; onClick: () => void; active?: boolean; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '5px 11px', borderRadius: 20, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, background: active ? color || C.amber : 'rgba(255,255,255,0.07)', color: active ? C.onAmber : C.dim, letterSpacing: '0.04em' }}
    >
      {children}
    </button>
  )
}

// ─── macro range picker (bottom sheet) ───────────────────────────────────────
const GRID_SIZE = 9

function MacroRangePicker({ allMacros, rangeStart, rangeEnd, onRangeChange, onClose }: { allMacros: string[]; rangeStart: string; rangeEnd: string; onRangeChange: (s: string, e: string) => void; onClose: () => void }) {
  const sheetRef = useFocusTrapRef(onClose)
  const [page, setPage] = useState(0)
  const [pendingStart, setPendingStart] = useState<string | null>(rangeStart)
  const [pendingEnd, setPendingEnd] = useState<string | null>(rangeEnd)

  const totalPages = Math.ceil(allMacros.length / GRID_SIZE)
  const pageItems = allMacros.slice(page * GRID_SIZE, (page + 1) * GRID_SIZE)
  const startIdx = pendingStart ? allMacros.indexOf(pendingStart) : -1

  const handleChip = (m: string) => {
    const mi = allMacros.indexOf(m)
    if (pendingStart === null || pendingEnd !== null) {
      setPendingStart(m)
      setPendingEnd(null)
    } else if (mi >= startIdx) {
      setPendingEnd(m)
    } else {
      setPendingEnd(pendingStart)
      setPendingStart(m)
    }
  }

  const inRange = (m: string) => {
    const mi = allMacros.indexOf(m)
    const ei = pendingEnd ? allMacros.indexOf(pendingEnd) : startIdx
    return mi >= Math.min(startIdx, ei) && mi <= Math.max(startIdx, ei)
  }
  const isEdge = (m: string) => m === pendingStart || m === pendingEnd
  const apply = () => {
    onRangeChange(pendingStart || rangeStart, pendingEnd || pendingStart || rangeStart)
    onClose()
  }
  const rangeLabel = pendingEnd && pendingEnd !== pendingStart ? `${pendingStart} – ${pendingEnd}` : pendingStart || '—'

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, animation: 'gp-fade-in 0.15s ease' }} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select macro range"
        tabIndex={-1}
        style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 760, background: C.card, borderTop: `1px solid ${C.border}`, borderRadius: '16px 16px 0 0', zIndex: 61, padding: '0 0 calc(28px + env(safe-area-inset-bottom))', animation: 'gp-drawer-up 0.2s ease' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.muted }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 14px' }}>
          <div>
            <div style={{ fontSize: 9, color: C.amber, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Select range</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.bright, ...num }}>{rangeLabel}</div>
          </div>
          <button onClick={apply} style={{ background: C.amber, color: C.onAmber, border: 'none', borderRadius: 20, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Apply
          </button>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous macros" style={{ background: 'none', border: 'none', color: page === 0 ? C.muted : C.label, fontSize: 18, cursor: page === 0 ? 'default' : 'pointer', padding: '0 4px' }}>
              ‹
            </button>
            <span style={{ fontSize: 10, color: C.dim, ...num }}>
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} aria-label="More macros" style={{ background: 'none', border: 'none', color: page === totalPages - 1 ? C.muted : C.label, fontSize: 18, cursor: page === totalPages - 1 ? 'default' : 'pointer', padding: '0 4px' }}>
              ›
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '0 20px' }}>
          {pageItems.map((m) => {
            const edge = isEdge(m)
            const rng = inRange(m)
            const pending = pendingStart === m && !pendingEnd
            return (
              <button
                key={m}
                onClick={() => handleChip(m)}
                style={{ padding: '14px 0', borderRadius: 10, border: edge ? `2px solid ${C.amber}` : rng ? `2px solid ${C.amberDim}` : `2px solid ${C.border}`, background: edge ? C.amber : rng ? C.amberDim : pending ? 'rgba(201,168,76,0.14)' : C.inset, color: edge ? C.onAmber : rng ? C.amber : C.label, fontSize: 13, fontWeight: edge ? 800 : 600, cursor: 'pointer', letterSpacing: '0.04em', ...num }}
              >
                {m}
              </button>
            )
          })}
          {Array.from({ length: GRID_SIZE - pageItems.length }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10, color: C.dim }}>
          {!pendingStart ? 'Tap a macro to start' : !pendingEnd ? 'Tap another to set range end' : 'Tap Apply or adjust selection'}
        </div>
      </div>
    </>
  )
}

// useFocusTrap wants a RefObject; wrap it so the picker can pass a callback close.
function useFocusTrapRef(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useFocusTrap(ref, onClose)
  return ref
}

// ─── filter bar ──────────────────────────────────────────────────────────────
function FilterBar({ rangeStart, rangeEnd, cycle, lift, runType, view, onOpenPicker, onCycle, onLift, onRunType, onView }: { rangeStart: string; rangeEnd: string; cycle: string; lift: string; runType: string; view: View; onOpenPicker: () => void; onCycle: (c: string) => void; onLift: (l: string) => void; onRunType: (t: string) => void; onView: (v: View) => void }) {
  const isSingle = rangeStart === rangeEnd
  const rangeLabel = isSingle ? rangeStart : `${rangeStart} – ${rangeEnd}`
  const isLifts = view === 'Lifts'
  const rowLabel: CSSProperties = { fontSize: 9, color: C.dim, flexShrink: 0, width: 34, letterSpacing: '0.08em' }
  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={rowLabel}>MACRO</span>
        <button onClick={onOpenPicker} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.inset, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.amber, letterSpacing: '0.04em', ...num }}>{rangeLabel}</span>
          <span style={{ fontSize: 10, color: C.dim }}>tap to change ›</span>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={rowLabel}>VIEW</span>
        {AUX_VIEWS.map((v) => (
          <Btn key={v} active={view === v} onClick={() => onView(v)} color={v === 'Accessories' ? C.purple : v === 'Carries' || v === 'Runs' ? C.green : v === 'Session' ? C.slate : C.amber}>
            {v}
          </Btn>
        ))}
      </div>
      {isSingle && isLifts && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={rowLabel}>CYCLE</span>
          {['All', 'C1', 'C2', 'C3'].map((c) => (
            <Btn key={c} active={cycle === c} onClick={() => onCycle(c)}>
              {c}
            </Btn>
          ))}
        </div>
      )}
      {isLifts && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={rowLabel}>LIFT</span>
          {['All', ...ALL_LIFTS].map((l) => (
            <Btn key={l} active={lift === l} color={LIFT_COLORS[l]} onClick={() => onLift(l)}>
              {l}
            </Btn>
          ))}
        </div>
      )}
      {view === 'Runs' && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={rowLabel}>RUN</span>
          {['All', ...ALL_RUN_TYPES].map((t) => (
            <Btn key={t} active={runType === t} color={RUN_COLORS[t as RunType]} onClick={() => onRunType(t)}>
              {t === 'All' ? 'All' : t === 'tt' ? 'TT' : RUN_TYPE_LABEL[t as RunType]}
            </Btn>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Runs view chart ─────────────────────────────────────────────────────────
// Pace over time, one line per run type. The Y axis is REVERSED (up = faster)
// and ticks/tooltip render mm:ss — raw seconds never reach the eye.
function PaceTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: C.label, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.amber, display: 'flex', gap: 8 }}>
          <span style={{ color: C.dim }}>{p.name}</span>
          <span style={{ fontWeight: 600, ...num }}>{fmtPace(Number(p.value))}/km</span>
        </div>
      ))}
    </div>
  )
}

function RunsChart({ runs, runType }: { runs: TrendRun[]; runType: string }) {
  const types: RunType[] = runType === 'All' ? ALL_RUN_TYPES : [runType as RunType]
  // Trail runs are paced by terrain, not fitness — hidden by default so they
  // can't distort the trend; the chip overlays them as hollow markers.
  const [showTrail, setShowTrail] = useState(false)
  const shown = useMemo(
    () => runs.filter((r) => types.includes(r.type) && (showTrail || r.terrain !== 'trail')),
    [runs, runType, showTrail] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const trailCount = useMemo(() => runs.filter((r) => types.includes(r.type) && r.terrain === 'trail').length, [runs, runType]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => {
    const map: Record<string, Record<string, number | string | boolean>> = {}
    shown.forEach((r) => {
      const label = `${r.date.slice(8, 10)}.${r.date.slice(5, 7)}`
      if (!map[r.date]) map[r.date] = { label }
      map[r.date][RUN_TYPE_LABEL[r.type]] = Math.round(r.paceS)
      map[r.date][`${RUN_TYPE_LABEL[r.type]}~trail`] = r.terrain === 'trail'
    })
    return Object.keys(map)
      .sort()
      .map((k) => map[k])
  }, [shown])
  // Latest ROAD pace per type for the legend strip (trail never sets the number).
  const latestOf = (t: RunType) => {
    const of = shown.filter((r) => r.type === t && r.terrain !== 'trail')
    return of.length ? of[of.length - 1].paceS : null
  }
  // Hollow marker for trail points, solid for road.
  const dotFor = (t: RunType) =>
    function TerrainDot(props: { cx?: number; cy?: number; payload?: Record<string, unknown> }) {
      const { cx, cy, payload } = props
      if (cx == null || cy == null || payload?.[RUN_TYPE_LABEL[t]] == null) return <g />
      const trail = !!payload?.[`${RUN_TYPE_LABEL[t]}~trail`]
      return <circle cx={cx} cy={cy} r={trail ? 3.5 : 2.5} fill={trail ? 'transparent' : RUN_COLORS[t]} stroke={RUN_COLORS[t]} strokeWidth={trail ? 1.5 : 0} />
    }
  return (
    <Card>
      <SectionHeader sub="The Giant Run" title="Pace Over Time" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {types.map((t) => {
          const latest = latestOf(t)
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 3, background: RUN_COLORS[t], borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: C.label, ...num }}>
                {RUN_TYPE_LABEL[t]} {latest != null ? `${fmtPace(latest)}/km` : '—'}
              </span>
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto' }}>
          <Btn active={showTrail} onClick={() => setShowTrail((v) => !v)} color={C.green}>
            Trail runs{trailCount ? ` (${trailCount})` : ''}
          </Btn>
        </div>
      </div>
      {!byDate.length ? (
        <div style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>
          {trailCount ? 'Only trail runs so far — enable the Trail chip to see them.' : 'No runs with distance + duration logged yet.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={byDate} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis reversed tick={tick} axisLine={false} tickLine={false} width={38} domain={['dataMin - 15', 'dataMax + 15']} tickFormatter={(v: number) => fmtPace(v)} />
            <Tooltip content={<PaceTooltip />} />
            {types.map((t) => (
              <Line key={t} type="monotone" dataKey={RUN_TYPE_LABEL[t]} stroke={RUN_COLORS[t]} strokeWidth={2.5} dot={dotFor(t)} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <div style={{ fontSize: 10, color: C.dim, marginTop: 8, textAlign: 'right' }}>
        up = faster · road only by default{showTrail ? ' · hollow = trail (terrain-paced)' : ''}
      </div>
    </Card>
  )
}

// ─── Lifts view charts ───────────────────────────────────────────────────────
function WeightTrendChart({ sessions, lift }: { sessions: TrendSession[]; lift: string }) {
  const lifts = lift === 'All' ? ALL_LIFTS : [lift as TrendDay]
  const byWeek = useMemo(() => {
    const map: Record<string, Record<string, number | string | null>> = {}
    sessions.forEach((s) => {
      const key = `${s.macro}${s.cycle}${s.week}`
      if (!map[key]) map[key] = { label: `${s.cycle}${s.week}` }
      map[key][s.day] = s.weight
    })
    return Object.values(map)
  }, [sessions])
  if (!byWeek.length) return null
  const first = byWeek[0]
  const last = byWeek[byWeek.length - 1]
  return (
    <Card>
      <SectionHeader sub="Strength Progress" title="Hard Top Set — Weight" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {lifts.map((l) => {
          const f = first[l] as number | undefined
          const la = last[l] as number | undefined
          return (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 3, background: LIFT_COLORS[l], borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: C.label, ...num }}>
                {l} {la ?? '-'}kg
                {f != null && la != null && <span style={{ color: C.green, marginLeft: 4, fontSize: 10 }}>+{(la - f).toFixed(1)}</span>}
              </span>
            </div>
          )
        })}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={byWeek} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip unit="kg" />} />
          {lifts.map((l) => (
            <Line key={l} type="monotone" dataKey={l} stroke={LIFT_COLORS[l]} strokeWidth={2.5} dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

function RPEChart({ sessions, lift }: { sessions: TrendSession[]; lift: string }) {
  const lifts = lift === 'All' ? ALL_LIFTS : [lift as TrendDay]
  const byWeek = useMemo(() => {
    const map: Record<string, Record<string, number | string>> = {}
    sessions.forEach((s) => {
      if (s.rpe == null) return
      const key = `${s.macro}${s.cycle}${s.week}`
      if (!map[key]) map[key] = { label: `${s.cycle}${s.week}` }
      const cur = map[key][s.day] as number | undefined
      if (cur == null || s.rpe > cur) map[key][s.day] = s.rpe
    })
    return Object.values(map)
  }, [sessions])
  if (!byWeek.length) return null
  return (
    <Card>
      <SectionHeader sub="Effort Tracking" title="RPE Trend" />
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 12 }}>Flat weight + rising RPE = fatigue · Flat weight + falling RPE = adaptation</div>
      <ResponsiveContainer width="100%" height={175}>
        <LineChart data={byWeek} margin={{ top: 4, right: 14, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis domain={[6, 10]} ticks={[6, 7, 8, 9, 10]} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip />} />
          <ReferenceLine y={9.5} stroke={C.red} strokeDasharray="4 3" strokeWidth={1} label={{ value: 'S1', fill: C.red, fontSize: 9, position: 'insideTopRight' }} />
          <ReferenceLine y={8} stroke={C.line} strokeDasharray="2 2" strokeWidth={1} />
          {lifts.map((l) => (
            <Line key={l} type="monotone" dataKey={l} stroke={LIFT_COLORS[l]} strokeWidth={2} dot={{ r: 3, fill: LIFT_COLORS[l], stroke: C.card, strokeWidth: 1.5 }} connectNulls name={l} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

function BarSpeedChart({ sessions, lift }: { sessions: TrendSession[]; lift: string }) {
  const lifts = lift === 'All' ? ALL_LIFTS : [lift as TrendDay]
  const data = useMemo(() => {
    const map: Record<string, { label: string; fast: number; normal: number; slow: number; total: number }> = {}
    sessions
      .filter((s) => lifts.includes(s.day) && s.spd != null)
      .forEach((s) => {
        const key = `${s.macro}${s.cycle}`
        if (!map[key]) map[key] = { label: `${s.macro} ${s.cycle}`, fast: 0, normal: 0, slow: 0, total: 0 }
        if (s.spd === 2) map[key].fast++
        else if (s.spd === 1) map[key].normal++
        else map[key].slow++
        map[key].total++
      })
    return Object.values(map).map((d) => ({ label: d.label, fast: Math.round((d.fast / d.total) * 100), normal: Math.round((d.normal / d.total) * 100), slow: Math.round((d.slow / d.total) * 100) }))
  }, [sessions, lift]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data.length) return null
  return (
    <Card>
      <SectionHeader sub="Neuromuscular Quality" title="Bar Speed Distribution" />
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 14 }}>% of top sets per cycle · ↑ fast → normal ↓ slow</div>
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 52)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }} barSize={16}>
          <XAxis type="number" domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} unit="%" />
          <YAxis type="category" dataKey="label" tick={{ ...tick, fill: C.label, fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<DarkTooltip unit="%" />} />
          <Bar dataKey="fast" stackId="a" fill={C.green} name="↑ Fast" />
          <Bar dataKey="normal" stackId="a" fill={C.slate} name="→ Normal" />
          <Bar dataKey="slow" stackId="a" fill={C.red} name="↓ Slow" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 14, marginTop: 10, justifyContent: 'center' }}>
        {([['↑ Fast', C.green], ['→ Normal', C.slate], ['↓ Slow', C.red]] as [string, string][]).map(([l, col]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 10, color: C.dim }}>{l}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Accessories view ────────────────────────────────────────────────────────
// Recorded per-cycle weight for a single accessory (one-arm row / B-stance RDL),
// plotted oldest -> newest across (macro, cycle). One chart per accessory.
function AccessoryChart({ data, title, sub, color }: { data: TrendAccessory[]; title: string; sub: string; color: string }) {
  if (!data.length) return <Card style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>No {title} weights yet.</Card>
  const first = data[0]
  const latest = data[data.length - 1]
  const delta = +(latest.weight - first.weight).toFixed(1)
  return (
    <Card>
      <SectionHeader sub={sub} title={title} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <StatPill label="Current" value={`${latest.weight}kg`} accent={color} />
        <StatPill label="Start" value={`${first.weight}kg`} />
        <StatPill label="Change" value={delta > 0 ? `+${delta}` : `${delta}`} accent={delta > 0 ? C.green : delta < 0 ? C.red : C.label} />
        <StatPill label="Cycles" value={data.length} />
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip unit="kg" />} />
          <Line type="stepAfter" dataKey="weight" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color, stroke: C.card, strokeWidth: 1.5 }} name="Weight" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ─── Carries view ────────────────────────────────────────────────────────────
function CarryTooltip({ active, payload, col }: TipProps & { col?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { label?: string; weight?: number; distance?: number } | undefined
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 11 }}>
      <div style={{ color: C.label, marginBottom: 2 }}>{d?.label}</div>
      <div style={{ color: col, ...num }}>
        {d?.weight}kg · {d?.distance}m
      </div>
    </div>
  )
}

function CarriesChart({ carries, activeMacros, cycle }: { carries: TrendCarry[]; activeMacros: string[]; cycle: string }) {
  const byType = useMemo(() => {
    const map: Record<CarryType, { label: string; weight: number | null; distance: number | null }[]> = { Farmer: [], Suitcase: [], Sandbag: [], Overhead: [] }
    carries
      .filter((c) => activeMacros.includes(c.macro) && (cycle === 'All' || c.cycle === cycle))
      .forEach((c) => map[c.type].push({ label: `${c.macro}${c.cycle}${c.week}`, weight: c.weight, distance: c.distance }))
    return map
  }, [carries, activeMacros, cycle])

  const latest = useMemo(() => {
    const out: Record<CarryType, { weight: number | null; distance: number | null } | null> = { Farmer: null, Suitcase: null, Sandbag: null, Overhead: null }
    CARRY_TYPES.forEach((t) => {
      const arr = byType[t]
      out[t] = arr.length ? arr[arr.length - 1] : null
    })
    return out
  }, [byType])

  if (!CARRY_TYPES.some((t) => byType[t].length > 0)) return <Card style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>No carries logged yet.</Card>

  return (
    <Card>
      <SectionHeader sub="Carry Finishers" title="Load & Distance" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {CARRY_TYPES.map((t) => {
          const l = latest[t]
          const col = CARRY_COLORS[t]
          return (
            <div key={t} style={{ background: C.inset, border: `1px solid ${C.border}`, borderLeft: `3px solid ${col}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: col, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{t}</div>
              {l ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.bright, ...num }}>{l.weight != null ? `${l.weight}kg` : '—'}</span>
                  <span style={{ fontSize: 11, color: C.dim, ...num }}>{l.distance}m</span>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: C.dim }}>—</span>
              )}
            </div>
          )
        })}
      </div>

      {CARRY_TYPES.map((t) => {
        const tData = byType[t]
        if (!tData.length) return null
        const col = CARRY_COLORS[t]
        const ws = tData.map((d) => d.weight ?? 0)
        const ds = tData.map((d) => d.distance ?? 0)
        const maxW = Math.max(...ws)
        const minW = Math.min(...ws)
        const maxD = Math.max(...ds)
        return (
          <div key={t} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: col, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{t} carry</div>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={tData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
                <YAxis yAxisId="w" orientation="left" domain={[Math.max(0, minW - 5), maxW + 5]} tick={{ ...tick, fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="d" orientation="right" domain={[0, maxD + 10]} tick={{ ...tick, fontSize: 8 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CarryTooltip col={col} />} />
                <Line yAxisId="w" type="stepAfter" dataKey="weight" stroke={col} strokeWidth={2.5} dot={{ r: 3, fill: col, stroke: C.card, strokeWidth: 1.5 }} name="Weight (kg)" connectNulls />
                <Line yAxisId="d" type="monotone" dataKey="distance" stroke={col} strokeWidth={1.5} strokeDasharray="3 2" dot={false} opacity={0.5} name="Distance (m)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 2.5, background: col, borderRadius: 1 }} />
                <span style={{ fontSize: 9, color: C.dim }}>Weight kg (L)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 1.5, background: col, borderRadius: 1, opacity: 0.5 }} />
                <span style={{ fontSize: 9, color: C.dim }}>Distance m (R)</span>
              </div>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

// ─── Session view ────────────────────────────────────────────────────────────
function AttendanceCell({ status }: { status: AttStatus }) {
  if (!status || status === 'upcoming') return <div style={{ height: 28, borderRadius: 6, border: '1px solid transparent', background: status === 'upcoming' ? 'rgba(255,255,255,0.03)' : 'transparent' }} />
  const col = STATUS_COLOR[status] || C.muted
  return (
    <div style={{ height: 28, borderRadius: 6, background: `${col}22`, border: `1px solid ${col}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'done' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />}
      {status === 'test' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, boxShadow: `0 0 5px ${col}` }} />}
      {status === 'deload' && <div style={{ width: 8, height: 8, borderRadius: 2, background: col, transform: 'rotate(45deg)' }} />}
      {status === 'missed' && <span style={{ fontSize: 11, color: col, fontWeight: 700, lineHeight: 1 }}>×</span>}
      {status === 'holiday' && <span style={{ fontSize: 10, color: col }}>—</span>}
    </div>
  )
}

function AttendanceChart({ macros }: { macros: AttMacro[] }) {
  if (!macros.length) return null
  const colHeader = (
    <>
      <div />
      {SLOTS.map((d) => (
        <div key={d} style={{ fontSize: 9, color: C.dim, textAlign: 'center', paddingBottom: 3 }}>{d}</div>
      ))}
    </>
  )
  return (
    <Card>
      <SectionHeader sub="Attendance" title="Session Completion" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['done', 'Done'], ['deload', 'Deload'], ['test', 'Test'], ['holiday', 'Holiday'], ['missed', 'Missed']] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 9, height: 9, borderRadius: k === 'deload' ? 2 : '50%', background: STATUS_COLOR[k], transform: k === 'deload' ? 'rotate(45deg)' : 'none' }} />
            <span style={{ fontSize: 10, color: C.dim }}>{v}</span>
          </div>
        ))}
      </div>
      {macros.map((mac, mi) => (
        <div key={mac.macro}>
          <div style={{ fontSize: 10, color: C.amber, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{mac.macro}</div>
          {mac.cycles.map((cyc, ci) => (
            <div key={cyc.cycle} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{cyc.cycle}</span>
                <div style={{ display: 'flex', gap: 8, ...num }}>
                  <span style={{ fontSize: 10, color: STATUS_COLOR.done }}>{cyc.done}✓</span>
                  {cyc.deload > 0 && <span style={{ fontSize: 10, color: STATUS_COLOR.deload }}>{cyc.deload}◆</span>}
                  {cyc.missed > 0 && <span style={{ fontSize: 10, color: STATUS_COLOR.missed }}>{cyc.missed}×</span>}
                  {cyc.holiday > 0 && <span style={{ fontSize: 10, color: STATUS_COLOR.holiday }}>{cyc.holiday}—</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(3, 1fr)', gap: 4 }}>
                {ci === 0 && colHeader}
                {cyc.weeks.map((w) => (
                  <Fragment key={w.week}>
                    <div style={{ fontSize: 9, color: C.dim, display: 'flex', alignItems: 'center' }}>{w.week}</div>
                    {w.cells.map((c, i) => (
                      <AttendanceCell key={i} status={c} />
                    ))}
                  </Fragment>
                ))}
              </div>
              <div style={{ marginTop: 6, height: 4, background: C.muted, borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
                {cyc.done > 0 && <div style={{ flex: cyc.done, background: STATUS_COLOR.done }} />}
                {cyc.deload > 0 && <div style={{ flex: cyc.deload, background: STATUS_COLOR.deload }} />}
                {cyc.holiday > 0 && <div style={{ flex: cyc.holiday, background: STATUS_COLOR.holiday }} />}
                {cyc.missed > 0 && <div style={{ flex: cyc.missed, background: STATUS_COLOR.missed }} />}
              </div>
              <div style={{ fontSize: 9, color: C.dim, marginTop: 3, textAlign: 'right', ...num }}>
                {cyc.done + cyc.deload}/{cyc.total}
              </div>
            </div>
          ))}
          {mac.endRows.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 9, color: C.dim, letterSpacing: '0.08em' }}>TESTING · DELOAD</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(3, 1fr)', gap: 4 }}>
                {mac.endRows.map((r) => (
                  <Fragment key={r.row}>
                    <div style={{ fontSize: 9, color: r.row === 'W15' ? C.amber : STATUS_COLOR.test, display: 'flex', alignItems: 'center', fontWeight: r.row === 'W15' ? 600 : 400 }}>{r.row}</div>
                    {r.cells.map((c, i) => (
                      <AttendanceCell key={i} status={c} />
                    ))}
                  </Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 8, ...num }}>
                  {mac.epMissed > 0 && <span style={{ fontSize: 10, color: STATUS_COLOR.missed }}>{mac.epMissed}×</span>}
                  {mac.epHoliday > 0 && <span style={{ fontSize: 10, color: STATUS_COLOR.holiday }}>{mac.epHoliday}—</span>}
                </div>
                <span style={{ fontSize: 9, color: C.dim, ...num }}>
                  {mac.epDone}/{mac.epTotal}
                </span>
              </div>
            </div>
          )}
          {mi < macros.length - 1 && <div style={{ height: 1, background: C.border, margin: '16px 0' }} />}
        </div>
      ))}
    </Card>
  )
}

function DeloadChart({ sessions }: { sessions: TrendSession[] }) {
  const weeks = useMemo(() => {
    const map: Record<string, { label: string; S1: number; S7: number; S2: number; S3: number; S5: number }> = {}
    sessions.forEach((s) => {
      const key = `${s.macro}${s.cycle}${s.week}`
      if (!map[key]) map[key] = { label: `${s.cycle}${s.week}`, S1: 0, S7: 0, S2: 0, S3: 0, S5: 0 }
      map[key].S1 = Math.max(map[key].S1, s.S1)
      map[key].S7 = Math.max(map[key].S7, s.S7)
      map[key].S2 = Math.max(map[key].S2, s.S2)
      map[key].S3 = Math.max(map[key].S3, s.S3)
      map[key].S5 = Math.max(map[key].S5, s.S5)
    })
    return Object.values(map).map((w) => {
      const total = w.S1 + w.S7 + w.S2 + w.S3 + w.S5
      return { ...w, total, fired: total >= 3 }
    })
  }, [sessions])
  if (!weeks.length) return null
  return (
    <Card>
      <SectionHeader sub="Reactive Deload System" title="Signal Accumulation" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {([[C.green, '0 — clean'], [C.amber, '1–2 — watch'], [C.red, '3+ — fired']] as [string, string][]).map(([col, lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 10, color: C.dim }}>{lbl}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {weeks.map((d) => {
          const barCol = d.fired ? C.red : d.total >= 2 ? C.amber : d.total >= 1 ? C.slate : C.muted
          const lblCol = d.fired ? C.red : d.total >= 2 ? C.amber : d.total >= 1 ? C.slate : C.dim
          const flags = (['S1', 'S7', 'S2', 'S3', 'S5'] as const).filter((k) => d[k])
          return (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: C.dim, width: 48, textAlign: 'right', flexShrink: 0, ...num }}>{d.label}</span>
              <div style={{ flex: 1, height: 20, background: C.muted, borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${(d.total / 5) * 100}%`, height: '100%', background: barCol, borderRadius: 3, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                  {d.total > 0 && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{flags.join(' ')}</span>}
                </div>
                {d.fired && <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.red, fontWeight: 700 }}>DELOAD</span>}
              </div>
              <span style={{ fontSize: 11, color: lblCol, width: 12, ...num }}>{d.total}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function SessionTimeChart({ sessions }: { sessions: TrendSession[] }) {
  const data = useMemo(() => {
    const map: Record<string, { label: string; dur: number }> = {}
    sessions.forEach((s) => {
      if (s.dur == null) return
      const key = `${s.macro}${s.cycle}${s.week}${s.day}`
      if (!map[key]) map[key] = { label: `${s.cycle}${s.week} ${s.day}`, dur: s.dur }
    })
    return Object.values(map)
  }, [sessions])
  if (!data.length) return null
  const avg = Math.round(data.reduce((a, d) => a + d.dur, 0) / data.length)
  return (
    <Card>
      <SectionHeader sub="Training Density" title="Session Duration" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <StatPill label="Avg" value={`${avg}m`} accent={C.amber} />
        <StatPill label="Longest" value={`${Math.max(...data.map((d) => d.dur))}m`} />
        <StatPill label="Shortest" value={`${Math.min(...data.map((d) => d.dur))}m`} />
        <StatPill label="Sessions" value={data.length} />
      </div>
      <ResponsiveContainer width="100%" height={155}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip unit="min" />} />
          <ReferenceLine y={avg} stroke={C.amberDim} strokeDasharray="4 3" />
          <Line type="monotone" dataKey="dur" stroke={C.amber} strokeWidth={2} name="Duration" dot={{ r: 3, fill: C.amber, stroke: C.card, strokeWidth: 1.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

function CaloriesChart({ sessions }: { sessions: TrendSession[] }) {
  const data = useMemo(() => {
    const pts: { key: string; session: string; set: number; kcal: number }[] = []
    sessions.forEach((s) => {
      s.sets.forEach((kcal, i) => pts.push({ key: `${s.macro}${s.cycle}${s.week}${s.day}S${i + 1}`, session: `${s.cycle}${s.week} ${s.day}`, set: i + 1, kcal }))
    })
    return pts.map((p, i) => {
      const slice = pts.slice(Math.max(0, i - 4), i + 1)
      return { ...p, rolling: parseFloat((slice.reduce((a, x) => a + x.kcal, 0) / slice.length).toFixed(1)) }
    })
  }, [sessions])
  if (!data.length) return null
  const avg = (data.reduce((a, d) => a + d.kcal, 0) / data.length).toFixed(1)
  const best = Math.max(...data.map((d) => d.kcal))
  const trend = data.length > 1 ? (data[data.length - 1].rolling - data[0].rolling).toFixed(1) : '0'
  return (
    <Card>
      <SectionHeader sub="Giant Block · 30s Cardio" title="Calories per Round" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <StatPill label="Avg / round" value={avg} accent={C.amber} />
        <StatPill label="Best" value={best} />
        <StatPill label="Trend" value={Number(trend) > 0 ? `+${trend}` : trend} accent={Number(trend) > 0 ? C.green : Number(trend) < 0 ? C.red : C.label} />
        <StatPill label="Rounds" value={data.length} />
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
          <XAxis dataKey="key" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={<CalTooltip />} />
          <ReferenceLine y={parseFloat(avg)} stroke={C.amberDim} strokeDasharray="4 3" />
          <Line type="monotone" dataKey="kcal" stroke={C.muted} strokeWidth={1} dot={{ r: 2, fill: C.dim, stroke: 'none' }} name="Round" />
          <Line type="monotone" dataKey="rolling" stroke={C.amber} strokeWidth={2.5} dot={false} name="5-round avg" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: C.dim }}>● Raw rounds</span>
        <span style={{ fontSize: 10, color: C.amber }}>─── 5-round avg</span>
      </div>
    </Card>
  )
}

function CalTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { session?: string; set?: number; kcal?: number; rolling?: number } | undefined
  return (
    <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ color: C.label, marginBottom: 3 }}>
        {d?.session} · Round {d?.set}
      </div>
      <div style={{ color: C.amber, ...num }}>{d?.kcal} kcal</div>
      <div style={{ color: C.dim, ...num }}>5-round avg: {d?.rolling}</div>
    </div>
  )
}

// ─── main ────────────────────────────────────────────────────────────────────
export function Trends({ data }: { data: TrendsData }) {
  const allSessions = useMemo(() => toTrendSessions(data.sessions, data.macros, data.deloads), [data])
  const allRow = useMemo(() => toAccessoryTrend(data.macros, data.accessory, 'row_ohp'), [data])
  const allRdl = useMemo(() => toAccessoryTrend(data.macros, data.accessory, 'rdl_squat'), [data])
  const allLunge = useMemo(() => toAccessoryTrend(data.macros, data.accessory, 'lunge_deadlift'), [data])
  const allCarries = useMemo(() => toCarrySessions(data.sessions, data.macros, data.accessory), [data])
  const allAttendance = useMemo(() => toAttendance(data.macros, data.sessions, data.deloads, data.breakDays), [data])
  const allRunTrend = useMemo(() => toRunTrend(data.runs || [], data.macros), [data])
  const ALL_MACROS = useMemo(() => macroLabels(data.macros), [data.macros])
  const latest = ALL_MACROS[ALL_MACROS.length - 1] || ''

  const [rangeStart, setRangeStart] = useState(latest)
  const [rangeEnd, setRangeEnd] = useState(latest)
  const [cycle, setCycle] = useState('All')
  const [lift, setLift] = useState('All')
  const [runType, setRunType] = useState('All')
  const [view, setView] = useState<View>('Lifts')
  const [pickerOpen, setPickerOpen] = useState(false)

  const activeMacros = useMemo(() => {
    const si = ALL_MACROS.indexOf(rangeStart)
    const ei = ALL_MACROS.indexOf(rangeEnd)
    if (si < 0 || ei < 0) return ALL_MACROS
    return ALL_MACROS.slice(Math.min(si, ei), Math.max(si, ei) + 1)
  }, [ALL_MACROS, rangeStart, rangeEnd])

  const filtered = useMemo(() => allSessions.filter((s) => activeMacros.includes(s.macro) && (cycle === 'All' || s.cycle === cycle)), [allSessions, activeMacros, cycle])

  const handleRange = (s: string, e: string) => {
    setRangeStart(s)
    setRangeEnd(e)
    setCycle('All')
  }
  const handleView = (v: View) => {
    setView(v)
    if (v !== 'Lifts') setLift('All')
    if (v !== 'Runs') setRunType('All')
    setCycle('All')
  }

  const isSingle = rangeStart === rangeEnd
  const rangeLabel = isSingle ? rangeStart : `${rangeStart} – ${rangeEnd}`
  const subtitle = `${rangeLabel}${view !== 'Lifts' ? ' · ' + view : ''}${lift !== 'All' ? ' · ' + lift : ''}`

  if (!ALL_MACROS.length) return <Card style={{ textAlign: 'center', color: C.dim, padding: 40 }}>No training data yet.</Card>

  return (
    <div style={{ color: C.text, margin: '-14px -2px 0' }}>
      <div style={{ position: 'sticky', top: 0, background: C.bg, zIndex: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ padding: '6px 16px 10px' }}>
          <div style={{ fontSize: 10, color: C.amber, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>The Giant Program · {subtitle}</div>
          <div style={{ fontFamily: HEADING, fontSize: 30, letterSpacing: '0.04em', color: C.bright, lineHeight: 1 }}>TRENDS</div>
        </div>
        <FilterBar rangeStart={rangeStart} rangeEnd={rangeEnd} cycle={cycle} lift={lift} runType={runType} view={view} onOpenPicker={() => setPickerOpen(true)} onCycle={setCycle} onLift={setLift} onRunType={setRunType} onView={handleView} />
      </div>

      <div>
        {view === 'Lifts' &&
          (filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.dim, padding: '60px 0', fontSize: 13 }}>No sessions match this filter.</div>
          ) : (
            <>
              <WeightTrendChart sessions={filtered} lift={lift} />
              <RPEChart sessions={filtered} lift={lift} />
              <BarSpeedChart sessions={filtered} lift={lift} />
            </>
          ))}
        {view === 'Runs' && <RunsChart runs={allRunTrend.filter((r) => activeMacros.includes(r.macro))} runType={runType} />}
        {view === 'Accessories' && (
          <>
            <AccessoryChart data={allRow.filter((a) => activeMacros.includes(a.macro))} title="One-Arm DB Row" sub="OHP-day secondary · per cycle" color={C.slate} />
            <AccessoryChart data={allRdl.filter((a) => activeMacros.includes(a.macro))} title="B-Stance DB RDL" sub="Squat-day secondary · per cycle" color={C.amber} />
            <AccessoryChart data={allLunge.filter((a) => activeMacros.includes(a.macro))} title="Reverse Lunge" sub="DL-day secondary · per cycle" color={C.purple} />
          </>
        )}
        {view === 'Carries' && <CarriesChart carries={allCarries} activeMacros={activeMacros} cycle={cycle} />}
        {view === 'Session' && (
          <>
            <AttendanceChart macros={allAttendance.filter((m) => activeMacros.includes(m.macro))} />
            <DeloadChart sessions={filtered} />
            <SessionTimeChart sessions={filtered} />
            <CaloriesChart sessions={filtered} />
          </>
        )}
      </div>

      {pickerOpen && <MacroRangePicker allMacros={ALL_MACROS} rangeStart={rangeStart} rangeEnd={rangeEnd} onRangeChange={handleRange} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
