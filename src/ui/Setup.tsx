import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import { C, cardStyle, inp, lbl, pillColor } from './theme'
import { Card, BlockTitle } from './components'
import * as repo from '../data/repository'
import { computePosition, totalWeeksOf, parseLocalDate, mondayOf, isoLocal } from '../engine/date-engine'
import { SET_LADDER, VOLUME_PCT, PACE_ROUND_S, ANCHOR_LIFTS, ANCHOR_LABEL, ANCHOR_NOTE, GIANTFIT_ACC_ITEMS, GIANTFIT_CARRY_DEFAULTS, GIANTFIT_GB_ACCESSORY, GIANTFIT_GB_DEFAULT_REPS, LIFT_SHORT, GIANT2_GIANT_DEFAULT_ROTATION } from '../engine/constants'
import { expandDayTops, giantSets, volumeWeight } from '../engine/loading'
import { CAPACITY_MOVEMENTS, CAPACITY_VARIANTS, CAPACITY_ROUNDS_OPTIONS } from '../engine/capacity'
import { runMode, easyPace, qualityRange, fmtPace, parseClock } from '../engine/runs'
import { LOAD_TYPES, COUNT_TYPES, LOAD_TYPE_LABEL, COUNT_TYPE_LABEL, formatCount, slugify } from '../engine/movements'
import type { Movement, LoadType, CountType } from '../engine/movements'
import { errMsg } from './controls'
import type { Macro, WeightsByCycle, AccessoryByCycle, RunTargetsByCycle, RunSlotKey, CapacityConfig, CapacityVariant, Difficulty, GiantAccessoryReps, Lift, Giant2DifficultyConfig } from '../engine/types'

// Anchor rows in the weights card: the GiantFit anchors (DL/OHP/Squat/Bench +
// DB Row / Pendlay Row — the rows cascade identically off their own anchor).
// Legacy dips/pull-up anchors are read-only history — never shown or written here.
const ANCHORS = ANCHOR_LIFTS
const DIFFS: Difficulty[] = ['hard', 'medium', 'light']
const CYCLES: number[] = [1, 2, 3]
// GiantFit accessories = the four per-day carries (DL Farmers · OHP Overhead ·
// Squat Bearhug · Bench Suitcase). Paired rows are logged per session (free
// weight entry) — no recorded secondary weights anymore. Legacy items
// (lunge/RDL/row, carry_dips) stay in the DB for pre-cutover history but are
// no longer shown or written here.
const ACC_LABEL: Record<string, string> = {
  carry_deadlift: "Farmer's Carry — DL day",
  carry_ohp: 'Overhead Carry — OHP day',
  carry_squat: 'Bearhug Carry — Squat day',
  carry_bench: 'Suitcase Carry — Bench day',
}
const ACC_ITEMS = GIANTFIT_ACC_ITEMS

// Giant Block accessory rows render in day order (DL/OHP/Squat/Bench).
const GB_ACC_DAYS: Lift[] = ['deadlift', 'ohp', 'squat', 'bench']

// Giant 2.0 weekly Giant-difficulty rotation grid — Mon/Tue/Thu/Fri day order.
const GIANT2_ROTATION_DAYS: Lift[] = ['squat', 'bench', 'deadlift', 'ohp']
const GIANT2_ROTATION_WEEKS: number[] = [1, 2, 3]

// Giant Run distance-target slots (guidance only, per cycle, seeded like SEED_ITEMS).
const RUN_SLOTS: RunSlotKey[] = ['easy', 'quality', 'long']
const RUN_SLOT_LABEL: Record<RunSlotKey, string> = {
  easy: 'Tue — Easy run',
  quality: 'Thu — Quality run',
  long: 'Sat — Long easy run',
}

// Native <input type="date"> on iOS keeps an intrinsic width and overflows its
// container; -webkit-appearance:none strips that so it respects width:100%.
const DATE_INPUT: CSSProperties = { ...inp, WebkitAppearance: 'none', appearance: 'none', display: 'block' }

// Editable Setup-form shapes: every cell holds a string (or number) until saved.
type WeightCell = { hard: number | string; medium: number | string; light: number | string }
type EditWeights = Record<number, Record<string, WeightCell>>
type EditAcc = Record<number, Record<string, number | string>>
type EditRunTargets = Record<number, Record<RunSlotKey, number | string>>
type EditCapacity = Record<CapacityVariant, Record<string, { reps: number | string; weight: number | string }>>

