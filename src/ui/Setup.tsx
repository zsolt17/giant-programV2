import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import { C, cardStyle, inp, lbl, pillColor } from './theme'
import { Card, BlockTitle } from './components'
import * as repo from '../data/repository'
import { computePosition, totalWeeksOf, parseLocalDate, mondayOf, isoLocal } from '../engine/date-engine'
import { LIFT_LABEL, SET_LADDER, VOLUME_PCT, PULLUP, PACE_ROUND_S } from '../engine/constants'
import { expandDayTops, giantSets, volumeWeight, liftMode } from '../engine/loading'
import { runMode, easyPace, qualityRange, fmtPace, parseClock } from '../engine/runs'
import { errMsg } from './controls'
import type { Macro, WeightsByCycle, AccessoryByCycle, RunTargetsByCycle, RunSlotKey, Lift, AnchorLift, Difficulty } from '../engine/types'

const LIFTS: Lift[] = ['deadlift', 'ohp', 'squat', 'dips']
// Anchor rows in the weights card: the 4 day lifts + pull-ups (dips-day secondary,
// anchored for its weighted mode). Dips + pull-ups are two-mode: 0/empty = bodyweight.
const ANCHORS: AnchorLift[] = [...LIFTS, 'pullup']
const ANCHOR_LABEL: Record<AnchorLift, string> = { ...LIFT_LABEL, pullup: 'Pull-ups' }
const TWO_MODE: AnchorLift[] = ['dips', 'pullup']
const DIFFS: Difficulty[] = ['hard', 'medium', 'light']
const CYCLES: number[] = [1, 2, 3]
const ACC_LABEL: Record<string, string> = {
  lunge_deadlift: 'Reverse Lunge — DL day',
  rdl_squat: 'B-Stance DB RDL — Squat day',
  row_ohp: 'One-Arm DB Row — OHP day',
  carry_deadlift: "Farmer's Carry — DL day",
  carry_ohp: 'Overhead Carry — OHP day',
  carry_squat: 'Sandbag Bear Hug — Squat day',
  carry_dips: 'Suitcase Carry — Dips day',
}
const ACC_ITEMS = Object.keys(ACC_LABEL)
// Recorded secondaries (reverse lunge, B-stance RDL, one-arm row): an empty cycle
// auto-fills from the nearest lower cycle as a starting reference (adjust by feel + save).
const SEED_ITEMS = ['lunge_deadlift', 'rdl_squat', 'row_ohp']

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
    for (const it of ACC_ITEMS) a[c][it] = loaded?.[c]?.[it] ?? ''
  }
  // Forward-seed the recorded accessories: an empty higher cycle inherits the
  // previous cycle's value (which may itself have been seeded). Editable + saved.
  const blank = (v: number | string) => v === '' || v == null
  for (const it of SEED_ITEMS) {
    for (const c of CYCLES) {
      if (c > 1 && blank(a[c][it]) && !blank(a[c - 1][it])) a[c][it] = a[c - 1][it]
    }
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

interface SetupProps {
  macro: Macro | null
  bundle: { weights: WeightsByCycle; accessory: AccessoryByCycle; runTargets: RunTargetsByCycle }
  macros?: Macro[]
  onReload: () => Promise<void>
  onSelectMacro: (id: string) => void
  onRollMacro: (newStartISO: string) => Promise<void>
}

// Read-only live preview of the full cascade from one Hard anchor: the three day
// tops (Hard/Med/Light) and, per day, the four Giant Block sets + the Volume load.
// kg prominent, % secondary. Computed via the engine — never stored. Dips and
// pull-ups are two-mode: a 0/empty anchor = bodyweight mode (cluster targets),
// any weight = the full cascade at 0.5 kg rounding.
function CascadePreview({ anchor, lift }: { anchor: number | string; lift: AnchorLift }) {
  const a = anchor === '' || anchor == null ? NaN : Number(anchor)
  const twoMode = TWO_MODE.includes(lift)
  if (twoMode && liftMode(Number.isFinite(a) ? a : null) === 'bodyweight') {
    return (
      <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}`, borderRadius: 2, padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Bodyweight mode</div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          No load cascade. Targets {PULLUP.hard}/{PULLUP.medium}/{PULLUP.light} reps/round (H/M/L); log the final-round
          cluster (e.g. 6+4). Enter a weight to switch to the full cascade (0.5 kg steps).
        </div>
      </div>
    )
  }
  if (!Number.isFinite(a) || a <= 0) {
    return <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 8 }}>Enter the Hard top to preview the computed loads.</div>
  }
  const tops = expandDayTops(a, lift)
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
          const sets = giantSets(tops[d], d, lift)
          const vals = [sets[0].weight, sets[1].weight, sets[2].weight, sets[3].weight, volumeWeight(tops[d], lift)]
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

export function Setup({ macro, bundle, macros = [], onReload, onSelectMacro, onRollMacro }: SetupProps) {
  const [startISO, setStartISO] = useState(macro?.startISO || '2026-04-13')
  const [number, setNumber] = useState(macro?.number || 1)
  const [cycle, setCycle] = useState(1)
  const [weights, setWeights] = useState<EditWeights>(() => initWeights(bundle?.weights))
  const [acc, setAcc] = useState<EditAcc>(() => initAcc(bundle?.accessory))
  const [runT, setRunT] = useState<EditRunTargets>(() => initRunTargets(bundle?.runTargets))
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
                {TWO_MODE.includes(lift) && <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}> (added wt · 0 = BW)</span>}
              </label>
              <input
                id={`hard-${cycle}-${lift}`}
                data-lift={lift}
                data-diff="hard"
                aria-label={`${ANCHOR_LABEL[lift]} Hard top, cycle ${cycle} (kg)`}
                style={{ ...inp, padding: '6px', textAlign: 'center' }}
                type="number"
                step={TWO_MODE.includes(lift) ? '0.5' : '2.5'}
                inputMode="decimal"
                value={weights[cycle][lift].hard}
                onChange={(e) => setW(cycle, lift, 'hard', e.target.value)}
              />
            </div>
            <CascadePreview anchor={weights[cycle][lift].hard} lift={lift} />
          </div>
        ))}
      </Card>

      {/* Accessory loads for the selected cycle */}
      <Card>
        <BlockTitle tag={`cycle ${cycle}`}>Accessories &amp; Carries</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Recorded weight each (no cascade). The secondaries (reverse lunge, B-stance RDL, one-arm row) auto-seed from
          the previous cycle as a starting reference — adjust by feel. Carries are the same all week within a cycle.
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

      <div style={{ ...cardStyle, marginTop: 16, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
        Saved to Supabase and synced across devices.
      </div>
    </div>
  )
}
