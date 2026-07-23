import { C, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row, LogRpe, secondaryDesc } from './controls'
import { CapacityBlock } from './CapacityBlock'
import { SCHEMES, WU_PCT, WU_REPS, SET_LADDER, DAY_META, LIFT_LABEL, PULLUP, BLOCK_COMPLETION, GIANTFIT_PAIRING } from '../engine/constants'
import { fmt, giantSets, warmupSets, volumeWeight, deloadTop, liftMode } from '../engine/loading'
import { isGiantFitDate } from '../engine/date-engine'
import { clusterTotal, isUnbroken, meetsTarget } from '../engine/pullups'
import type { Difficulty, Lift, WeekType, SessionDraft, LiftWeights, CapacityVariant, CapacityConfig, CapacityLog, CapacityLogDraft } from '../engine/types'

interface BlankSessionArgs {
  date: string
  macroId: string
  cycle?: number | null
  week?: number | null
  weekType: WeekType
  dayType?: Lift | null
  difficulty?: Difficulty | null
  baseTop?: number | null
  isDeload?: boolean
}

// Build a blank session draft for a given slot.
export function buildBlankSession({
  date,
  macroId,
  cycle,
  week,
  weekType,
  dayType,
  difficulty,
  baseTop,
  isDeload,
}: BlankSessionArgs): SessionDraft {
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
    cardioCals: ['', '', '', ''],
    blockCompletion: 'completed',
    volDone: true,
    volRpe: '',
    volSpeed: '',
    pairWeight: '',
    pullupCluster: '',
    dipsCluster: '',
    carrySkipped: false,
    carrySkipReason: '',
    carryRounds: 3,
    carryDistance: '',
    carryRpe: '',
    notes: '',
    startedAt: null,
    endedAt: null,
  }
}

interface SessionFormProps {
  dayType: Lift
  difficulty: Difficulty
  top: number | null
  hasWeight: boolean
  isDeload: boolean
  draft: SessionDraft
  setField: <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => void
  locked?: boolean
  // Per-cycle carry weight from Setup (accessory_weights). When set, it replaces the
  // hardcoded descriptive load in the carry prescription.
  carryLoad?: number | string | null
  // Per-cycle recorded weight for the day's Giant Block secondary accessory
  // (Reverse Lunge DL, one-arm row OHP, B-stance RDL Squat). null for bodyweight days.
  secondaryLoad?: number | string | null
  // The cycle's pull-up day-top cell (dips day only): hard = the anchor (exact).
  // Anchor > 0 → weighted pull-ups (full cascade); 0/absent → bodyweight clusters.
  pullupCell?: LiftWeights | null
  // GiantFit capacity block (post-cutover training sessions): the slot's variant,
  // the Setup config, this session's existing log, and its own save/delete
  // handlers (the block saves independently of the session form's Save).
  capacity?: {
    variant: CapacityVariant
    config: CapacityConfig
    log: CapacityLog | null
    onSave: (log: CapacityLogDraft) => Promise<CapacityLog>
    onDelete: (sessionId: string) => Promise<void>
  } | null
}

