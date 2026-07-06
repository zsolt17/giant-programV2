import { useState, useEffect } from 'react'
import { C, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row, LogRpe, speedArrow, errMsg } from './controls'
import { LIFT_LABEL, SCHEMES, WU_PCT, WU_REPS, SET_LADDER } from '../engine/constants'
import { fmt, warmupSets, giantSets, volumeWeight, testCeiling } from '../engine/loading'
import type { Lift, TestingResult } from '../engine/types'

// Number-input value -> number | null ('' and blanks become null, like the
// mappers' toNum). Keeps weight and reps consistent on the way to the DB.
const numOrNull = (v: number | string): number | null => (v === '' || v == null ? null : Number(v))

interface TestingResultFormProps {
  macroId: string
  lift: string
  testedOn: string
  results: TestingResult[]
  onSave: (r: TestingResult) => Promise<TestingResult>
  onDelete?: (id: string) => void
}

// Records a testing-week result (recorded, not prescribed): the discovered clean
// 2–3RM with 1 rep in reserve. Saved to testing_results, one per lift per macro.
export function TestingResultForm({ macroId, lift, testedOn, results, onSave, onDelete }: TestingResultFormProps) {
  const existing = results.find((r) => r.lift === lift) || null
  const [weight, setWeight] = useState<number | string>(existing?.weight ?? '')
  const [reps, setReps] = useState<number | string>(existing?.reps ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Re-sync when the target lift/result changes (e.g. switching calendar cells).
  useEffect(() => {
    setWeight(existing?.weight ?? '')
    setReps(existing?.reps ?? '')
    setNotes(existing?.notes ?? '')
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, existing?.id])

  const [err, setErr] = useState('')
  async function save() {
    setSaving(true)
    setErr('')
    try {
      await onSave({ id: existing?.id, macroId, lift, weight: numOrNull(weight), reps: numOrNull(reps), notes, testedOn })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card style={{ border: `1px solid ${C.gold}` }}>
      {blockTitle('Test Result', LIFT_LABEL[lift as Lift] || lift)}
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
        Warm-up → Giant Block (hard scheme) → Volume Block — no carry. Find a clean 2–3RM with 1 rep in reserve; no grinders.
        Record what you hit (not a target).
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Weight (kg)</label>
          <input style={inp} type="number" step="2.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Reps</label>
          <input style={inp} type="number" min="1" max="5" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="2–3" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bar speed, how it felt, 1 RIR?" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ flex: 1, background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : existing ? 'Update result' : 'Record result'}
        </button>
        {existing && onDelete && existing.id && (
          <button onClick={() => onDelete(existing.id as string)} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '12px 16px', fontSize: 13, cursor: 'pointer' }}>
            Delete
          </button>
        )}
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>}
    </Card>
  )
}

// Strip a previously-appended "Vol: …" suffix so a re-save doesn't stack them.
function stripVolNote(notes: string): string {
  return notes.replace(/(?:\s*·\s*)?Vol:[^·]*$/, '').trim()
}

interface TestingSessionViewProps extends TestingResultFormProps {
  lift: Lift
  // The C3 Hard anchor for the test lift (exact — never rounded). null/0 = no
  // usable anchor (e.g. bodyweight-mode dips): computed loads degrade to "—".
  c3Hard: number | null
}