// Build editable state: every cycle/anchor-lift present, blank if unset.
function initWeights(loaded?: WeightsByCycle): EditWeights {
  const w: EditWeights = {}
  for (const c of CYCLES) {
    w[c] = {}
    for (const l of ANCHORS) {
      const s = loaded?.[c]?.[l]
      w[c][l] = { hard: s?.hard ?? '', medium: s?.medium ?? '', light: s?.light ?? '' }
    }
  }
  return w
}
function initAcc(loaded?: AccessoryByCycle): EditAcc {
  const a: EditAcc = {}
  for (const c of CYCLES) {
    a[c] = {}
    for (const it of ACC_ITEMS) a[c][it] = loaded?.[c]?.[it] ?? GIANTFIT_CARRY_DEFAULTS[it] ?? ''
  }
  return a
}

// Run distance targets: same shape + forward seeding as the recorded accessories.
function initRunTargets(loaded?: RunTargetsByCycle): EditRunTargets {
  const t = {} as EditRunTargets
  for (const c of CYCLES) {
    t[c] = { easy: '', quality: '', long: '' }
    for (const s of RUN_SLOTS) t[c][s] = loaded?.[c]?.[s] ?? ''
  }
  const blank = (v: number | string) => v === '' || v == null
  for (const s of RUN_SLOTS) {
    for (const c of CYCLES) {
      if (c > 1 && blank(t[c][s]) && !blank(t[c - 1][s])) t[c][s] = t[c - 1][s]
    }
  }
  return t
}

// Capacity config arrives with app defaults already merged (repo read); weight
// null = unset → blank input.
function initCapacity(loaded?: CapacityConfig): EditCapacity {
  const out = {} as EditCapacity
  for (const v of CAPACITY_VARIANTS) {
    out[v] = {}
    for (const m of CAPACITY_MOVEMENTS[v]) {
      const s = loaded?.movements?.[v]?.[m.key]
      out[v][m.key] = { reps: s?.reps ?? m.reps, weight: s?.weight ?? '' }
    }
  }
  return out
}

interface SetupProps {
  macro: Macro | null
  bundle: {
    weights: WeightsByCycle
    accessory: AccessoryByCycle
    runTargets: RunTargetsByCycle
    capacity: CapacityConfig
    giantAccessory: GiantAccessoryReps
    giant2Difficulty?: Giant2DifficultyConfig
  }
  macros?: Macro[]
  // The movement library (user-scoped). Nothing prescribes from it yet — this is
  // the editor for the content the program will draw on.
  movements?: Movement[]
  onReload: () => Promise<void>
  onSelectMacro: (id: string) => void
  onRollMacro: (newStartISO: string) => Promise<void>
  onSaveMovement?: (m: Movement) => Promise<Movement>
  onArchiveMovement?: (id: string, archived: boolean) => Promise<void>
}

// Read-only live preview of the full cascade from one Hard anchor: the three day
// tops (Hard/Med/Light) and, per day, the four Giant Block sets + the Volume load.
// kg prominent, % secondary. Computed via the engine — never stored.
function CascadePreview({ anchor }: { anchor: number | string }) {
  const a = anchor === '' || anchor == null ? NaN : Number(anchor)
  if (!Number.isFinite(a) || a <= 0) {
    return <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 8 }}>Enter the Hard top to preview the computed loads.</div>
  }
  const tops = expandDayTops(a)
  const kg = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1))
  const colLabel = ['Set 1', 'Set 2', 'Set 3', 'Top', 'Vol']
  const colPct = [...SET_LADDER.map((p) => Math.round(p * 100)), Math.round(VOLUME_PCT * 100)]
  const cell: CSSProperties = { textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums', padding: '3px 0' }
  return (
    <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}`, borderRadius: 2, padding: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(5, 1fr)', alignItems: 'center', gap: 2 }}>
        <span />
        {colLabel.map((l, i) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9.5, color: i === 3 ? C.gold : C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
            <div style={{ fontSize: 9, color: C.muted }}>{colPct[i]}%</div>
          </div>
        ))}
        {DIFFS.map((d) => {
          const sets = giantSets(tops[d], d)
          const vals = [sets[0].weight, sets[1].weight, sets[2].weight, sets[3].weight, volumeWeight(tops[d])]
          return (
            <Fragment key={d}>
              <span style={{ fontSize: 10, fontWeight: 700, color: pillColor(d), textTransform: 'uppercase' }}>{d === 'medium' ? 'Med' : d}</span>
              {vals.map((v, i) => (
                <span key={i} style={{ ...cell, color: i === 3 ? C.gold : C.off, fontWeight: i === 3 ? 700 : 400 }}>{kg(v)}</span>
              ))}
            </Fragment>
          )
        })}
      </div>
      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, textAlign: 'right' }}>kg · rounded to 2.5</div>
    </div>
  )
}

// Read-only live preview of the pace cascade from the reference-pace text —
// mirrors CascadePreview: computed via the engine, never stored. Talk-test mode
// (blank) explains itself; unparseable text shows the expected format.
function PacePreview({ pace }: { pace: string }) {
  const t = pace.trim()
  if (t === '' || runMode(parseClock(t)) === 'talk') {
    const invalid = t !== '' && parseClock(t) == null
    return (
      <div style={{ fontSize: 11, color: invalid ? C.red : C.muted, fontStyle: 'italic', marginTop: 4 }}>
        {invalid ? 'Enter as min:sec per km — 5:35, 5.35 or 535 all work.' : 'Talk-test mode — prescriptions show run type + distance only.'}
      </div>
    )
  }
  const P = parseClock(t) as number
  const [qMin, qMax] = qualityRange(P)
  return (
    <div style={{ marginTop: 6, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}`, borderRadius: 2, padding: 10, fontSize: 12, color: C.off }}>
      Easy <strong style={{ color: C.gold }}>{fmtPace(easyPace(P))}</strong> /km · Quality{' '}
      <strong style={{ color: C.gold }}>
        {fmtPace(qMin)}–{fmtPace(qMax)}
      </strong>{' '}
      /km · Time trial: no prescribed pace
    </div>
  )
}

