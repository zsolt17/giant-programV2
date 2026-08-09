// Giant 2.0 session view (from GIANT2_START_DATE) — Primer -> Giant -> Volume
// -> Capability. Capability content is dispatched by CYCLE (Hypertrophy C1 /
// Oly C2 / Carries C3, capabilityProgramFor) — null on deload (cycle unset).
// Mirrors SessionForm.tsx's structure and reuses its shared helpers
// (Row/LogRpe/BlockCompletion/ClusterInput) but is a SEPARATE component —
// GiantFit's live rendering must stay untouched while an actual macro is
// still running under it.
import { C, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row, LogRpe } from './controls'
import { BlockCompletion } from './SessionForm'
import { HypertrophyBlock, OlyBlock } from './CapabilityBlock'
import {
  SCHEMES,
  WU_PCT,
  WU_REPS,
  SET_LADDER,
  LIFT_LABEL,
  PULLUP,
  GIANTFIT_ROW_REPS,
  GIANT2_ROPE_FLOW,
  GIANT2_PRIMER_BAND,
  GIANT2_PRIMER_RAMP,
  GIANT2_PRIMER_RAMP_ROUNDS,
  GIANT2_SECONDARY,
  GIANT2_GB_ACCESSORY,
  GIANT2_DAY_TYPE,
  GIANT2_CARRY_RPE_GUIDANCE,
  DAY_META,
} from '../engine/constants'
import { fmt, giantSets, warmupSets, volumeWeight, deloadTop, liftMode } from '../engine/loading'
import { clusterTotal, isUnbroken, meetsTarget } from '../engine/pullups'
import { capabilityProgramFor } from '../engine/date-engine'
import type { Movement } from '../engine/movements'
import type {
  Difficulty,
  Lift,
  SessionDraft,
  LiftWeights,
  GiantAccessoryReps,
  HypertrophyLog,
  HypertrophyLogDraft,
  OlyLog,
  OlyLogDraft,
} from '../engine/types'

interface Giant2SessionFormProps {
  dayType: Lift
  difficulty: Difficulty // the Giant block's own difficulty
  volumeDifficulty: Difficulty | null // the Volume block's own difficulty — null = no Volume block this week (C3 W4)
  top: number | null // the day's Giant-block top, off `difficulty`
  volumeTop: number | null // the day's Volume-block top, off `volumeDifficulty`
  hasWeight: boolean
  isDeload: boolean
  draft: SessionDraft
  setField: <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => void
  locked?: boolean
  // The db_row/pendlay_row lane's per-cycle cell — BB Row (OHP) or Pull-ups
  // (bench, two-mode). null on Squat/Deadlift (train alone) or when unset.
  secondaryCell?: LiftWeights | null
  // Giant Block accessory rep targets from Setup (shared table with GiantFit's,
  // GIANT2_GB_DEFAULT_REPS merged in — mappers.ts).
  giantAccessory?: GiantAccessoryReps
  // Capability block (null cycle — deload — renders nothing here).
  cycle?: number | null
  weekInCycle?: number | null // Oly's position-wave guidance text
  carryLoad?: number | string | null
  capability?: {
    movements: Movement[]
    hypertrophyLogs: HypertrophyLog[] // this session's only (parent filters)
    olyLogs: OlyLog[] // this session's only (parent filters)
    onSaveHypertrophyLog: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
    onSaveOlyLog: (log: OlyLogDraft) => Promise<OlyLog>
  } | null
}

const wuCell = (w: number): string => (w === 0 ? 'BW' : fmt(w))

