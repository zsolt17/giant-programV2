import React, { useState } from 'react'
import { C, cardStyle, btnPrimary, inp, lbl, pillColor } from './theme.js'
import { Card, BlockTitle } from './components.jsx'
import * as repo from '../data/repository.js'
import { computePosition, parseLocalDate, mondayOf, isoLocal } from '../engine/date-engine.js'
import { LIFT_LABEL } from '../engine/constants.js'

const LIFTS = ['deadlift', 'ohp', 'squat', 'dips']
const DIFFS = ['hard', 'medium', 'light']
const CYCLES = [1, 2, 3]
const ACC_LABEL = {
  clean: 'Power Clean (5×3)',
  carry_deadlift: 'Farmer Carry — DL day',
  carry_ohp: 'Suitcase Carry — OHP day',
  carry_squat: 'Sandbag Bear Hug — Squat day',
  carry_dips: 'Overhead Carry — Dips day',
}
const ACC_ITEMS = Object.keys(ACC_LABEL)

// Build editable state: every cycle/lift/difficulty present, blank if unset.
function initWeights(loaded) {
  const w = {}
  for (const c of CYCLES) {
    w[c] = {}
    for (const l of LIFTS) {
      const s = (loaded && loaded[c] && loaded[c][l]) || {}
      w[c][l] = { hard: s.hard ?? '', medium: s.medium ?? '', light: s.light ?? '' }
    }
  }
  return w
}
function initAcc(loaded) {
  const a = {}
  for (const c of CYCLES) {
    a[c] = {}
    for (const it of ACC_ITEMS) a[c][it] = (loaded && loaded[c] && loaded[c][it]) ?? ''
  }
  return a
}

export function Setup({ macro, bundle, macros = [], onReload, onSelectMacro, onRollMacro }) {
  const [startISO, setStartISO] = useState(macro?.startISO || '2026-04-13')
  const [number, setNumber] = useState(macro?.number || 1)
  const [cycle, setCycle] = useState(1)
  const [weights, setWeights] = useState(() => initWeights(bundle?.weights))
  const [acc, setAcc] = useState(() => initAcc(bundle?.accessory))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const defaultNextStart = (() => {
    const d = mondayOf(parseLocalDate(startISO))
    d.setDate(d.getDate() + 15 * 7)
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
      setErr(String(e?.message || e))
    } finally {
      setRolling(false)
    }
  }

  const setW = (c, l, d, v) =>
    setWeights((p) => ({ ...p, [c]: { ...p[c], [l]: { ...p[c][l], [d]: v } } }))
  const setA = (c, it, v) => setAcc((p) => ({ ...p, [c]: { ...p[c], [it]: v } }))

  const pos = computePosition(startISO, number, new Date())
  const posText = pos.beforeStart
    ? 'Before macro start'
    : pos.complete
      ? 'Macro complete'
      : pos.weekType === 'testing'
        ? `Testing week (wk ${pos.displayWeekGlobal}/15)`
        : pos.weekType === 'deload'
          ? `Deload week (wk ${pos.displayWeekGlobal}/15)`
          : `M${pos.macro} · C${pos.meso} · W${pos.week}  (wk ${pos.displayWeekGlobal}/15)`

  async function save() {
    setSaving(true)
    setErr('')
    try {
      let m = macro
      if (!m) m = await repo.createMacro({ number, startISO })
      else m = await repo.updateMacro(m.id, { number, startISO })
      for (const c of CYCLES) {
        await repo.saveWorkingWeights(m.id, c, weights[c])
        await repo.saveAccessoryWeights(m.id, c, acc[c])
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      await onReload()
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const cycleBtn = (c) => (
    <button
      key={c}
      onClick={() => setCycle(c)}
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

  const diffHeader = (d) => (
    <span key={d} style={{ color: pillColor(d), textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
      {d === 'medium' ? 'Med' : d}
    </span>
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
            <input style={inp} type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
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
        <BlockTitle tag="per mesocycle">Working Weights</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Each mesocycle (C1/C2/C3) has its own H/M/L grid — a logged session always uses its own cycle's weights. Top
          set = the working weight (Set 4 = 100%).
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>{CYCLES.map(cycleBtn)}</div>

        {/* Main-lift grid for the selected cycle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Cycle {cycle}
          </span>
          {DIFFS.map(diffHeader)}
          {LIFTS.map((lift) => (
            <React.Fragment key={lift}>
              <span style={{ fontSize: 12, color: C.off }}>{LIFT_LABEL[lift]}</span>
              {DIFFS.map((d) => (
                <input
                  key={d}
                  data-lift={lift}
                  data-diff={d}
                  style={{ ...inp, padding: '6px', textAlign: 'center' }}
                  type="number"
                  step="2.5"
                  value={weights[cycle][lift][d]}
                  onChange={(e) => setW(cycle, lift, d, e.target.value)}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Accessory loads for the selected cycle */}
      <Card>
        <BlockTitle tag={`cycle ${cycle}`}>Cleans &amp; Carries</BlockTitle>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Single value each (no H/M/L). Carries are the same all week within a cycle; cleans are bar-speed governed.
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
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="2.5"
              value={acc[cycle][it]}
              onChange={(e) => setA(cycle, it, e.target.value)}
            />
          </div>
        ))}
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

      {macro && macro.status === 'active' && onRollMacro && (
        <Card style={{ marginTop: 16, border: `1px solid ${C.border}` }}>
          <BlockTitle tag="archive">Start Next Macro</BlockTitle>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
            Completes Macro {macro.number} and starts Macro {macro.number + 1}, carrying this macro's <strong>C3 weights forward
            as the new C1</strong> (cleans + carries too). Macro {macro.number}'s history stays viewable via the picker above.
          </div>
          <label style={lbl}>New macro start (Monday)</label>
          <input style={inp} type="date" value={nextStart} onChange={(e) => setNextStart(e.target.value)} />
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
