import { useState, useEffect } from 'react'
import { C, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, errMsg } from './controls'
import { LIFT_LABEL } from '../engine/constants'
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
