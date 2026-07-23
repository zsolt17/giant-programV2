import { useState } from 'react'
import { C } from './theme'
import { Card, BlockTitle } from './components'
import { sessionsToCsv, testingToCsv, runsToCsv, capacityToCsv } from '../engine/export-csv'
import { sessionSummary, testSummary, runSummary } from '../engine/session-summary'
import { todayISO } from '../engine/date-engine'
import { daysSinceStart } from '../engine/recovery'
import { weekKeyFor } from '../engine/deload-rule'
import { LIFT_SHORT, RUN_TYPE_LABEL } from '../engine/constants'
import type { Session, Macro, Lift, AccessoryByCycle, WeightsByCycle, TestingResult, DeloadMap, Run, CapacityLog } from '../engine/types'

const btn = (disabled = false) => ({
  background: disabled ? 'rgba(201,168,76,0.3)' : C.gold,
  color: C.dark,
  border: 'none',
  borderRadius: 2,
  padding: '12px 16px',
  fontWeight: 600 as const,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  fontSize: 13,
  cursor: disabled ? 'default' : 'pointer',
})

// "2026-06-22" -> "22.06.2026"
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

// Picker label: "M2 · C1 W1 · Squat Hard · 22.06.2026" (degrades for special weeks).
function sessionLabel(s: Session, macroNumber: number | undefined): string {
  const pos = s.cycle != null && s.week != null ? `C${s.cycle} W${s.week}` : s.weekType
  const lift = s.dayType ? LIFT_SHORT[s.dayType] : '—'
  const diff = s.difficulty ? ` ${s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1)}` : ''
  return `M${macroNumber ?? '?'} · ${pos} · ${lift}${diff} · ${fmtDate(s.date)}`
}

// One selectable row in the unified list: a logged session (training/deload), a
// testing_results row (tests never create a sessions row — see ARCHITECTURE §2.7),
// or a Giant Run row (marked "· RUN").
type Entry =
  | { key: string; date: string; label: string; kind: 'session'; s: Session; isDeload: boolean }
  | { key: string; date: string; label: string; kind: 'test'; r: TestingResult; week: number | null }
  | { key: string; date: string; label: string; kind: 'run'; run: Run }

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Fallback for non-secure contexts / older Safari where the Clipboard API is absent.
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface DataProps {
  sessions: Session[]
  macros: Macro[]
  accessory?: Record<string, AccessoryByCycle>
  weights?: Record<string, WeightsByCycle>
  testing?: TestingResult[]
  deloads?: DeloadMap
  runs?: Run[]
  capacityLogs?: CapacityLog[]
}

