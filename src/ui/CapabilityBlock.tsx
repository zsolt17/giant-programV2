// The Capability block — content changes by CYCLE (GIANT2_CAPABILITY_BY_CYCLE):
// Hypertrophy (C1, per-SET weight x reps), Oly (C2, per-exercise weight x
// quality mark), Carries (C3, reuses the session's own carry_* fields — no
// separate component, rendered inline in Giant2SessionForm). Both blocks here
// are self-contained: they own their fields and save through their own
// handler (one row per movement PER SET for Hypertrophy, one row per movement
// for Oly, batched under one Done button), so the parent's onSave only needs
// to ensure the session row exists first (FK). The card chrome (header, tag,
// collapse) is owned by the caller's SessionCard wrapper, not rendered here —
// these components render only their content + the Done button.
import { Fragment, useState } from 'react'
import { C, inp } from './theme'
import { errMsg, DoneButton } from './controls'
import { SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS, resolveItems, groupBySuperset } from '../engine/movements'
import { OLY_QUALITY, GIANT2_OLY_POSITION_WAVE, GIANT2_HYPERTROPHY_SETS, RPE_OPTIONS } from '../engine/constants'
import { isHypertrophyDone, isOlyDone } from '../engine/session-progress'
import type { Movement } from '../engine/movements'
import type { Lift, HypertrophyLog, HypertrophyLogDraft, OlyLog, OlyLogDraft } from '../engine/types'

const SET_NUMBERS = Array.from({ length: GIANT2_HYPERTROPHY_SETS }, (_, i) => i + 1)

interface HypertrophyBlockProps {
  dayType: Lift
  sessionId: string
  movements: Movement[]
  logs: HypertrophyLog[] // this session's existing logs only (parent filters)
  onSave: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
  onDone?: () => void
}

// Local per-item state: set number -> {weight, reps, rpe}. RPE is optional —
// it's saved like every other field but deliberately left out of the
// Done-readiness check (isHypertrophyDone), same as it's out of scope for
// reps/load's weight-optional exemption logic.
type HypertrophyRows = Record<string, Record<number, { weight: number | string; reps: number | string; rpe: string }>>

