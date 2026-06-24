import React from 'react'
import { C, cardStyle, inp, lbl } from './theme.js'
import { Card } from './components.jsx'
import { blockTitle, Row, SpeedPick, LogRpe, antagDesc } from './controls.jsx'
import { SCHEMES, WU_PCT, WU_REPS, DAY_META, LIFT_LABEL, PULLUP } from '../engine/constants.js'
import { round, fmt, giantSets, set1Weight, warmupSets, volumeWeight, deloadTop } from '../engine/loading.js'
import { clusterTotal, isUnbroken, meetsTarget } from '../engine/pullups.js'

// Build a blank session draft for a given slot. cleanDefault seeds the dips-day
// clean load from the cycle's accessory weight.
export function buildBlankSession({ date, macroId, cycle, week, weekType, dayType, difficulty, baseTop, isDeload, cleanDefault }) {
  const scheme = difficulty ? SCHEMES[difficulty] : null
  const top = baseTop != null && isDeload ? deloadTop(baseTop) : baseTop ?? null
  return {
    id: `${date}-${dayType || 'x'}-${difficulty ? difficulty[0].toUpperCase() : 'X'}`,
    macroId,
    date,
    cycle: cycle ?? null,
    week: week ?? null,
    weekType,
    dayType: dayType ?? null,
    difficulty: difficulty ?? null,
    topReps: scheme ? scheme.sets[3] : null,
    topWeight: top,
    rpe: '',
    barSpeed: '',
    cleanLoad: cleanDefault ?? '',
    cleanSpeed: '',
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pullupCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRpe: '',
    notes: '',
    startedAt: null,
    endedAt: null,
  }
}