export function Setup({ macro, bundle, macros = [], movements = [], onReload, onSelectMacro, onRollMacro, onSaveMovement, onArchiveMovement }: SetupProps) {
  const [startISO, setStartISO] = useState(macro?.startISO || '2026-04-13')
  const [number, setNumber] = useState(macro?.number || 1)
  const [cycle, setCycle] = useState(1)
  const [weights, setWeights] = useState<EditWeights>(() => initWeights(bundle?.weights))
  const [acc, setAcc] = useState<EditAcc>(() => initAcc(bundle?.accessory))
  const [runT, setRunT] = useState<EditRunTargets>(() => initRunTargets(bundle?.runTargets))
  // Capacity block: per-movement rep/weight edits, the viewed variant, and rounds.
  const [cap, setCap] = useState<EditCapacity>(() => initCapacity(bundle?.capacity))
  const [capVariant, setCapVariant] = useState<CapacityVariant>('A')
  const [capRounds, setCapRounds] = useState<number>(bundle?.capacity?.rounds ?? 3)
  // Giant Block accessory rep targets (rep-only; defaults merged on load).
  const [gbAcc, setGbAcc] = useState<Record<string, number | string>>(() => ({ ...GIANTFIT_GB_DEFAULT_REPS, ...(bundle?.giantAccessory || {}) }))
  // Giant 2.0 weekly Giant-difficulty rotation (weeks 1-3; week 4 collapses in
  // code, never edited here). Defaults already merged in by the mapper.
  const [giant2Diff, setGiant2Diff] = useState<Giant2DifficultyConfig>(() => bundle?.giant2Difficulty || { ...GIANT2_GIANT_DEFAULT_ROTATION })
  // Reference pace P held as min:sec text; parsed (never rounded) on save.
  const [pace, setPace] = useState(() => (macro?.refPaceS != null ? fmtPace(macro.refPaceS) : ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const defaultNextStart = (() => {
    const d = mondayOf(parseLocalDate(startISO))
    d.setDate(d.getDate() + totalWeeksOf(macro ? { weeks: macro.weeks, deloadExtended: macro.deloadExtended } : {}) * 7)
    return isoLocal(d)
  })()
  const [nextStart, setNextStart] = useState(defaultNextStart)
  const [rollConfirm, setRollConfirm] = useState(false)
  const [rolling, setRolling] = useState(false)

  async function doRoll() {
    setRolling(true)
    setErr('')
    try {
      await onRollMacro(nextStart)
      setRollConfirm(false)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setRolling(false)
    }
  }

  const setW = (c: number, l: string, d: Difficulty, v: string) =>
    setWeights((p) => ({ ...p, [c]: { ...p[c], [l]: { ...p[c][l], [d]: v } } }) as EditWeights)
  const setA = (c: number, it: string, v: string) => setAcc((p) => ({ ...p, [c]: { ...p[c], [it]: v } }) as EditAcc)
  const setR = (c: number, s: RunSlotKey, v: string) => setRunT((p) => ({ ...p, [c]: { ...p[c], [s]: v } }) as EditRunTargets)
  const setCapField = (v: CapacityVariant, key: string, field: 'reps' | 'weight', val: string) =>
    setCap((p) => ({ ...p, [v]: { ...p[v], [key]: { ...p[v][key], [field]: val } } }))

  const pos = computePosition(startISO, number, new Date(), macro ? { weeks: macro.weeks, deloadExtended: macro.deloadExtended } : {})
  const posText = pos.beforeStart
    ? 'Before macro start'
    : pos.complete
      ? 'Macro complete'
      : pos.weekType === 'testing'
        ? `Testing week (wk ${pos.displayWeekGlobal}/${pos.totalWeeks})`
        : pos.weekType === 'deload'
          ? `Deload week (wk ${pos.displayWeekGlobal}/${pos.totalWeeks})`
          : `M${pos.macro} · C${pos.meso} · W${pos.week}  (wk ${pos.displayWeekGlobal}/${pos.totalWeeks})`

  async function save() {
    setSaving(true)
    setErr('')
    try {
      // Reference pace: blank = talk-test mode (null); otherwise must parse as m:ss.
      const paceText = pace.trim()
      const refPaceS = paceText === '' ? null : parseClock(paceText)
      if (paceText !== '' && refPaceS == null) throw new Error('Reference pace must be min:sec per km, e.g. 5:35')
      let m = macro
      if (!m) m = await repo.createMacro({ number, startISO })
      await repo.updateMacro(m.id, { number, startISO, refPaceS })
      for (const c of CYCLES) {
        await repo.saveWorkingWeights(m.id, c, weights[c])
        await repo.saveAccessoryWeights(m.id, c, acc[c])
        await repo.saveRunTargets(m.id, c, runT[c])
      }
      for (const v of CAPACITY_VARIANTS) await repo.saveCapacityConfig(v, cap[v])
      await repo.setCapacityRounds(capRounds)
      await repo.saveGiantAccessoryConfig(gbAcc)
      await repo.saveGiant2DifficultyConfig(giant2Diff)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      await onReload()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const cycleBtn = (c: number) => (
    <button
      key={c}
      onClick={() => setCycle(c)}
      aria-pressed={cycle === c}
      style={{
        flex: 1,
        background: cycle === c ? C.gold : 'transparent',
        color: cycle === c ? C.dark : C.muted,
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        fontSize: 12,
        fontWeight: 600,
        padding: '8px 4px',
        cursor: 'pointer',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      Cycle {c}
    </button>
  )

  return (
    <div>
      {/* Macro picker (only once more than one macro exists) */}
      {macros.length > 1 && onSelectMacro && (
        <Card>
          <label style={lbl}>Viewing macro</label>
          <select style={inp} value={macro?.id || ''} onChange={(e) => onSelectMacro(e.target.value)}>
            {macros.map((m) => (
              <option key={m.id} value={m.id}>
                Macro {m.number} {m.status === 'active' ? '(active)' : '(completed)'} · from {m.startISO}
              </option>
            ))}
          </select>
        </Card>
      )}

      {/* Macro anchor */}
      <Card>
        <BlockTitle tag="computed from date">Macro Anchor</BlockTitle>
        {/* Stacked, not side-by-side: iOS native date inputs keep an intrinsic width
            and won't shrink into a grid track, so they bumped the Macro # field.
            Stacking removes that failure mode entirely. */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={lbl}>Macro start (Monday)</label>
            <input style={DATE_INPUT} type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Macro #</label>
            <input
              style={{ ...inp, width: 100 }}
              type="number"
              min="1"
              value={number}
              onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.gold, marginTop: 12, fontWeight: 600 }}>Today: {posText}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Position is computed from the start date — never set manually. Miss a session and you rejoin where the calendar
          says. When a macro ends, set the next start date and bump the number; carry your C3 weights forward as the new
          C1 loads.
        </div>
      </Card>

      {/* Cycle selector */}
      <Card>
        <BlockTitle tag="single anchor">Working Weights</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Enter only the <strong style={{ color: C.off }}>Hard top set</strong> per lift, per cycle. Medium (×95%) and
          Light (×90%) day tops, the four Giant Block sets (85/90/95/100% of each day's top) and the Volume load (80%)
          all compute automatically — rounded to 2.5 kg, recomputed live as you type. A session always reads its own
          cycle's loads.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>{CYCLES.map(cycleBtn)}</div>

        {/* One Hard-top anchor per lift, with a read-only computed cascade below it */}
        {ANCHORS.map((lift) => (
          <div key={lift} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center' }}>
              <label htmlFor={`hard-${cycle}-${lift}`} style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
                {ANCHOR_LABEL[lift]} <span style={{ color: pillColor('hard') }}>· Hard top</span>
                {ANCHOR_NOTE[lift] && <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}> · {ANCHOR_NOTE[lift]}</span>}
              </label>
              <input
                id={`hard-${cycle}-${lift}`}
                data-lift={lift}
                data-diff="hard"
                aria-label={`${ANCHOR_LABEL[lift]} Hard top, cycle ${cycle} (kg)`}
                style={{ ...inp, padding: '6px', textAlign: 'center' }}
                type="number"
                step="2.5"
                inputMode="decimal"
                value={weights[cycle][lift].hard}
                onChange={(e) => setW(cycle, lift, 'hard', e.target.value)}
              />
            </div>
            <CascadePreview anchor={weights[cycle][lift].hard} />
          </div>
        ))}
      </Card>

      {/* Giant Block bodyweight accessories — rep-only targets (no load, no cycle) */}
      <Card>
        <BlockTitle tag="giantfit">Giant Block Accessories</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          The bodyweight movement each Giant Block carries alongside the lift — rep target only, no load. Same target
          on every difficulty and cycle.
        </div>
        {GB_ACC_DAYS.map((day) => {
          const m = GIANTFIT_GB_ACCESSORY[day]!
          return (
            <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 13, color: C.off }}>
                {m.name} <span style={{ fontSize: 10, color: C.muted }}>— {LIFT_SHORT[day]} day</span>
              </span>
              <input
                data-gb-reps={m.key}
                aria-label={`${m.name} rep target`}
                style={{ ...inp, padding: '6px', textAlign: 'center' }}
                type="number"
                step="1"
                inputMode="numeric"
                value={gbAcc[m.key]}
                onChange={(e) => setGbAcc((p) => ({ ...p, [m.key]: e.target.value }))}
              />
            </div>
          )
        })}
      </Card>

      {/* Giant 2.0 — weekly Giant-difficulty rotation (weeks 1-3 of every cycle;
          week 4 collapses to one difficulty for the whole cycle, computed in
          code, not edited here). Not yet read by any session view (Phase 1). */}
      <Card>
        <BlockTitle tag="giant 2.0">Giant Difficulty Rotation</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Which difficulty each lift runs on weeks 1-3 of every cycle (repeats identically C1/C2/C3). Week 4 always
          collapses to one difficulty for all four lifts — Light in C1, Medium in C2, Hard in C3 — and isn't edited
          here.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(4, 1fr)', gap: 8, alignItems: 'center' }}>
          <span />
          {GIANT2_ROTATION_DAYS.map((day) => (
            <span key={day} style={{ fontSize: 10, color: C.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {LIFT_SHORT[day]}
            </span>
          ))}
          {GIANT2_ROTATION_WEEKS.map((week) => (
            <Fragment key={week}>
              <span style={{ fontSize: 12, color: C.off, fontWeight: 600 }}>W{week}</span>
              {GIANT2_ROTATION_DAYS.map((day) => (
                <select
                  key={day}
                  data-giant2-diff={`${week}-${day}`}
                  aria-label={`${LIFT_SHORT[day]} difficulty, week ${week}`}
                  style={{ ...inp, padding: '6px', textAlign: 'center', color: pillColor((giant2Diff[week]?.[day] as Difficulty) || 'medium') }}
                  value={giant2Diff[week]?.[day] || GIANT2_GIANT_DEFAULT_ROTATION[week][day]}
                  onChange={(e) =>
                    setGiant2Diff((p) => ({ ...p, [week]: { ...p[week], [day]: e.target.value as Difficulty } }))
                  }
                >
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>
                      {d === 'medium' ? 'Med' : d[0].toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              ))}
            </Fragment>
          ))}
        </div>
      </Card>

      {/* GiantFit capacity block — two circuit variants, editable targets */}
      <Card>
        <BlockTitle tag="giantfit">Capacity</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Two circuit variants, 8 movements each, done top to bottom for the set number of rounds. Rep targets are
          editable; loaded movements also take a weight (kg). Blank weight = choose on the day.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Rounds</span>
          <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Capacity rounds">
            {CAPACITY_ROUNDS_OPTIONS.map((r) => (
              <button
                key={r}
                data-cap-rounds={r}
                onClick={() => setCapRounds(r)}
                aria-pressed={capRounds === r}
                style={{
                  flex: 1,
                  background: capRounds === r ? C.gold : 'transparent',
                  color: capRounds === r ? C.dark : C.muted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 2,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 4px',
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }} role="group" aria-label="Capacity variant">
          {CAPACITY_VARIANTS.map((v) => (
            <button
              key={v}
              data-cap-variant={v}
              onClick={() => setCapVariant(v)}
              aria-pressed={capVariant === v}
              style={{
                flex: 1,
                background: capVariant === v ? C.gold : 'transparent',
                color: capVariant === v ? C.dark : C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: 2,
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 4px',
                cursor: 'pointer',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Variant {v}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 74px', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span />
          <span style={{ fontSize: 9.5, color: C.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reps</span>
          <span style={{ fontSize: 9.5, color: C.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>kg</span>
        </div>
        {CAPACITY_MOVEMENTS[capVariant].map((m, i) => (
          <div
            key={m.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 64px 74px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 13, color: C.off }}>
              <span style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{i + 1}. </span>
              {m.name}
              {(m.note || m.repUnit) && (
                <span style={{ fontSize: 10, color: C.muted }}>
                  {' '}
                  {[m.repUnit, m.note].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <input
              data-cap-reps={m.key}
              aria-label={`${m.name} rep target, variant ${capVariant}`}
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="1"
              inputMode="numeric"
              value={cap[capVariant][m.key].reps}
              onChange={(e) => setCapField(capVariant, m.key, 'reps', e.target.value)}
            />
            {m.loaded ? (
              <input
                data-cap-weight={m.key}
                aria-label={`${m.name} weight, variant ${capVariant} (kg)`}
                style={{ ...inp, padding: '6px', textAlign: 'center' }}
                type="number"
                step="0.5"
                inputMode="decimal"
                value={cap[capVariant][m.key].weight}
                onChange={(e) => setCapField(capVariant, m.key, 'weight', e.target.value)}
              />
            ) : (
              <span style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>—</span>
            )}
          </div>
        ))}
        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, textAlign: 'right' }}>
          logged as one block — timer &amp; logging arrive with the session views
        </div>
      </Card>

      {/* Carry loads for the selected cycle */}
      <Card>
        <BlockTitle tag={`cycle ${cycle}`}>Carries</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Recorded weight each (no cascade), the same all week within a cycle. RPE ~6 — reward work, never a fourth hard
          effort. Progress once per meso: position before load, distance before weight. Blank = decide at the rack.
        </div>
        {ACC_ITEMS.map((it) => (
          <div
            key={it}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 13, color: C.off }}>{ACC_LABEL[it]}</span>
            <input
              data-item={it}
              aria-label={`${ACC_LABEL[it]}, cycle ${cycle} (kg)`}
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="2.5"
              value={acc[cycle][it]}
              onChange={(e) => setA(cycle, it, e.target.value)}
            />
          </div>
        ))}
      </Card>

      {/* The Giant Run — reference pace anchor + per-cycle distance targets */}
      <Card>
        <BlockTitle tag="single anchor">Running</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          One <strong style={{ color: C.off }}>reference pace P</strong> per macro (typically your latest 5k time-trial
          pace). Easy (P+75s) and Quality (P+15–40s) paces compute off it, rounded to {PACE_ROUND_S} s/km — P itself is
          never rounded. Leave blank for <strong style={{ color: C.off }}>talk-test mode</strong> (no paces shown — the
          mesocycle-1 state). Distance targets are guidance per cycle; the log records actual distance.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <label htmlFor="ref-pace" style={{ fontSize: 13, color: C.off, fontWeight: 600 }}>
            Reference pace P <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>(min:sec / km · blank = talk test)</span>
          </label>
          <input
            id="ref-pace"
            data-run-pace
            aria-label="Reference pace P (min:sec per km)"
            style={{ ...inp, padding: '6px', textAlign: 'center' }}
            type="text"
            // decimal keypad: iOS's numeric pad has no colon — "." works as the
            // separator (5.35 = 5:35), and bare digits parse too (535 = 5:35).
            inputMode="decimal"
            placeholder="5:35"
            value={pace}
            onChange={(e) => setPace(e.target.value)}
          />
        </div>
        <PacePreview pace={pace} />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '12px 0' }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>{CYCLES.map(cycleBtn)}</div>
        {RUN_SLOTS.map((s) => (
          <div
            key={s}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 13, color: C.off }}>
              {RUN_SLOT_LABEL[s]}
              {s === 'quality' && <span style={{ fontSize: 10, color: C.muted }}> (runs easy in C1)</span>}
            </span>
            <input
              data-run-target={s}
              aria-label={`${RUN_SLOT_LABEL[s]} target, cycle ${cycle} (km)`}
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="0.5"
              inputMode="decimal"
              value={runT[cycle][s]}
              onChange={(e) => setR(cycle, s, e.target.value)}
            />
          </div>
        ))}
        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, textAlign: 'right' }}>km · target, not prescription</div>
      </Card>

      {err && (
        <div style={{ ...cardStyle, border: `1px solid ${C.red}`, color: C.red, fontSize: 13 }}>{err}</div>
      )}

      <button
        onClick={save}
        disabled={saving}
        style={{
          width: '100%',
          background: saved ? C.green : C.gold,
          color: C.dark,
          border: 'none',
          borderRadius: 2,
          padding: 13,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save setup (all 3 cycles)'}
      </button>

      {macro && macro.status === 'active' && (
        <Card style={{ marginTop: 16, border: `1px solid ${C.border}` }}>
          <BlockTitle tag="archive">Start Next Macro</BlockTitle>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
            Completes Macro {macro.number} and starts Macro {macro.number + 1}, carrying this macro's <strong>C3 weights forward
            as the new C1</strong> (cleans + carries too). Macro {macro.number}'s history stays viewable via the picker above.
          </div>
          <label style={lbl}>New macro start (Monday)</label>
          <input style={DATE_INPUT} type="date" value={nextStart} onChange={(e) => setNextStart(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            {!rollConfirm ? (
              <button
                onClick={() => setRollConfirm(true)}
                style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 2, padding: '10px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Start next macro…
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.off }}>Roll forward to Macro {macro.number + 1}?</span>
                <button onClick={doRoll} disabled={rolling} style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: rolling ? 'wait' : 'pointer' }}>
                  {rolling ? 'Rolling…' : 'Yes, roll forward'}
                </button>
                <button onClick={() => setRollConfirm(false)} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Movement library — the content the program draws on. Last card by
          design: it's reference data, not per-macro setup. */}
      <MovementLibrary movements={movements} onSave={onSaveMovement} onArchive={onArchiveMovement} />

      <div style={{ ...cardStyle, marginTop: 16, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
        Saved to Supabase and synced across devices.
      </div>
    </div>
  )
}

// ---- Movement library --------------------------------------------------------
// The per-user library of exercises the program can prescribe. A movement
// declares two capabilities — how it's LOADED and how it's COUNTED — and a slot
// accepts it on that basis (engine/movements.ts). Nothing prescribes from this
// yet; editing here is safe.
//
// Movements are ARCHIVED, never deleted: a program version that referenced one
// must keep resolving. `blockArchive` is the guard for that — it is inert while
// no slots exist and gets wired to the live version's slots in the next phase.
function blockArchive(m: Movement, referencedKeys: Set<string>): string | null {
  return referencedKeys.has(m.key) ? `${m.name} is used by the current program — swap it out of its slot first.` : null
}

type MovementDraft = {
  id?: string
  key: string
  name: string
  loadType: LoadType
  countType: CountType
  defaultReps: number | string
  repUnit: string
  note: string
  archived: boolean
}

const blankMovement = (): MovementDraft => ({
  key: '',
  name: '',
  loadType: 'bodyweight',
  countType: 'reps',
  defaultReps: '',
  repUnit: '',
  note: '',
  archived: false,
})

const toDraft = (m: Movement): MovementDraft => ({
  id: m.id,
  key: m.key,
  name: m.name,
  loadType: m.loadType,
  countType: m.countType,
  defaultReps: m.defaultReps ?? '',
  repUnit: m.repUnit ?? '',
  note: m.note ?? '',
  archived: m.archived,
})

function MovementLibrary({
  movements,
  onSave,
  onArchive,
}: {
  movements: Movement[]
  onSave?: (m: Movement) => Promise<Movement>
  onArchive?: (id: string, archived: boolean) => Promise<void>
}) {
  const [editing, setEditing] = useState<MovementDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Slots land in the next phase; until then nothing is referenced, so the
  // archive guard never fires. Keeping the wiring here makes that switch a
  // one-line change rather than a new code path.
  const referencedKeys = new Set<string>()

  const live = movements.filter((m) => !m.archived)
  const archived = movements.filter((m) => m.archived)
  const groups = LOAD_TYPES.map((lt) => ({ loadType: lt, items: live.filter((m) => m.loadType === lt) })).filter((g) => g.items.length)

  async function save() {
    if (!editing || !onSave) return
    const name = editing.name.trim()
    if (!name) {
      setErr('A movement needs a name.')
      return
    }
    // The key is the identity: auto-slugged once on create, immutable after.
    const key = editing.key || slugify(name)
    if (!key) {
      setErr('That name has no letters or digits to build a key from.')
      return
    }
    if (!editing.id && movements.some((m) => m.key === key)) {
      setErr(`A movement with the key "${key}" already exists.`)
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        id: editing.id,
        key,
        name,
        loadType: editing.loadType,
        countType: editing.countType,
        defaultReps: editing.defaultReps === '' ? null : Number(editing.defaultReps),
        repUnit: editing.repUnit.trim() || null,
        note: editing.note.trim() || null,
        archived: editing.archived,
      })
      setEditing(null)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleArchive(m: Movement) {
    if (!onArchive || !m.id) return
    const blocked = !m.archived && blockArchive(m, referencedKeys)
    if (blocked) {
      setErr(blocked)
      return
    }
    setErr('')
    try {
      await onArchive(m.id, !m.archived)
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  const row = (m: Movement) => (
    <div
      key={m.key}
      data-movement={m.key}
      style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <span style={{ fontSize: 13, color: m.archived ? C.muted : C.off }}>
        {m.name}
        <span style={{ fontSize: 10, color: C.muted }}>
          {' · '}
          {COUNT_TYPE_LABEL[m.countType]}
          {m.defaultReps != null ? ` ${formatCount(m.defaultReps, m)}` : ''}
          {m.note ? ` · ${m.note}` : ''}
        </span>
      </span>
      <button
        onClick={() => {
          setErr('')
          setEditing(toDraft(m))
        }}
        aria-label={`Edit ${m.name}`}
        style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
      >
        Edit
      </button>
      <button
        onClick={() => toggleArchive(m)}
        aria-label={`${m.archived ? 'Restore' : 'Archive'} ${m.name}`}
        style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
      >
        {m.archived ? 'Restore' : 'Archive'}
      </button>
    </div>
  )

  return (
    <Card>
      <BlockTitle tag="library">Movement Library</BlockTitle>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
        Every exercise the program can prescribe. Each one declares how it's <strong style={{ color: C.off }}>loaded</strong>{' '}
        and how it's <strong style={{ color: C.off }}>counted</strong> — that's what decides which slots it can fill.
        Editing a name here is safe; the key underneath is the identity and never changes.
      </div>

      {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{err}</div>}

      {groups.map((g) => (
        <div key={g.loadType} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            {LOAD_TYPE_LABEL[g.loadType]}
          </div>
          {g.items.map(row)}
        </div>
      ))}
      {!movements.length && (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
          The library seeds itself on first load. If this stays empty, the dev write-guard is blocking the seed.
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setShowArchived((s) => !s)}
            aria-expanded={showArchived}
            style={{ background: 'transparent', color: C.muted, border: 'none', fontSize: 11, cursor: 'pointer', padding: '4px 0' }}
          >
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && archived.map(row)}
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <label style={lbl} htmlFor="mv-name">
            Name
          </label>
          <input
            id="mv-name"
            data-movement-field="name"
            style={inp}
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <div style={{ fontSize: 10, color: C.muted, margin: '4px 0 10px' }}>
            Key: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{editing.key || slugify(editing.name) || '—'}</span>
            {editing.id ? ' (fixed)' : ' (set on save)'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl} htmlFor="mv-load">
                Load
              </label>
              <select
                id="mv-load"
                data-movement-field="load_type"
                style={inp}
                value={editing.loadType}
                onChange={(e) => setEditing({ ...editing, loadType: e.target.value as LoadType })}
              >
                {LOAD_TYPES.map((l) => (
                  <option key={l} value={l}>
                    {LOAD_TYPE_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl} htmlFor="mv-count">
                Counted in
              </label>
              <select
                id="mv-count"
                data-movement-field="count_type"
                style={inp}
                value={editing.countType}
                onChange={(e) => setEditing({ ...editing, countType: e.target.value as CountType })}
              >
                {COUNT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {COUNT_TYPE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div>
              <label style={lbl} htmlFor="mv-reps">
                Default count
              </label>
              <input
                id="mv-reps"
                data-movement-field="default_reps"
                style={inp}
                type="number"
                step="1"
                inputMode="numeric"
                value={editing.defaultReps}
                onChange={(e) => setEditing({ ...editing, defaultReps: e.target.value })}
              />
            </div>
            <div>
              <label style={lbl} htmlFor="mv-unit">
                Unit
              </label>
              <input
                id="mv-unit"
                data-movement-field="rep_unit"
                placeholder="/side · /leg · sec"
                style={inp}
                value={editing.repUnit}
                onChange={(e) => setEditing({ ...editing, repUnit: e.target.value })}
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.muted, margin: '4px 0 10px' }}>
            Preview: {editing.defaultReps === '' ? '—' : formatCount(Number(editing.defaultReps), { repUnit: editing.repUnit })}
          </div>

          <label style={lbl} htmlFor="mv-note">
            Note
          </label>
          <input
            id="mv-note"
            data-movement-field="note"
            placeholder="e.g. per hand"
            style={inp}
            value={editing.note}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={save}
              disabled={busy}
              style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Saving…' : 'Save movement'}
            </button>
            <button
              onClick={() => {
                setEditing(null)
                setErr('')
              }}
              style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.muted}`, borderRadius: 2, padding: '9px 16px', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setErr('')
            setEditing(blankMovement())
          }}
          data-movement-add="1"
          style={{ marginTop: 8, background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 2, padding: '9px 16px', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Add movement
        </button>
      )}
    </Card>
  )
}