export function HypertrophyBlock({ dayType, sessionId, movements, logs, onSave, onDone }: HypertrophyBlockProps) {
  const items = resolveItems(SEED_HYPERTROPHY_KEYS[dayType] || [], movements)
  const [rows, setRows] = useState<HypertrophyRows>(() =>
    Object.fromEntries(
      items.map((it) => [
        it.key,
        Object.fromEntries(
          SET_NUMBERS.map((setNumber) => {
            const existing = it.movementId ? logs.find((l) => l.movementId === it.movementId && l.setNumber === setNumber) : undefined
            return [setNumber, { weight: existing?.weight ?? '', reps: existing?.repsDone ?? it.seed?.defaultReps ?? '', rpe: existing?.rpe ?? '' }]
          })
        ),
      ])
    )
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setCell = (key: string, setNumber: number, field: 'weight' | 'reps' | 'rpe', v: string) =>
    setRows((p) => ({ ...p, [key]: { ...p[key], [setNumber]: { ...p[key][setNumber], [field]: v } } }))
  const groups = groupBySuperset(items)

  // Re-derive the same shared completeness check the SessionCard uses to gate
  // its own rendering, off the CURRENT (unsaved) local state — so the button
  // enables the instant the last required field is filled, not only after a
  // save round-trip. RPE is intentionally NOT part of this check.
  const draftLogs: HypertrophyLog[] = items.flatMap((it) =>
    it.movementId
      ? SET_NUMBERS.map((setNumber) => {
          const cell = rows[it.key]?.[setNumber]
          return {
            sessionId,
            movementId: it.movementId!,
            setNumber,
            weight: cell?.weight === '' || cell?.weight == null ? null : Number(cell.weight),
            repsDone: cell?.reps === '' || cell?.reps == null ? null : Number(cell.reps),
            rpe: cell?.rpe ?? '',
            notes: '',
          }
        })
      : []
  )
  const readyForDone = isHypertrophyDone(dayType, movements, draftLogs)

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await Promise.all(
        items
          .filter((it) => it.movementId)
          .flatMap((it) =>
            SET_NUMBERS.map((setNumber) =>
              onSave({
                sessionId,
                movementId: it.movementId!,
                setNumber,
                weight: rows[it.key][setNumber].weight,
                repsDone: rows[it.key][setNumber].reps,
                rpe: rows[it.key][setNumber].rpe,
                notes: '',
              })
            )
          )
      )
      onDone?.()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {groups.map((group) => {
        const rowsEls = group.map((it, i) => (
          <div key={it.key} style={{ padding: '8px 0', borderBottom: group.length > 1 && i < group.length - 1 ? `1px dashed ${C.border}` : '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 13, color: C.off, marginBottom: 6 }}>
              {it.seed?.name}
              {it.seed?.note && <span style={{ fontSize: 10, color: C.muted }}> · {it.seed.note}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 58px', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Set</span>
              <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Reps</span>
              <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Load</span>
              <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>RPE</span>
              {SET_NUMBERS.map((setNumber) => (
                <Fragment key={setNumber}>
                  <span style={{ fontSize: 12, color: C.muted }}>{setNumber}</span>
                  <input
                    aria-label={`${it.seed?.name} set ${setNumber} reps`}
                    style={{ ...inp, padding: '6px', textAlign: 'center' }}
                    type="number"
                    step="1"
                    inputMode="numeric"
                    placeholder="reps"
                    value={rows[it.key]?.[setNumber]?.reps ?? ''}
                    onChange={(e) => setCell(it.key, setNumber, 'reps', e.target.value)}
                  />
                  <input
                    aria-label={`${it.seed?.name} set ${setNumber} load (kg)${it.seed?.weightOptional ? ' — optional' : ''}`}
                    style={{ ...inp, padding: '6px', textAlign: 'center' }}
                    type="number"
                    step="2.5"
                    inputMode="decimal"
                    placeholder={it.seed?.weightOptional ? 'optional' : 'kg'}
                    value={rows[it.key]?.[setNumber]?.weight ?? ''}
                    onChange={(e) => setCell(it.key, setNumber, 'weight', e.target.value)}
                  />
                  <select
                    aria-label={`${it.seed?.name} set ${setNumber} RPE (optional)`}
                    style={{ ...inp, padding: '6px 2px', textAlign: 'center', fontSize: 11 }}
                    value={rows[it.key]?.[setNumber]?.rpe ?? ''}
                    onChange={(e) => setCell(it.key, setNumber, 'rpe', e.target.value)}
                  >
                    <option value="">–</option>
                    {RPE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Fragment>
              ))}
            </div>
          </div>
        ))
        if (group.length === 1) return rowsEls
        return (
          <div key={group[0].key} style={{ borderLeft: `2px solid ${C.gold}`, paddingLeft: 8, marginBottom: 2 }}>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 0' }}>Superset — alternate</div>
            {rowsEls}
          </div>
        )
      })}
      <DoneButton ready={readyForDone} saving={saving} onClick={save} />
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}</div>}
    </div>
  )
}

interface OlyBlockProps {
  dayType: Lift
  weekInCycle: number // 1-4 — drives the position-wave guidance text
  sessionId: string
  movements: Movement[]
  logs: OlyLog[] // this session's existing logs only (parent filters)
  onSave: (log: OlyLogDraft) => Promise<OlyLog>
  onDone?: () => void
}

export function OlyBlock({ dayType, weekInCycle, sessionId, movements, logs, onSave, onDone }: OlyBlockProps) {
  const items = resolveItems(SEED_OLY_KEYS[dayType] || [], movements)
  const [rows, setRows] = useState<Record<string, { weight: number | string; quality: string }>>(() =>
    Object.fromEntries(
      items.map((it) => {
        const existing = it.movementId ? logs.find((l) => l.movementId === it.movementId) : undefined
        return [it.key, { weight: existing?.weight ?? '', quality: existing?.quality ?? '' }]
      })
    )
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setWeight = (key: string, v: string) => setRows((p) => ({ ...p, [key]: { ...p[key], weight: v } }))
  const setQuality = (key: string, v: string) => setRows((p) => ({ ...p, [key]: { ...p[key], quality: p[key]?.quality === v ? '' : v } }))

  const draftLogs: OlyLog[] = items
    .filter((it) => it.movementId)
    .map((it) => ({ sessionId, movementId: it.movementId!, weight: null, quality: rows[it.key]?.quality ?? '', notes: '' }))
  const readyForDone = isOlyDone(dayType, movements, draftLogs)

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await Promise.all(
        items
          .filter((it) => it.movementId)
          .map((it) => onSave({ sessionId, movementId: it.movementId!, weight: rows[it.key].weight, quality: rows[it.key].quality, notes: '' }))
      )
      onDone?.()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 10 }}>{GIANT2_OLY_POSITION_WAVE[weekInCycle]}</div>
      {items.map((it) => (
        <div key={it.key} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: C.off }}>
              {it.seed?.name}
              {it.seed?.note && <span style={{ fontSize: 10, color: C.muted }}> · {it.seed.note}</span>}
            </span>
            <input
              aria-label={`${it.seed?.name} weight (kg)`}
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="2.5"
              inputMode="decimal"
              placeholder="kg"
              value={rows[it.key]?.weight ?? ''}
              onChange={(e) => setWeight(it.key, e.target.value)}
            />
          </div>
          <div role="group" aria-label={`${it.seed?.name} quality`} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {OLY_QUALITY.map((q) => (
              <button
                key={q.id}
                onClick={() => setQuality(it.key, q.id)}
                aria-pressed={rows[it.key]?.quality === q.id}
                title={q.label}
                style={{
                  flex: 1,
                  background: rows[it.key]?.quality === q.id ? C.gold : 'transparent',
                  color: rows[it.key]?.quality === q.id ? C.dark : C.muted,
                  border: `1px solid ${C.border}`,
                  borderRadius: 2,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '6px 4px',
                  cursor: 'pointer',
                }}
              >
                {q.id}
              </button>
            ))}
          </div>
        </div>
      ))}
      <DoneButton ready={readyForDone} saving={saving} onClick={save} />
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}</div>}
    </div>
  )
}