// The prescription + log fields for a training-week session. Reused by Today
// (inline) and SessionModal (overlay). The parent owns the draft + Save button;
// it stamps the prescribed top weight/reps on save.
export function SessionForm({ dayType, difficulty, top, hasWeight, isDeload, draft, setField, locked = false }) {
  const scheme = SCHEMES[difficulty]
  const meta = DAY_META[dayType]
  const w = (v) => (hasWeight ? fmt(v) : '—')
  const s1 = hasWeight ? set1Weight(top, difficulty) : null
  const wu = hasWeight ? warmupSets(top, difficulty) : null
  const gsets = hasWeight ? giantSets(top, difficulty) : null
  const giantLetter = dayType === 'dips' ? 'C' : 'B'
  const volLetter = dayType === 'dips' ? 'D' : 'C'
  const carryLetter = dayType === 'dips' ? 'E' : 'D'

  // When locked (timer not started), the prescription is readable but inert.
  return (
    <div style={locked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      {!hasWeight && (
        <Card style={{ border: `1px solid ${C.red}` }}>
          <div style={{ fontSize: 13, color: C.red, lineHeight: 1.5 }}>
            No working weight set for <strong>{LIFT_LABEL[dayType]} · {difficulty}</strong> in Cycle {draft.cycle}. Enter it
            in Setup and the prescription will fill in. You can still log RPE / bar speed below.
          </div>
        </Card>
      )}

      {/* Warm-up */}
      <Card>
        {blockTitle('A. Warm-Up', 'GOWOD + build-up')}
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 8 }}>
          GOWOD Activate flow (3/6/10 min) — then barbell build-up:
        </div>
        {WU_PCT.map((p, i) => (
          <Row key={i} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={wu ? fmt(wu[i].weight) : '—'} cls={C.muted} />
        ))}
        {dayType === 'dips' && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>+ a few build-up power cleans</div>}
      </Card>

      {/* Clean block (dips only, not on deload) */}
      {dayType === 'dips' && !isDeload && (
        <Card>
          {blockTitle('B. Clean Block', '5×3 · bar speed')}
          <Row a="Power clean" b="5 × 3, touch-and-go, RPE 7 ceiling" c={draft.cleanLoad ? fmt(Number(draft.cleanLoad)) : '—'} cls={C.gold} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Load</label>
              <input
                style={inp}
                type="number"
                step="2.5"
                value={draft.cleanLoad}
                onChange={(e) => setField('cleanLoad', e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Bar speed</label>
              <SpeedPick value={draft.cleanSpeed} onChange={(v) => setField('cleanSpeed', v)} />
            </div>
          </div>
        </Card>
      )}

      {/* Giant Block */}
      <Card>
        {blockTitle(`${giantLetter}. Giant Block`, '4 rounds · 2 min')}
        {scheme.pct.map((p, i) => {
          const isTop = i === 3
          return (
            <Row
              key={i}
              a={isTop ? 'Set 4 — top' : `Set ${i + 1}`}
              b={`${scheme.sets[i]} reps @ ${Math.round(p * 100)}%`}
              c={gsets ? fmt(gsets[i].weight) : '—'}
              cls={isTop ? C.gold : C.off}
            />
          )
        })}
        <Row a={meta.antag} b={antagDesc(meta.antagType, difficulty)} c="" cls={C.muted} />
        <Row a={meta.core} b="10 reps" c="BW" cls={C.muted} />
        <Row a="Cardio" b="30 sec high effort" c="" cls={C.muted} />
        {dayType === 'ohp' && <PullupCluster difficulty={difficulty} value={draft.pullupCluster} onChange={(v) => setField('pullupCluster', v)} />}
        <LogRpe label="Top set" rpe={draft.rpe} speed={draft.barSpeed} onRpe={(v) => setField('rpe', v)} onSpeed={(v) => setField('barSpeed', v)} />
      </Card>

      {/* Volume (not on deload) */}
      {!isDeload && (
        <Card>
          {blockTitle(`${volLetter}. Volume Block`, '2 sets · 80%')}
          {dayType === 'dips' ? (
            <Row a="Push-ups" b={`2 × ${scheme.vol} (BW — elbow protocol)`} c="BW" cls={C.blue} />
          ) : (
            <Row a={LIFT_LABEL[dayType]} b={`2 × ${scheme.vol} @ 80%`} c={hasWeight ? fmt(volumeWeight(top)) : '—'} cls={C.blue} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 10 }}>
            <input type="checkbox" checked={draft.volDone} onChange={(e) => setField('volDone', e.target.checked)} /> Both sets
            completed
          </label>
          <LogRpe label="Volume" rpe={draft.volRpe} speed={draft.volSpeed} onRpe={(v) => setField('volRpe', v)} onSpeed={(v) => setField('volSpeed', v)} />
        </Card>
      )}

      {/* Carry (not on deload) */}
      {!isDeload && (
        <Card>
          {blockTitle(`${carryLetter}. Carry`, '10 min')}
          <Row a={meta.carry.name} b={`${meta.carry.sets} sets · ${meta.carry.dist}`} c={meta.carry.load} cls={C.off} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 8 }}>
            <input type="checkbox" checked={draft.carrySkipped} onChange={(e) => setField('carrySkipped', e.target.checked)} /> Skipped
            today
          </label>
          {draft.carrySkipped && (
            <div style={{ marginTop: 8 }}>
              <label style={lbl}>Reason</label>
              <select style={inp} value={draft.carrySkipReason} onChange={(e) => setField('carrySkipReason', e.target.value)}>
                <option value="">—</option>
                <option value="fatigue">Fatigue</option>
                <option value="schedule">Schedule / time</option>
              </select>
            </div>
          )}
          {!draft.carrySkipped && <LogRpe label="Carry" rpe={draft.carryRpe} speed={null} onRpe={(v) => setField('carryRpe', v)} />}
        </Card>
      )}

      {/* Notes */}
      <Card>
        <label style={lbl}>Notes</label>
        <textarea
          style={{ ...inp, minHeight: 60, resize: 'vertical' }}
          value={draft.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Grip reset, technique cue, how it felt…"
        />
      </Card>
    </div>
  )
}

// Phase-1 pull-up cluster input (OHP-day antagonist). Logs the final Giant Block
// round's cluster, e.g. "6+4"; shows live total + unbroken/target feedback.
function PullupCluster({ difficulty, value, onChange }) {
  const target = PULLUP[difficulty]
  const total = clusterTotal(value)
  const unbroken = isUnbroken(value)
  const hit = meetsTarget(value, target)
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={lbl}>Pull-ups — final-round cluster (target {target})</label>
      <input
        data-pullup-cluster="1"
        style={inp}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 6+4 or 10"
        inputMode="text"
      />
      {total > 0 && (
        <div style={{ fontSize: 12, marginTop: 6, color: C.muted }}>
          {total} reps
          {unbroken ? (
            <span style={{ color: C.green, marginLeft: 8, fontWeight: 600 }}>✓ unbroken</span>
          ) : (
            <span style={{ color: hit ? C.gold : C.muted, marginLeft: 8 }}>{hit ? 'at target — tighten the clusters' : `below target (${target})`}</span>
          )}
        </div>
      )}
    </div>
  )
}