// The prescription + log fields for a training-week session. Reused by Today
// (inline) and SessionModal (overlay). The parent owns the draft + Save button;
// it stamps the prescribed top weight/reps on save.
export function SessionForm({ dayType, difficulty, top, hasWeight, isDeload, draft, setField, locked = false, carryLoad, secondaryLoad, pullupCell, capacity = null }: SessionFormProps) {
  const scheme = SCHEMES[difficulty]
  const meta = DAY_META[dayType]
  // GiantFit era (the DATE decides): Warm-Up → Giant → Volume → Capacity → Carry,
  // paired row instead of the secondary/core circuit, no per-round cardio, no
  // dips/pull-up two-mode. Pre-cutover sessions keep the legacy Giant layout.
  const giantfit = isGiantFitDate(draft.date)
  const pairing = giantfit ? GIANTFIT_PAIRING[dayType] : null
  // Two-mode dips: a zero/empty anchor = bodyweight mode (cluster targets, no ladder).
  const dipsBW = dayType === 'dips' && liftMode(top) === 'bodyweight'
  // Two-mode pull-ups (dips-day secondary): anchor > 0 = weighted (full cascade at 0.5 kg).
  const pullupWeighted = dayType === 'dips' && liftMode(pullupCell?.hard) === 'weighted'
  const pullupTop = pullupWeighted ? pullupCell?.[difficulty] ?? null : null
  const pullupSets = pullupTop != null ? giantSets(pullupTop, difficulty) : null
  // Prefer the per-cycle carry weight set in Setup; fall back to the descriptive
  // default when it hasn't been configured for this cycle.
  const carryNum = carryLoad === '' || carryLoad == null ? null : Number(carryLoad)
  const carryDisplay = carryNum != null && !Number.isNaN(carryNum) ? `${fmt(carryNum)}${meta.carry.perHand ? ' / hand' : ''}` : meta.carry.load
  // Recorded secondary accessory weight (lunge / row / RDL days); 'BW' for bodyweight (pull-ups).
  const secondaryNum = secondaryLoad === '' || secondaryLoad == null ? null : Number(secondaryLoad)
  const secondaryWeighted = meta.secondaryType === 'rdl' || meta.secondaryType === 'dbrow' || meta.secondaryType === 'lunge'
  const secondaryDisplay = secondaryWeighted ? (secondaryNum != null && !Number.isNaN(secondaryNum) ? fmt(secondaryNum) : '—') : 'BW'
  const hasTop = hasWeight && top != null && !dipsBW
  const wu = hasTop && top != null ? warmupSets(top) : null
  const gsets = hasTop && top != null ? giantSets(top, difficulty) : null
  // Tiny dips build-up loads can round to 0 — that's bodyweight.
  const wuCell = (w: number): string => (w === 0 ? 'BW' : fmt(w))
  // Block letters: GiantFit = A Warm-Up · B Giant · C Volume · D Capacity ·
  // E Carry; legacy = A Warm-Up · B Giant · C Volume · D Carry.
  const giantLetter = 'B'
  const volLetter = 'C'
  const carryLetter = giantfit ? 'E' : 'D'

  // When locked (timer not started), the prescription is readable but inert.
  return (
    <div style={locked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      {/* Dips with a 0/empty anchor is bodyweight MODE, not missing data — no warning. */}
      {!hasWeight && !dipsBW && (
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
          <Row key={i} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={dipsBW ? 'BW' : wu ? wuCell(wu[i].weight) : '—'} cls={C.muted} />
        ))}
      </Card>

      {/* Giant Block */}
      <Card>
        {blockTitle(`${giantLetter}. Giant Block`, '4 rounds · 2 min')}
        {dipsBW ? (
          // Bodyweight-mode dips: no load ladder — cluster targets by difficulty.
          <Row a="Ring Dips" b={`${PULLUP[difficulty]} reps/round (clusters ok)`} c="BW" cls={C.gold} />
        ) : (
          SET_LADDER.map((p, i) => {
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
          })
        )}
        {giantfit ? (
          // GiantFit: the paired row rides the four rounds — unanchored, free
          // weight entry, no ladder. Squat trains alone (no pairing row).
          pairing && (
            <>
              <Row a={pairing} b="each round" c="" cls={C.off} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <label htmlFor="pair-weight" style={{ ...lbl, marginBottom: 0 }}>
                  {pairing} weight (kg)
                </label>
                <input
                  id="pair-weight"
                  data-pair-weight="1"
                  style={{ ...inp, padding: '6px', textAlign: 'center' }}
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  value={draft.pairWeight ?? ''}
                  onChange={(e) => setField('pairWeight', e.target.value)}
                />
              </div>
            </>
          )
        ) : (
          <>
            {pullupWeighted && pullupSets ? (
              // Weighted pull-ups: the full cascade across the four rounds, like a primary lift.
              <Row
                a="Pull-ups (wtd)"
                b={pullupSets.map((g) => `${g.reps}@${g.weight % 1 === 0 ? g.weight : g.weight.toFixed(1)}`).join(' · ')}
                c={fmt(pullupTop)}
                cls={C.off}
              />
            ) : (
              <Row a={meta.secondary} b={secondaryDesc(meta.secondaryType, difficulty)} c={secondaryDisplay} cls={secondaryWeighted ? C.off : C.muted} />
            )}
            <Row a={meta.core} b="10 reps" c="BW" cls={C.muted} />
            <Row a="Cardio" b="30 sec high effort" c="" cls={C.muted} />
            <CardioCals
              values={draft.cardioCals}
              onChange={(i, v) => setField('cardioCals', draft.cardioCals.map((x, idx) => (idx === i ? v : x)))}
            />
            {dipsBW && (
              <ClusterInput
                label={`Dips — final-round cluster (target ${PULLUP[difficulty]})`}
                dataAttr="dips-cluster"
                target={PULLUP[difficulty]}
                value={draft.dipsCluster}
                onChange={(v) => setField('dipsCluster', v)}
              />
            )}
            {/* Weight logging replaces cluster logging in weighted pull-up mode. */}
            {dayType === 'dips' && !pullupWeighted && (
              <ClusterInput
                label={`Pull-ups — final-round cluster (target ${PULLUP[difficulty]})`}
                dataAttr="pullup-cluster"
                target={PULLUP[difficulty]}
                value={draft.pullupCluster}
                onChange={(v) => setField('pullupCluster', v)}
              />
            )}
          </>
        )}
        <LogRpe label="Top set" rpe={draft.rpe} speed={draft.barSpeed} onRpe={(v) => setField('rpe', v)} onSpeed={(v) => setField('barSpeed', v)} />
        <BlockCompletion value={draft.blockCompletion} onChange={(v) => setField('blockCompletion', v)} />
      </Card>

      {/* Volume (not on deload) */}
      {!isDeload && (
        <Card>
          {blockTitle(`${volLetter}. Volume Block`, '2 sets · 80%')}
          {dayType === 'dips' ? (
            <Row a="Push-ups" b={`2 × ${scheme.vol} (BW — elbow protocol)`} c="BW" cls={C.blue} />
          ) : (
            <Row a={LIFT_LABEL[dayType]} b={`2 × ${scheme.vol} @ 80%`} c={hasTop && top != null ? fmt(volumeWeight(top)) : '—'} cls={C.blue} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 10 }}>
            <input type="checkbox" checked={draft.volDone} onChange={(e) => setField('volDone', e.target.checked)} /> Both sets
            completed
          </label>
          <LogRpe label="Volume" rpe={draft.volRpe} speed={draft.volSpeed} onRpe={(v) => setField('volRpe', v)} onSpeed={(v) => setField('volSpeed', v)} />
        </Card>
      )}

      {/* GiantFit capacity block (not on reactive-deload weeks — like volume/carry).
          Self-contained: prescription + stopwatch + its own save to capacity_logs. */}
      {giantfit && !isDeload && capacity && (
        <CapacityBlock
          letter="D"
          variant={capacity.variant}
          config={capacity.config}
          sessionId={draft.id}
          log={capacity.log}
          onSave={capacity.onSave}
          onDelete={capacity.onDelete}
        />
      )}

      {/* Carry (not on deload) */}
      {!isDeload && (
        <Card>
          {blockTitle(`${carryLetter}. Carry`, '10 min')}
          <Row a={meta.carry.name} b={`${meta.carry.sets} sets · ${meta.carry.dist}`} c={carryDisplay} cls={C.off} />
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
                    data-carry-rounds="1"
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
                    data-carry-distance="1"
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

// Giant Block adherence: top set keeps full RPE/speed; the rest of the block gets a
// one-tap "completed as prescribed" with a categorical reason dropdown when it wasn't.
// Any non-'completed' state drives the deload S6 signal. Exported: the testing-day
// view (TestingSession.tsx) reuses it so test sessions capture the same signal.
export function BlockCompletion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const completed = value === 'completed' || value === ''
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: completed ? C.green : C.off }}>
        <input type="checkbox" checked={completed} onChange={(e) => onChange(e.target.checked ? 'completed' : BLOCK_COMPLETION[0].id)} />
        Giant block completed as prescribed ✓
      </label>
      {!completed && (
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>What happened?</label>
          <select style={inp} value={value} onChange={(e) => onChange(e.target.value)}>
            {BLOCK_COMPLETION.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// Per-round Giant Block cardio calories — four small cells (R1..R4), matching the
// notebook habit of recording e.g. "15/14/15/15". Empty cells round-trip as NULL.
function CardioCals({ values, onChange }: { values: (number | string | null)[]; onChange: (i: number, v: string) => void }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <label style={lbl}>Cardio calories — per round</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            <input
              data-cardio-round={i + 1}
              aria-label={`Round ${i + 1} calories`}
              style={{ ...inp, textAlign: 'center' }}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder={`R${i + 1}`}
              value={values[i] ?? ''}
              onChange={(e) => onChange(i, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// Bodyweight-mode cluster input (pull-ups and dips share it). Logs the final Giant
// Block round's cluster, e.g. "6+4"; shows live total + unbroken/target feedback.
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
