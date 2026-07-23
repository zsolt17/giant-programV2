import { useState, useEffect } from 'react'
import { C, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row, LogRpe, speedArrow, errMsg } from './controls'
import { LIFT_LABEL, SCHEMES, WU_PCT, WU_REPS, SET_LADDER } from '../engine/constants'
import { fmt, warmupSets, giantSets, volumeWeight, testCeiling } from '../engine/loading'
import { splitVolNote } from '../engine/session-summary'
import { BlockCompletion, buildBlankSession } from './SessionForm'
import type { Lift, TestingResult, Session, SessionDraft } from '../engine/types'

// Number-input value -> number | null ('' and blanks become null, like the
// mappers' toNum). Keeps weight and reps consistent on the way to the DB.
const numOrNull = (v: number | string): number | null => (v === '' || v == null ? null : Number(v))

interface TestingSessionViewProps {
  macroId: string
  lift: Lift
  // The C3 Hard anchor for the test lift (exact — never rounded). null/0 = no
  // usable anchor (e.g. bodyweight-mode dips): computed loads degrade to "—".
  c3Hard: number | null
  testedOn: string
  results: TestingResult[]
  onSave: (r: TestingResult) => Promise<TestingResult>
  onDelete?: (id: string) => void
  // Companion sessions row (weekType 'testing', id "{date}-{lift}-TEST"): carries the
  // test attempt's RPE/bar-speed, block completion, and volume completion so deload
  // signals derive from test days like any other session. Saved/deleted alongside
  // the result through the normal session mechanism.
  companion?: Session | null
  onSaveSession: (record: SessionDraft) => Promise<Session>
  onDeleteSession: (id: string) => Promise<void>
}

// Full-structure test day — the SINGLE test-session surface, shared by the Today
// tab and the Calendar's SessionModal (test cells) so the two can't drift apart.
// Renders like a normal HARD day computed off the C3 Hard anchor: warm-up
// build-up, Giant Block sets 1–3 prescribed, Set 4 as the open test-recording
// field, normal volume, no carry. All loads come from the loading engine at the
// lift's own rounding increment. Saves to testing_results (recorded, not prescribed).
export function TestingSessionView({ macroId, lift, c3Hard, testedOn, results, onSave, onDelete, companion, onSaveSession, onDeleteSession }: TestingSessionViewProps) {
  const existing = results.find((r) => r.lift === lift) || null
  const [weight, setWeight] = useState<number | string>(existing?.weight ?? '')
  const [reps, setReps] = useState<number | string>(existing?.reps ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [rpe, setRpe] = useState(companion?.rpe ?? '')
  const [barSpeed, setBarSpeed] = useState(companion?.barSpeed ?? '')
  const [blockCompletion, setBlockCompletion] = useState(companion?.blockCompletion ?? 'completed')
  const [volDone, setVolDone] = useState(companion?.volDone ?? true)
  const [volRpe, setVolRpe] = useState(companion?.volRpe ?? '')
  const [volSpeed, setVolSpeed] = useState(companion?.volSpeed ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const companionId = `${testedOn}-${lift}-TEST`

  // Re-sync when the target lift/result changes (the two test days differ).
  useEffect(() => {
    setWeight(existing?.weight ?? '')
    setReps(existing?.reps ?? '')
    setNotes(existing?.notes ?? '')
    setRpe(companion?.rpe ?? '')
    setBarSpeed(companion?.barSpeed ?? '')
    setBlockCompletion(companion?.blockCompletion ?? 'completed')
    setVolDone(companion?.volDone ?? true)
    setVolRpe(companion?.volRpe ?? '')
    setVolSpeed(companion?.volSpeed ?? '')
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift, existing?.id, companion?.id])

  const hasAnchor = c3Hard != null && c3Hard > 0
  const scheme = SCHEMES.hard
  const wu = hasAnchor ? warmupSets(c3Hard) : null
  const gsets = hasAnchor ? giantSets(c3Hard, 'hard') : null
  const wuCell = (w: number): string => (w === 0 ? 'BW' : fmt(w))

  async function save() {
    setSaving(true)
    setErr('')
    try {
      // Volume RPE/speed persist inside the result notes (feeds the copy-summary) —
      // replace any prior "Vol:" suffix, don't stack.
      const volNote = volRpe || volSpeed ? `Vol: ${volRpe}${volSpeed ? speedArrow(volSpeed) : ''}` : ''
      const finalNotes = volNote ? [splitVolNote(notes).rest, volNote].filter(Boolean).join(' · ') : notes
      await onSave({ id: existing?.id, macroId, lift, weight: numOrNull(weight), reps: numOrNull(reps), notes: finalNotes, testedOn })
      // Companion sessions row: the structured signal fields (test-attempt RPE/speed,
      // block completion, volume completion) via the normal idempotent session upsert.
      await onSaveSession({
        ...buildBlankSession({ date: testedOn, macroId, weekType: 'testing', dayType: lift, difficulty: null }),
        id: companionId,
        topWeight: numOrNull(weight),
        topReps: numOrNull(reps),
        rpe,
        barSpeed,
        blockCompletion,
        volDone,
        volRpe,
        volSpeed,
        carryRounds: null, // no carry on testing week
        startedAt: companion?.startedAt ?? null,
        endedAt: companion?.endedAt ?? null,
      })
      setNotes(finalNotes)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!existing?.id || !onDelete) return
    setErr('')
    try {
      await onDeleteSession(companionId) // no-op if the companion row doesn't exist
      onDelete(existing.id as string)
    } catch (e) {
      setErr(errMsg(e))
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
            ? `Anything from C3 top (${fmt(c3Hard)}) upward, moving cleanly at 1 RIR, is a valid result. Ceiling: ~+5% (${fmt(testCeiling(c3Hard))}). No grinders.`
            : 'No C3 Hard anchor set for this lift — find a clean 2–3RM with 1 rep in reserve; no grinders. Record what you hit (not a target).'}
        </div>
        <LogRpe label="Test attempt" rpe={rpe} speed={barSpeed} onRpe={setRpe} onSpeed={setBarSpeed} />
        <BlockCompletion value={blockCompletion} onChange={setBlockCompletion} />
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 6 }}>
          “Prescribed” here = ramp sets 1–3 plus a recorded test attempt. Abandoning the block or skipping the test set
          counts as not completed.
        </div>
      </Card>

      {/* C. Volume — normal 2×6 @ 80% of the C3 anchor */}
      <Card>
        {blockTitle('C. Volume Block', '2 sets · 80%')}
        <Row a={LIFT_LABEL[lift]} b={`2 × ${scheme.vol} @ 80%`} c={hasAnchor ? fmt(volumeWeight(c3Hard)) : '—'} cls={C.blue} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.off, marginTop: 10 }}>
          <input type="checkbox" checked={volDone} onChange={(e) => setVolDone(e.target.checked)} /> Both sets completed
        </label>
        <LogRpe label="Volume" rpe={volRpe} speed={volSpeed} onRpe={setVolRpe} onSpeed={setVolSpeed} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>RPE/speed also lands in the result notes as “Vol: …”.</div>
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
            <button onClick={handleDelete} style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '12px 16px', fontSize: 13, cursor: 'pointer' }}>
              Delete
            </button>
          )}
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>Couldn't save — {err}. Check your connection and try again.</div>}
      </Card>
    </div>
  )
}