export function Data({ sessions, macros, accessory = {}, weights = {}, testing = [], deloads = {}, runs = [], capacityLogs = [] }: DataProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState('')

  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const startById = new Map(macros.map((m) => [m.id, m.startISO]))

  // Unified, date-sorted entries: sessions (deload weeks marked) + test results.
  // weekType 'testing' rows are companion signal-carriers for test days — the
  // richer Test entries (from testing_results) represent those sessions here.
  const entries: Entry[] = [
    ...sessions.filter((s) => s.weekType !== 'testing').map((s): Entry => {
      const n = numberById.get(s.macroId)
      const isDeload =
        s.weekType === 'deload' ||
        (n != null && s.cycle != null && s.week != null && !!deloads[weekKeyFor(n, s.cycle, s.week)])
      return { key: `s:${s.id}`, date: s.date, kind: 'session', s, isDeload, label: `${sessionLabel(s, n)}${isDeload ? ' · DELOAD' : ''}` }
    }),
    ...testing.map((r): Entry => {
      const n = numberById.get(r.macroId)
      // Macro-relative week (13/14) from the start date — local math, engine helper.
      const start = startById.get(r.macroId)
      const w = start && r.testedOn ? Math.floor(daysSinceStart(start, r.testedOn) / 7) + 1 : null
      const week = w != null && w >= 1 && w <= 15 ? w : null
      const lift = LIFT_SHORT[r.lift as Lift] || r.lift
      return {
        key: `t:${r.id ?? `${r.macroId}-${r.lift}-${r.testedOn}`}`,
        date: r.testedOn || '',
        kind: 'test',
        r,
        week,
        label: `M${n ?? '?'} · Test${week != null ? ` W${week}` : ''} · ${lift} · ${fmtDate(r.testedOn || '')}`,
      }
    }),
    ...runs.map((run): Entry => {
      const n = numberById.get(run.macroId)
      const pos = run.cycle != null && run.week != null ? `C${run.cycle} W${run.week}` : run.weekType
      return {
        key: `r:${run.id}`,
        date: run.date,
        kind: 'run',
        run,
        label: `M${n ?? '?'} · ${pos} · ${RUN_TYPE_LABEL[run.runType]} · ${fmtDate(run.date)} · RUN`,
      }
    }),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const selected = entries.find((e) => e.key === selectedKey) || null

  function summaryFor(e: Entry): string {
    if (e.kind === 'test') return testSummary(e.r, numberById.get(e.r.macroId) ?? 0, e.week, weights[e.r.macroId])
    if (e.kind === 'run') return runSummary(e.run, numberById.get(e.run.macroId) ?? 0)
    const capLog = capacityLogs.find((l) => l.sessionId === e.s.id) ?? null
    return sessionSummary(e.s, numberById.get(e.s.macroId) ?? 0, accessory[e.s.macroId], weights[e.s.macroId], e.isDeload, capLog)
  }

  async function onCopy() {
    if (!selected) return
    setCopyErr('')
    const ok = await copyText(summaryFor(selected))
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      setCopyErr("Couldn't copy — your browser blocked clipboard access.")
    }
  }

  return (
    <>
      {/* Section 1 — full export */}
      <Card>
        <BlockTitle tag="CSV">Download all data</BlockTitle>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 14px' }}>
          Sessions (with pair_weight + deload_week columns), capacity results, runs, and legacy testing results export
          as four CSV files — each lives in its own table. Exports are a union of both program eras; legacy rows keep
          their original columns.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => downloadCsv(sessionsToCsv(sessions, macros, deloads), `giant-program-export-${todayISO()}.csv`)}
            style={btn(sessions.length === 0)}
            disabled={sessions.length === 0}
          >
            Sessions CSV
          </button>
          <button
            onClick={() => downloadCsv(capacityToCsv(capacityLogs, sessions, macros), `giant-program-capacity-${todayISO()}.csv`)}
            style={btn(capacityLogs.length === 0)}
            disabled={capacityLogs.length === 0}
          >
            Capacity CSV
          </button>
          <button
            onClick={() => downloadCsv(testingToCsv(testing, macros), `giant-program-testing-results-${todayISO()}.csv`)}
            style={btn(testing.length === 0)}
            disabled={testing.length === 0}
          >
            Testing CSV (legacy)
          </button>
          <button
            onClick={() => downloadCsv(runsToCsv(runs, macros), `giant-program-runs-${todayISO()}.csv`)}
            style={btn(runs.length === 0)}
            disabled={runs.length === 0}
          >
            Runs CSV
          </button>
        </div>
        {sessions.length === 0 && (
          <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0' }}>No sessions logged yet.</p>
        )}
      </Card>

      {/* Section 2 — per-session copy */}
      <Card>
        <BlockTitle tag="Clipboard">Copy session summary</BlockTitle>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
          Pick any logged session — training, test, or deload — and copy a plain-text summary to share.
        </p>

        <div
          role="listbox"
          aria-label="Recent sessions"
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: `1px solid ${C.border}`,
            borderRadius: 2,
            marginBottom: 14,
          }}
        >
          {entries.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: C.muted, textAlign: 'center' }}>No sessions logged yet.</div>
          )}
          {entries.map((e) => {
            const active = e.key === selectedKey
            return (
              <button
                key={e.key}
                role="option"
                aria-selected={active}
                onClick={() => setSelectedKey(e.key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: active ? C.gold : e.kind === 'test' ? C.blue : e.kind === 'run' ? C.green : C.off,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                {e.label}
              </button>
            )
          })}
        </div>

        {selected && (
          <pre
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              color: C.off,
              fontSize: 12.5,
              lineHeight: 1.5,
              padding: 12,
              margin: '0 0 14px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {summaryFor(selected)}
          </pre>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onCopy} style={btn(!selected)} disabled={!selected}>
            Copy summary
          </button>
          {copied && <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Copied ✓</span>}
          {copyErr && <span style={{ fontSize: 12, color: C.red }}>{copyErr}</span>}
        </div>
      </Card>
    </>
  )
}
