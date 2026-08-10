// The Giant 2.0 session view — Primer -> Giant -> Volume -> Capability, each
// rendered as an independent expand/collapse SessionCard. Capability content
// is dispatched by CYCLE (Hypertrophy C1 / Oly C2 / Carries C3,
// capabilityProgramFor) — null on deload (cycle unset).
//
// Two ways this form is used (see `sequential` below):
//  - Today (sequential=true): pre-start every card renders expanded+locked;
//    Start Session collapses all four, auto-expands Primer, and completing a
//    card (Done) auto-expands the next one in sequence. A completed card can
//    still be tapped to reopen (peek-and-fix) without disturbing whichever
//    card is currently active further down the sequence.
//  - Calendar's SessionModal (sequential=false): no lock/sequence concept at
//    all (logging isn't a live timed session there) — every card starts
//    expanded and each header freely toggles open/closed regardless of its
//    done state.
import { useEffect, useState } from 'react'
import { C, inp, lbl } from './theme'
import { Card } from './components'
import { Row, LogRpe, DoneButton } from './controls'
import { HypertrophyBlock, OlyBlock } from './CapabilityBlock'
import { BlockCompletion as BlockCompletionPick } from './SessionForm'
import { SessionCard } from './SessionCard'
import type { CardStatus } from './SessionCard'
import {
  SCHEMES,
  WU_PCT,
  WU_REPS,
  SET_LADDER,
  LIFT_LABEL,
  PULLUP,
  SECONDARY_REPS,
  GIANT2_ROPE_FLOW,
  GIANT2_PRIMER_BAND,
  GIANT2_PRIMER_RAMP,
  GIANT2_PRIMER_RAMP_ROUNDS,
  GIANT2_SECONDARY,
  GB_ACCESSORY,
  GIANT2_DAY_TYPE,
  GIANT2_CARRY_RPE_GUIDANCE,
  DAY_META,
} from '../engine/constants'
import { fmt, giantSets, warmupSets, volumeWeight, deloadTop, liftMode } from '../engine/loading'
import { clusterTotal, isUnbroken, meetsTarget } from '../engine/pullups'
import { capabilityProgramFor } from '../engine/date-engine'
import { isPrimerDone, isGiantDone, isVolumeDone, isCarriesDone, isHypertrophyDone, isOlyDone } from '../engine/session-progress'
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
  // Persist the current draft (optionally patched) as a card is marked Done.
  // Cards whose fields are already bound to `draft` via setField need no
  // patch — Primer needs one (primerDone isn't set until Done is pressed).
  onSaveCard: (patch?: Partial<SessionDraft>) => Promise<void>
  // true (Today): pre-start lock + sequential auto-advance. false (Calendar's
  // SessionModal): no lock, every card starts expanded and freely toggles.
  sequential?: boolean
  // Drives the Giant/Volume/Carries Done buttons' "Saving…" state (Primer and
  // the Capability sub-blocks track their own save in progress locally).
  saving?: boolean
  // The db_row/pendlay_row lane's per-cycle cell — BB Row (OHP) or Pull-ups
  // (bench, two-mode). null on Squat/Deadlift (train alone) or when unset.
  secondaryCell?: LiftWeights | null
  // Giant Block accessory rep targets from Setup (defaults merged in — mappers.ts).
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

