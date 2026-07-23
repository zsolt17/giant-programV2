// GiantFit capacity block — the circuit prescription (variant movements +
// rounds target from Setup), a count-UP stopwatch, and the per-session log
// (capacity_logs, upsert on session_id). Self-contained: it owns its fields
// and saves through its own handler, so it works identically inline on Today
// and inside the Calendar modal, and is editable/backfillable without the
// stopwatch. The parent's onSave ensures the session row exists first (FK).
import { useState, useEffect } from 'react'
import { C, HEADING, inp, lbl } from './theme'
import { Card } from './components'
import { blockTitle, Row, LogRpe, fmtClock, errMsg } from './controls'
import { fmt } from '../engine/loading'
import { CAPACITY_MOVEMENTS } from '../engine/capacity'
import { parseClock } from '../engine/runs'
import type { CapacityVariant, CapacityConfig, CapacityLog, CapacityLogDraft } from '../engine/types'

interface CapacityBlockProps {
  letter: string
  variant: CapacityVariant
  config: CapacityConfig
  sessionId: string
  log: CapacityLog | null
  onSave: (log: CapacityLogDraft) => Promise<CapacityLog>
  onDelete: (sessionId: string) => Promise<void>
}

// Stopwatch state: elapsed = accMs + (now - startTs while running). Timestamp-
// based like the session timer — recomputed each tick, so backgrounding the
// app never loses time (the interval only forces re-renders).
interface Watch {
  startTs: number | null // running since (null = not running)
  accMs: number // accumulated across pauses
}

export function CapacityBlock({ letter, variant, config, sessionId, log, onSave, onDelete }: CapacityBlockProps) {
  const movements = CAPACITY_MOVEMENTS[variant]
  const values = config.movements[variant]
  const hasCalories = movements.some((m) => m.calories)

  const [rounds, setRounds] = useState<number | string>(log?.roundsCompleted ?? config.rounds)
  const [timeText, setTimeText] = useState(log?.totalTimeSeconds != null ? fmtClock(log.totalTimeSeconds * 1000) : '')
  const [calories, setCalories] = useState<number | string>(log?.calories ?? '')
  const [rpe, setRpe] = useState(log?.rpe ?? '')
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [watch, setWatch] = useState<Watch>({ startTs: null, accMs: 0 })
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const running = watch.startTs != null
  const elapsedMs = watch.accMs + (watch.startTs != null ? nowTs - watch.startTs : 0)
  const started = running || watch.accMs > 0

  // Tick only re-renders; elapsed is always recomputed from the timestamps.
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [running])

  function start() {
    setNowTs(Date.now())
    setWatch((w) => ({ ...w, startTs: Date.now() }))
  }
  function pause() {
    setWatch((w) => (w.startTs == null ? w : { startTs: null, accMs: w.accMs + Date.now() - w.startTs }))
  }

  async function doSave(totalSeconds: number | null) {
    setSaving(true)
    setErr('')
    try {
      await onSave({
        id: log?.id,
        sessionId,
        variant,
        roundsCompleted: rounds,
        totalTimeSeconds: totalSeconds,
        calories: hasCalories ? calories : '',
        rpe,
        notes,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // Finish: stop the watch, stamp the elapsed time into the field, save.
  async function finish() {
    const total = watch.accMs + (watch.startTs != null ? Date.now() - watch.startTs : 0)
    const seconds = Math.round(total / 1000)
    setWatch({ startTs: null, accMs: total })
    setTimeText(fmtClock(seconds * 1000))
    await doSave(seconds)
  }

  // Manual save (backfill / edits): time comes from the text field (min:sec).
  async function save() {
    const t = timeText.trim()
    const seconds = t === '' ? null : parseClock(t)
    if (t !== '' && seconds == null) {
      setErr('Time must be min:sec, e.g. 12:34')
      return
    }
    await doSave(seconds)
  }

  async function del() {
    setErr('')
    try {
      await onDelete(sessionId)
      setTimeText('')
      setRounds(config.rounds)
      setCalories('')
      setRpe('')
      setNotes('')
      setWatch({ startTs: null, accMs: 0 })
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  const watchBtn = (label: string, onClick: () => void, primary = false) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: primary ? C.gold : 'transparent',
        color: primary ? C.dark : C.gold,
        border: `1px solid ${C.gold}`,
        borderRadius: 2,
        padding: '10px 12px',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <Card>
      {blockTitle(`${letter}. Capacity`, `variant ${variant} · ${config.rounds} rounds`)}
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 8 }}>
        {config.rounds} rounds, top to bottom. One time for the whole block.
      </div>
      {movements.map((m, i) => {
        const v = values[m.key]
        const desc = [`${v?.reps ?? m.reps}${m.repUnit ? ` ${m.repUnit}` : ''}`, m.note].filter(Boolean).join(' · ')
        return (
          <Row
            key={m.key}
            a={`${i + 1}. ${m.name}`}
            b={desc}
            c={m.loaded ? (v?.weight != null ? fmt(v.weight) : '—') : ''}
            cls={m.loaded && v?.weight != null ? C.off : C.muted}
          />
        )
      })}

      {/* Count-UP stopwatch — plain elapsed time, large display. */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            data-capacity-watch="1"
            style={{ fontFamily: HEADING, fontSize: 34, color: started ? C.gold : C.muted, fontVariantNumeric: 'tabular-nums', minWidth: 96 }}
          >
            {fmtClock(elapsedMs)}
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            {!started && watchBtn('Start', start, true)}
            {running && watchBtn('Pause', pause)}
            {started && !running && watchBtn('Resume', start)}
            {started && watchBtn(saving ? '…' : 'Finish', finish, true)}
          </div>
        </div>
      </div>

      {/* Log fields — editable/backfillable without the stopwatch. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 80 }}>
          <label style={lbl}>Rounds done</label>
          <input
            data-capacity-rounds="1"
            style={inp}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <label style={lbl}>Time (min:sec)</label>
          <input
            data-capacity-time="1"
            style={inp}
            type="text"
            inputMode="decimal"
            placeholder="12:34"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
          />
        </div>
        {hasCalories && (
          <div style={{ flex: 1, minWidth: 80 }}>
            <label style={lbl}>Bike cals</label>
            <input
              data-capacity-calories="1"
              style={inp}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </div>
        )}
      </div>
      <LogRpe label="Capacity" rpe={rpe} speed={null} onRpe={setRpe} />
      <div style={{ marginTop: 10 }}>
        <label style={lbl}>Capacity notes</label>
        <input
          style={inp}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Broke the pull-ups round 3…"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          data-capacity-save="1"
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
          {saving ? 'Saving…' : saved ? 'Saved ✓' : log ? 'Update capacity' : 'Save capacity'}
        </button>
        {log && (
          <button
            onClick={del}
            style={{ background: 'transparent', color: C.red, border: `1px solid ${C.red}`, borderRadius: 2, padding: '10px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            Delete
          </button>
        )}
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>Couldn't save capacity — {err}</div>}
    </Card>
  )
}
