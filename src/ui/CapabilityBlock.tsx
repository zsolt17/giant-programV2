// The Capability block — content changes by CYCLE (GIANT2_CAPABILITY_BY_CYCLE):
// Hypertrophy (C1, per-exercise weight x reps), Oly (C2, per-exercise weight x
// quality mark), Carries (C3, reuses the session's own carry_* fields — no
// separate component, rendered inline in Giant2SessionForm). Both blocks here
// are self-contained: they own their fields and save through their own
// handler (one row PER MOVEMENT, batched under one Save), so the parent's
// onSave only needs to ensure the session row exists first (FK).
import { useState } from 'react'
import { C, inp } from './theme'
import { Card } from './components'
import { blockTitle, errMsg } from './controls'
import { SEED_HYPERTROPHY_KEYS, SEED_OLY_KEYS, seedByKey } from '../engine/movements'
import { OLY_QUALITY, GIANT2_OLY_POSITION_WAVE, GIANT2_HYPERTROPHY_SETS } from '../engine/constants'
import type { Movement } from '../engine/movements'
import type { Lift, HypertrophyLog, HypertrophyLogDraft, OlyLog, OlyLogDraft } from '../engine/types'

// One movement key resolved against the athlete's library — the display
// content (name/reps/note) comes from the code-side seed (seedByKey), the
// identity (movementId, for the FK) from the athlete's own library.
function resolveItems(keys: string[], movements: Movement[]) {
  return keys.map((key) => ({ key, seed: seedByKey(key), movementId: movements.find((m) => m.key === key)?.id }))
}

type ResolvedItem = ReturnType<typeof resolveItems>[number]

// Clusters adjacent items sharing a non-null supersetGroup into a pair
// (alternate between them); everything else stays standalone. Movements that
// pair are always adjacent in the seed key order, so a single linear pass
// is enough — no need to search the whole list for a matching group.
function groupBySuperset(items: ResolvedItem[]): ResolvedItem[][] {
  const groups: ResolvedItem[][] = []
  for (let i = 0; i < items.length; i++) {
    const cur = items[i]
    const next = items[i + 1]
    if (cur.seed?.supersetGroup && next?.seed?.supersetGroup === cur.seed.supersetGroup) {
      groups.push([cur, next])
      i++
    } else {
      groups.push([cur])
    }
  }
  return groups
}

interface HypertrophyBlockProps {
  letter: string
  dayType: Lift
  sessionId: string
  movements: Movement[]
  logs: HypertrophyLog[] // this session's existing logs only (parent filters)
  onSave: (log: HypertrophyLogDraft) => Promise<HypertrophyLog>
}

export function HypertrophyBlock({ letter, dayType, sessionId, movements, logs, onSave }: HypertrophyBlockProps) {
  const items = resolveItems(SEED_HYPERTROPHY_KEYS[dayType] || [], movements)
  const [rows, setRows] = useState<Record<string, { weight: number | string; reps: number | string }>>(() =>
    Object.fromEntries(
      items.map((it) => {
        const existing = it.movementId ? logs.find((l) => l.movementId === it.movementId) : undefined
        return [it.key, { weight: existing?.weight ?? '', reps: existing?.repsDone ?? it.seed?.defaultReps ?? '' }]
      })
    )
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const setRow = (key: string, field: 'weight' | 'reps', v: string) => setRows((p) => ({ ...p, [key]: { ...p[key], [field]: v } }))
  const groups = groupBySuperset(items)

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await Promise.all(
        items
          .filter((it) => it.movementId)
          .map((it) =>
            onSave({ sessionId, movementId: it.movementId!, weight: rows[it.key].weight, repsDone: rows[it.key].reps, notes: '' })
          )
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      {blockTitle(`${letter}. Hypertrophy`, `${GIANT2_HYPERTROPHY_SETS} sets`)}
      {groups.map((group) => {
        const rowsEls = group.map((it, i) => (
          <div
            key={it.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 64px 56px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: group.length > 1 && i < group.length - 1 ? `1px dashed ${C.border}` : '1px solid rgba(255,255,255,0.04)',
            }}
          >
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
              onChange={(e) => setRow(it.key, 'weight', e.target.value)}
            />
            <input
              aria-label={`${it.seed?.name} reps`}
              style={{ ...inp, padding: '6px', textAlign: 'center' }}
              type="number"
              step="1"
              inputMode="numeric"
              placeholder="reps"
              value={rows[it.key]?.reps ?? ''}
              onChange={(e) => setRow(it.key, 'reps', e.target.value)}
            />
          </div>
        ))
        if (group.length === 1) return rowsEls
        return (
          <div
            key={group[0].key}
            style={{ borderLeft: `2px solid ${C.gold}`, paddingLeft: 8, marginBottom: 2 }}
          >
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 0' }}>
              Superset — alternate
            </div>
            {rowsEls}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            background: saved ? C.green : 'transparent',
            color: saved ? C.dark : C.gold,
            border: `1px solid ${saved ? C.green : C.gold}`,
            borderRadius: 2,
            padding: 10,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Hypertrophy'}
        </button>
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}</div>}
    </Card>
  )
}

interface OlyBlockProps {
  letter: string
  dayType: Lift
  weekInCycle: number // 1-4 — drives the position-wave guidance text
  sessionId: string
  movements: Movement[]
  logs: OlyLog[] // this session's existing logs only (parent filters)
  onSave: (log: OlyLogDraft) => Promise<OlyLog>
}

export function OlyBlock({ letter, dayType, weekInCycle, sessionId, movements, logs, onSave }: OlyBlockProps) {
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
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const setWeight = (key: string, v: string) => setRows((p) => ({ ...p, [key]: { ...p[key], weight: v } }))
  const setQuality = (key: string, v: string) => setRows((p) => ({ ...p, [key]: { ...p[key], quality: p[key]?.quality === v ? '' : v } }))

  async function save() {
    setSaving(true)
    setErr('')
    try {
      await Promise.all(
        items
          .filter((it) => it.movementId)
          .map((it) => onSave({ sessionId, movementId: it.movementId!, weight: rows[it.key].weight, quality: rows[it.key].quality, notes: '' }))
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      {blockTitle(`${letter}. Oly`, 'technical work')}
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
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: 1,
            background: saved ? C.green : 'transparent',
            color: saved ? C.dark : C.gold,
            border: `1px solid ${saved ? C.green : C.gold}`,
            borderRadius: 2,
            padding: 10,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Oly'}
        </button>
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save — {err}</div>}
    </Card>
  )
}