type CardId = 'primer' | 'giant' | 'volume' | 'capability'

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
  onSaveCard,
  sequential = true,
  saving = false,
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
  const secReps = SECONDARY_REPS[difficulty]
  const secVolBase = secondary && secondaryWeighted && volumeDifficulty ? secondaryCell?.[volumeDifficulty] ?? null : null
  const needsCluster = secondaryIsTwoMode && !secondaryWeighted

  const gbAcc = GB_ACCESSORY[dayType]
  const gbAccReps = gbAcc ? giantAccessory?.[gbAcc.key] ?? gbAcc.reps : null

  const volScheme = volumeDifficulty ? SCHEMES[volumeDifficulty] : null
  const showVolume = !isDeload && !!volumeDifficulty && !!volScheme
  const showCapability = !isDeload && !!capabilityProgram

  // ---- card sequence + done/open state --------------------------------------
  const cards: CardId[] = ['primer', 'giant']
  if (showVolume) cards.push('volume')
  if (showCapability) cards.push('capability')

  const capabilityDone = !showCapability
    ? true
    : capabilityProgram === 'hypertrophy' && capability
    ? isHypertrophyDone(dayType, capability.movements, capability.hypertrophyLogs)
    : capabilityProgram === 'oly' && capability
    ? isOlyDone(dayType, capability.movements, capability.olyLogs)
    : capabilityProgram === 'carries'
    ? isCarriesDone(draft)
    : true

  const doneMap: Record<CardId, boolean> = {
    primer: isPrimerDone(draft),
    giant: isGiantDone(draft, needsCluster),
    volume: showVolume ? isVolumeDone(draft) : true,
    capability: capabilityDone,
  }
  const firstNotDone = cards.find((id) => !doneMap[id]) ?? null

  // Sequential mode: which DONE card (if any) is reopened for peek-and-fix —
  // independent of the sequence pointer, so it never disturbs the active card.
  const [peekCard, setPeekCard] = useState<CardId | null>(null)
  // Free mode (Calendar): every card's own open/closed toggle, all start open.
  const [openMap, setOpenMap] = useState<Record<CardId, boolean>>(() => ({ primer: true, giant: true, volume: true, capability: true }))
  useEffect(() => {
    setPeekCard(null)
    setOpenMap({ primer: true, giant: true, volume: true, capability: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id])

  function statusFor(id: CardId): CardStatus {
    if (!sequential) return doneMap[id] ? 'done' : 'active'
    if (locked) return 'locked'
    if (doneMap[id]) return 'done'
    if (id === firstNotDone) return 'active'
    return 'pending'
  }
  function expandedFor(id: CardId): boolean {
    if (!sequential) return openMap[id] ?? true
    const s = statusFor(id)
    if (s === 'locked' || s === 'active') return true
    return s === 'done' && peekCard === id
  }
  function onHeaderClick(id: CardId): (() => void) | undefined {
    if (!sequential) return () => setOpenMap((p) => ({ ...p, [id]: !p[id] }))
    if (statusFor(id) !== 'done') return undefined
    return () => setPeekCard((p) => (p === id ? null : id))
  }
  // After a successful Done save: free mode collapses that card outright.
  // Sequential mode's expand/collapse is otherwise fully derived from
  // doneMap/firstNotDone — the one thing that ISN'T derived is a peeked
  // (reopened) card, which needs its own explicit clear so pressing Done a
  // second time on an already-done card actually re-collapses it.
  function closeAfterDone(id: CardId) {
    if (!sequential) {
      setOpenMap((p) => ({ ...p, [id]: false }))
      return
    }
    setPeekCard((p) => (p === id ? null : p))
  }
  // Only collapses on a SUCCESSFUL save — onSaveCard rethrows on failure (see
  // Today.tsx/SessionModal.tsx), so a failed Done leaves the card open with
  // its edit intact instead of collapsing over a silently-lost write.
  async function handleCardDone(id: CardId, patch?: Partial<SessionDraft>) {
    try {
      await onSaveCard(patch)
      closeAfterDone(id)
    } catch {
      // already surfaced via the page's own inline error banner
    }
  }

  return (
    <div>
      {!hasWeight && (
        <Card style={locked ? { border: `1px solid ${C.red}`, opacity: 0.5, pointerEvents: 'none' } : { border: `1px solid ${C.red}` }}>
          <div style={{ fontSize: 13, color: C.red, lineHeight: 1.5 }}>
            No working weight set for <strong>{LIFT_LABEL[dayType]} · {difficulty}</strong> in Cycle {draft.cycle}. Enter it
            in Setup and the prescription will fill in. You can still log RPE / bar speed below.
          </div>
        </Card>
      )}

      {/* A. Primer — checklist, no load/RPE. */}
      <SessionCard letter="A" title="Primer" tag="warm-up" status={statusFor('primer')} expanded={expandedFor('primer')} onHeaderClick={onHeaderClick('primer')}>
        <PrimerContent
          band={band}
          ramp={ramp}
          wu={wu}
          secondary={secondary}
          secondaryWeighted={secondaryWeighted}
          secWu={secWu}
          initiallyDone={draft.primerDone}
          onDone={() => handleCardDone('primer', { primerDone: true })}
        />
      </SessionCard>

      {/* B. Giant Block */}
      <SessionCard letter="B" title="Giant" context={LIFT_LABEL[dayType]} tag="4 rounds" status={statusFor('giant')} expanded={expandedFor('giant')} onHeaderClick={onHeaderClick('giant')}>
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
        <BlockCompletionPick value={draft.blockCompletion} onChange={(v) => setField('blockCompletion', v)} />
        {needsCluster && (
          <ClusterInput
            label={`${secondary!.name} — final-round cluster (target ${PULLUP[difficulty]})`}
            dataAttr="pullup-cluster"
            target={PULLUP[difficulty]}
            value={draft.pullupCluster}
            onChange={(v) => setField('pullupCluster', v)}
          />
        )}
        <DoneButton ready={doneMap.giant} saving={saving} onClick={() => handleCardDone('giant')} />
      </SessionCard>

      {/* C. Volume Block — independent difficulty from the Giant block's;
          null (C3 week 4) means it doesn't run at all that week. Also off on
          ANY deload — scheduled (volumeDifficulty is already null then) or
          reactive mid-cycle. */}
      {showVolume && (
        <SessionCard letter="C" title="Volume" context={LIFT_LABEL[dayType]} tag={`2 sets · 80% · ${volumeDifficulty}`} status={statusFor('volume')} expanded={expandedFor('volume')} onHeaderClick={onHeaderClick('volume')}>
          <Row a={LIFT_LABEL[dayType]} b={`2 × ${volScheme!.vol} @ 80%`} c={volumeTop != null ? fmt(volumeWeight(volumeTop)) : '—'} cls={C.blue} />
          {secondary &&
            (secondaryWeighted ? (
              <Row a={secondary.name} b={`2 × ${volScheme!.vol} @ 80%`} c={secVolBase != null ? fmt(volumeWeight(secVolBase)) : '—'} cls={C.blue} />
            ) : (
              // Bodyweight-mode pull-ups: prescription only — a separate Volume-
              // block cluster log (distinct from the Giant block's) is a
              // possible future refinement, not built here (2026-08-09).
              <Row a={secondary.name} b={`2 × ${volScheme!.vol} (BW)`} c="BW" cls={C.blue} />
            ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 10 }}>
            <input type="checkbox" checked={draft.volDone} onChange={(e) => setField('volDone', e.target.checked)} /> Both sets
            completed
          </label>
          <LogRpe label="Volume" rpe={draft.volRpe} speed={draft.volSpeed} onRpe={(v) => setField('volRpe', v)} onSpeed={(v) => setField('volSpeed', v)} />
          <DoneButton ready={doneMap.volume} saving={saving} onClick={() => handleCardDone('volume')} />
        </SessionCard>
      )}

      {/* D. Capability — content dispatched by CYCLE, not week or session
          (GIANT2_CAPABILITY_BY_CYCLE). Absent on any deload (cycle is null on
          the scheduled one; isDeload gates the reactive mid-cycle case too). */}
      {showCapability && (
        <SessionCard
          letter="D"
          title={capabilityProgram === 'hypertrophy' ? 'Hypertrophy' : capabilityProgram === 'oly' ? 'Oly' : 'Carry'}
          tag={capabilityProgram === 'hypertrophy' ? '3 sets' : capabilityProgram === 'oly' ? 'technical work' : '10 min'}
          status={statusFor('capability')}
          expanded={expandedFor('capability')}
          onHeaderClick={onHeaderClick('capability')}
        >
          {capabilityProgram === 'hypertrophy' && capability && (
            <HypertrophyBlock
              dayType={dayType}
              sessionId={draft.id}
              movements={capability.movements}
              logs={capability.hypertrophyLogs}
              onSave={capability.onSaveHypertrophyLog}
              onDone={() => closeAfterDone('capability')}
            />
          )}
          {capabilityProgram === 'oly' && capability && (
            <OlyBlock
              dayType={dayType}
              weekInCycle={weekInCycle ?? 1}
              sessionId={draft.id}
              movements={capability.movements}
              logs={capability.olyLogs}
              onSave={capability.onSaveOlyLog}
              onDone={() => closeAfterDone('capability')}
            />
          )}
          {capabilityProgram === 'carries' && (
            <>
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
              <DoneButton ready={doneMap.capability} saving={saving} onClick={() => handleCardDone('capability')} />
            </>
          )}
        </SessionCard>
      )}

      {/* Notes — always visible, not part of the card sequence. */}
      <Card style={locked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
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

// ---- Primer: checklist content ---------------------------------------------
// No load, no RPE — the block is checkbox-style. Which items are individually
// checked is local, UI-only state (never persisted); primerDone (a single
// flag) is the only thing Done actually saves. Reopening a done Primer starts
// every item pre-checked (we know they must all have been checked to get
// here) rather than trying to recall which ones — nothing meaningful to
// "fix" per-item on this block anyway.
function PrimerContent({
  band,
  ramp,
  wu,
  secondary,
  secondaryWeighted,
  secWu,
  initiallyDone,
  onDone,
}: {
  band: { name: string; dose: string }
  ramp: string[]
  wu: { weight: number }[] | null
  secondary?: { key: string; name: string }
  secondaryWeighted: boolean
  secWu: { weight: number }[] | null
  initiallyDone: boolean
  onDone: () => Promise<void>
}) {
  const items = [
    GIANT2_ROPE_FLOW.name,
    band.name,
    ...ramp,
    'Barbell build-up',
    ...(secondary && secondaryWeighted ? [`${secondary.name} build-up`] : []),
  ]
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((id) => [id, initiallyDone])))
  const [saving, setSaving] = useState(false)
  const allChecked = items.every((id) => checked[id])
  const toggle = (id: string) => setChecked((p) => ({ ...p, [id]: !p[id] }))

  async function handleDone() {
    setSaving(true)
    try {
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Row a={GIANT2_ROPE_FLOW.name} b={GIANT2_ROPE_FLOW.dose} c={<input type="checkbox" aria-label={`${GIANT2_ROPE_FLOW.name} done`} checked={!!checked[GIANT2_ROPE_FLOW.name]} onChange={() => toggle(GIANT2_ROPE_FLOW.name)} />} cls={C.muted} />
      <Row a={band.name} b={band.dose} c={<input type="checkbox" aria-label={`${band.name} done`} checked={!!checked[band.name]} onChange={() => toggle(band.name)} />} cls={C.muted} />
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>
        Bodyweight ramp — {GIANT2_PRIMER_RAMP_ROUNDS.join('-')}, 10 minutes:
      </div>
      {ramp.map((name) => (
        <Row key={name} a={name} b="" c={<input type="checkbox" aria-label={`${name} done`} checked={!!checked[name]} onChange={() => toggle(name)} />} cls={C.muted} />
      ))}
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>Then barbell build-up:</div>
      {WU_PCT.map((p, i) => (
        <Row key={i} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={wu ? wuCell(wu[i].weight) : '—'} cls={C.muted} />
      ))}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: checked['Barbell build-up'] ? C.green : C.off, marginTop: 6 }}>
        <input type="checkbox" checked={!!checked['Barbell build-up']} onChange={() => toggle('Barbell build-up')} /> Barbell build-up done
      </label>
      {secondary && secondaryWeighted && (
        <>
          <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', margin: '8px 0' }}>Then {secondary.name} build-up:</div>
          {WU_PCT.map((p, i) => (
            <Row key={`sec-${i}`} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={secWu ? wuCell(secWu[i].weight) : '—'} cls={C.muted} />
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: checked[`${secondary.name} build-up`] ? C.green : C.off, marginTop: 6 }}>
            <input type="checkbox" checked={!!checked[`${secondary.name} build-up`]} onChange={() => toggle(`${secondary.name} build-up`)} /> {secondary.name} build-up done
          </label>
        </>
      )}
      <DoneButton ready={allChecked} saving={saving} onClick={handleDone} />
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