export function Giant2SessionForm({
  dayType,
  difficulty,
  volumeDifficulty,
  top,
  volumeTop,
  hasWeight,
  isDeload,
  draft,
  setField,
  locked = false,
  secondaryCell,
  giantAccessory,
  cycle,
  weekInCycle,
  carryLoad,
  capability = null,
}: Giant2SessionFormProps) {
  const scheme = SCHEMES[difficulty]
  const dayTypeGroup = GIANT2_DAY_TYPE[dayType] ?? 'lower'
  const band = GIANT2_PRIMER_BAND[dayTypeGroup]
  const ramp = GIANT2_PRIMER_RAMP[dayTypeGroup]
  const capabilityProgram = cycle ? capabilityProgramFor(cycle) : null
  const meta = DAY_META[dayType]
  const carryNum = carryLoad === '' || carryLoad == null ? null : Number(carryLoad)
  const carryDisplay = carryNum != null && !Number.isNaN(carryNum) ? `${fmt(carryNum)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load

  const hasTop = hasWeight && top != null
  const wu = hasTop && top != null ? warmupSets(top) : null
  const gsets = hasTop && top != null ? giantSets(top, difficulty) : null

  // Secondary (anchored — reuses the db_row/pendlay_row LANE, only the
  // occupant changed). Pull-ups (bench) stay two-mode; BB Row (OHP) is
  // always weighted.
  const secondary = GIANT2_SECONDARY[dayType]
  const secondaryIsTwoMode = secondary?.key === 'pullup'
  const secondaryWeighted = secondary ? (secondaryIsTwoMode ? liftMode(secondaryCell?.hard) === 'weighted' : true) : false
  const secBase = secondary && secondaryWeighted ? secondaryCell?.[difficulty] ?? null : null
  const secTop = secBase != null ? (isDeload ? deloadTop(secBase) : secBase) : null
  const secWu = secTop != null ? warmupSets(secTop) : null
  const secGsets = secTop != null ? giantSets(secTop, difficulty) : null
  const secReps = GIANTFIT_ROW_REPS[difficulty]
  const secVolBase = secondary && secondaryWeighted && volumeDifficulty ? secondaryCell?.[volumeDifficulty] ?? null : null

  const gbAcc = GIANT2_GB_ACCESSORY[dayType]
  const gbAccReps = gbAcc ? giantAccessory?.[gbAcc.key] ?? gbAcc.reps : null

  const volScheme = volumeDifficulty ? SCHEMES[volumeDifficulty] : null

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

      {/* I. Primer — no load, no RPE; tracked as prescription only (same
          treatment as GiantFit's own Warm-Up block). */}
      <Card>
        {blockTitle('A. Primer', 'warm-up')}
        <Row a={GIANT2_ROPE_FLOW.name} b={GIANT2_ROPE_FLOW.dose} c="" cls={C.muted} />
        <Row a={band.name} b={band.dose} c="" cls={C.muted} />
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>
          Bodyweight ramp — {GIANT2_PRIMER_RAMP_ROUNDS.join('-')} reps, {GIANT2_PRIMER_RAMP_ROUNDS.length} rounds:
        </div>
        {ramp.map((name) => (
          <Row key={name} a={name} b={`${GIANT2_PRIMER_RAMP_ROUNDS.join('-')} reps · ${GIANT2_PRIMER_RAMP_ROUNDS.length} rounds`} c="" cls={C.muted} />
        ))}
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>Then barbell build-up:</div>
        {WU_PCT.map((p, i) => (
          <Row key={i} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={wu ? wuCell(wu[i].weight) : '—'} cls={C.muted} />
        ))}
        {secondary && secondaryWeighted && (
          <>
            <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>Then {secondary.name} build-up:</div>
            {WU_PCT.map((p, i) => (
              <Row key={`sec-${i}`} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={secWu ? wuCell(secWu[i].weight) : '—'} cls={C.muted} />
            ))}
          </>
        )}
      </Card>

      {/* II. Giant Block */}
      <Card>
        {blockTitle('B. Giant Block', '4 rounds')}
        {SET_LADDER.map((p, i) => {
          const isTop = i === SET_LADDER.length - 1
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
        {secondary &&
          (secondaryWeighted ? (
            <Row
              a={secondary.name}
              b={secGsets ? secGsets.map((g) => `${secReps}@${g.weight % 1 === 0 ? g.weight : g.weight.toFixed(1)}`).join(' · ') : `${secReps} reps/round — set anchor in Setup`}
              c={secTop != null ? fmt(secTop) : '—'}
              cls={C.off}
            />
          ) : (
            <Row a={secondary.name} b={`${PULLUP[difficulty]} reps/round (clusters ok)`} c="BW" cls={C.gold} />
          ))}
        {gbAcc && <Row a={gbAcc.name} b={`${gbAccReps} reps`} c="BW" cls={C.muted} />}
        <LogRpe label="Top set" rpe={draft.rpe} speed={draft.barSpeed} onRpe={(v) => setField('rpe', v)} onSpeed={(v) => setField('barSpeed', v)} />
        <BlockCompletion value={draft.blockCompletion} onChange={(v) => setField('blockCompletion', v)} />
        {secondaryIsTwoMode && !secondaryWeighted && (
          <ClusterInput
            label={`${secondary!.name} — final-round cluster (target ${PULLUP[difficulty]})`}
            dataAttr="pullup-cluster"
            target={PULLUP[difficulty]}
            value={draft.pullupCluster}
            onChange={(v) => setField('pullupCluster', v)}
          />
        )}
      </Card>

      {/* III. Volume Block — independent difficulty from the Giant block's;
          null (C3 week 4) means it doesn't run at all that week. */}
      {volumeDifficulty && volScheme && (
        <Card>
          {blockTitle('C. Volume Block', `2 sets · 80% · ${volumeDifficulty}`)}
          <Row a={LIFT_LABEL[dayType]} b={`2 × ${volScheme.vol} @ 80%`} c={volumeTop != null ? fmt(volumeWeight(volumeTop)) : '—'} cls={C.blue} />
          {secondary &&
            (secondaryWeighted ? (
              <Row a={secondary.name} b={`2 × ${volScheme.vol} @ 80%`} c={secVolBase != null ? fmt(volumeWeight(secVolBase)) : '—'} cls={C.blue} />
            ) : (
              // Bodyweight-mode pull-ups: prescription only — a separate Volume-
              // block cluster log (distinct from the Giant block's) is a
              // possible future refinement, not built here (2026-08-09).
              <Row a={secondary.name} b={`2 × ${volScheme.vol} (BW)`} c="BW" cls={C.blue} />
            ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 10 }}>
            <input type="checkbox" checked={draft.volDone} onChange={(e) => setField('volDone', e.target.checked)} /> Both sets
            completed
          </label>
          <LogRpe label="Volume" rpe={draft.volRpe} speed={draft.volSpeed} onRpe={(v) => setField('volRpe', v)} onSpeed={(v) => setField('volSpeed', v)} />
        </Card>
      )}

      {/* IV. Capability — content dispatched by CYCLE, not week or session
          (GIANT2_CAPABILITY_BY_CYCLE). Absent entirely on deload (cycle null). */}
      {capabilityProgram === 'hypertrophy' && capability && (
        <HypertrophyBlock
          letter="D"
          dayType={dayType}
          sessionId={draft.id}
          movements={capability.movements}
          logs={capability.hypertrophyLogs}
          onSave={capability.onSaveHypertrophyLog}
        />
      )}
      {capabilityProgram === 'oly' && capability && (
        <OlyBlock
          letter="D"
          dayType={dayType}
          weekInCycle={weekInCycle ?? 1}
          sessionId={draft.id}
          movements={capability.movements}
          logs={capability.olyLogs}
          onSave={capability.onSaveOlyLog}
        />
      )}
      {capabilityProgram === 'carries' && (
        <Card>
          {blockTitle('D. Carry', '10 min')}
          <Row a={meta.carry.name} b={`${meta.carry.sets} sets · ${meta.carry.dist}`} c={carryDisplay} cls={C.off} />
          <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', margin: '6px 0' }}>Flat {GIANT2_CARRY_RPE_GUIDANCE} — position before load, distance before weight.</div>
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
          {!draft.carrySkipped && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, minWidth: 70 }}>
                  <label style={lbl}>Rounds</label>
                  <input
                    style={inp}
                    type="number"
                    min="0"
                    step="1"
                    value={draft.carryRounds ?? ''}
                    onChange={(e) => setField('carryRounds', e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={lbl}>Distance / round (m)</label>
                  <input
                    style={inp}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={draft.carryDistance ?? ''}
                    onChange={(e) => setField('carryDistance', e.target.value)}
                  />
                </div>
              </div>
              <LogRpe label="Carry" rpe={draft.carryRpe} speed={null} onRpe={(v) => setField('carryRpe', v)} />
            </>
          )}
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

// Bodyweight-mode cluster input — identical to SessionForm.tsx's own
// ClusterInput (kept local rather than exported/shared to avoid coupling two
// otherwise-independent session views over a small presentational helper).
function ClusterInput({ label, dataAttr, target, value, onChange }: { label: string; dataAttr: string; target: number; value: string; onChange: (v: string) => void }) {
  const total = clusterTotal(value)
  const unbroken = isUnbroken(value)
  const hit = meetsTarget(value, target)
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={lbl}>{label}</label>
      <input
        {...{ [`data-${dataAttr}`]: '1' }}
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