// Full-structure test day (Today tab): renders like a normal HARD day computed
// off the C3 Hard anchor — warm-up build-up, Giant Block sets 1–3 prescribed,
// Set 4 as the open test-recording field, normal volume, no carry. All loads
// come from the loading engine at the lift's own rounding increment.
export function TestingSessionView({ macroId, lift, c3Hard, testedOn, results, onSave, onDelete }: TestingSessionViewProps) {
  const existing = results.find((r) => r.lift === lift) || null
  const [weight, setWeight] = useState<number | string>(existing?.weight ?? '')
  const [reps, setReps] = useState<number | string>(existing?.reps ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [volRpe, setVolRpe] = useState('')
  const [volSpeed, setVolSpeed] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  // Re-sync when the target lift/result changes (the two test days differ).
  useEffect(() => {
    setWeight(existing?.weight ?? '')
    setReps(existing?.reps ?? '')
    setNotes(existing?.notes ?? '')
    setVolRpe('')
    setVolSpeed('')
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, existing?.id])

  const hasAnchor = c3Hard != null && c3Hard > 0
  const scheme = SCHEMES.hard
  const wu = hasAnchor ? warmupSets(c3Hard, lift) : null
  const gsets = hasAnchor ? giantSets(c3Hard, 'hard', lift) : null
  const wuCell = (w: number): string => (w === 0 ? 'BW' : fmt(w))

  async function save() {
    setSaving(true)
    setErr('')
    try {
      // Volume RPE/speed persist inside the result notes (testing_results has no
      // structured fields for them) — replace any prior "Vol:" suffix, don't stack.
      const volNote = volRpe || volSpeed ? `Vol: ${volRpe}${volSpeed ? speedArrow(volSpeed) : ''}` : ''
      const finalNotes = volNote ? [stripVolNote(notes), volNote].filter(Boolean).join(' · ') : notes
      await onSave({ id: existing?.id, macroId, lift, weight: numOrNull(weight), reps: numOrNull(reps), notes: finalNotes, testedOn })
      setNotes(finalNotes)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* A. Warm-up — exactly a hard day's build-up off the C3 anchor */}
      <Card>
        {blockTitle('A. Warm-Up', 'GOWOD + build-up')}
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 8 }}>
          GOWOD Activate flow (3/6/10 min) — then barbell build-up:
        </div>
        {WU_PCT.map((p, i) => (
          <Row key={i} a={`WU${i + 1}`} b={`${WU_REPS[i]} reps @ ~${Math.round(p * 100)}%`} c={wu ? wuCell(wu[i].weight) : '—'} cls={C.muted} />
        ))}
      </Card>

      {/* B. Giant Block — sets 1–3 prescribed off the C3 anchor; set 4 = the test */}
      <Card style={{ border: `1px solid ${C.gold}` }}>
        {blockTitle('B. Giant Block', `test · ${LIFT_LABEL[lift]}`)}
        {SET_LADDER.slice(0, 3).map((p, i) => (
          <Row key={i} a={`Set ${i + 1}`} b={`${scheme.sets[i]} reps @ ${Math.round(p * 100)}%`} c={gsets ? fmt(gsets[i].weight) : '—'} cls={C.off} />
        ))}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.gold, paddingBottom: 9, whiteSpace: 'nowrap' }}>Set 4 — TEST</span>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Weight (kg)</label>
            <input style={inp} type="number" step={lift === 'dips' ? '0.5' : '2.5'} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Reps</label>
            <input style={inp} type="number" min="1" max="5" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="2–3" />
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 8 }}>
          {hasAnchor
            ? `Anything from C3 top (${fmt(c3Hard)}) upward, moving cleanly at 1 RIR, is a valid result. Ceiling: ~+5% (${fmt(testCeiling(c3Hard, lift))}). No grinders.`
            : 'No C3 Hard anchor set for this lift — find a clean 2–3RM with 1 rep in reserve; no grinders. Record what you hit (not a target).'}
        </div>
      </Card>

      {/* C. Volume — normal 2×6 @ 80% of the C3 anchor */}
      <Card>
        {blockTitle('C. Volume Block', '2 sets · 80%')}
        <Row a={LIFT_LABEL[lift]} b={`2 × ${scheme.vol} @ 80%`} c={hasAnchor ? fmt(volumeWeight(c3Hard, lift)) : '—'} cls={C.blue} />
        <LogRpe label="Volume" rpe={volRpe} speed={volSpeed} onRpe={setVolRpe} onSpeed={setVolSpeed} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Saved into the result notes as “Vol: …”.</div>
      </Card>

      {/* D. Carry — off on testing week */}
      <Card>
        <div style={{ fontSize: 13, color: C.muted }}>No carry — testing week.</div>
      </Card>

      {/* Notes + record (unchanged save path to testing_results) */}
      <Card>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bar speed, how it felt, 1 RIR?" />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, background: saved ? C.green : C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : existing ? 'Update result' : 'Record result'}
          </button>
          {existing && onDelete && existing.id && (
            <button onClick={() => onDelete(existing.id as string)} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '12px 16px', fontSize: 13, cursor: 'pointer' }}>
              Delete
            </button>
          )}
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>}
      </Card>
    </div>
  )
}
