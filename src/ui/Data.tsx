import { useState } from 'react'
import { C } from './theme'
import { Card, BlockTitle } from './components'
import { sessionsToCsv, hypertrophyToCsv, olyToCsv } from '../engine/export-csv'
import { sessionSummary } from '../engine/session-summary'
import { todayISO } from '../engine/date-engine'
import { weekKeyFor } from '../engine/deload-rule'
import { LIFT_SHORT } from '../engine/constants'
import type { Session, Macro, AccessoryByCycle, WeightsByCycle, DeloadMap, GiantAccessoryReps, HypertrophyLog, OlyLog } from '../engine/types'
import type { Movement } from '../engine/movements'

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

interface Entry {
  key: string
  date: string
  label: string
  s: Session
  isDeload: boolean
}

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
  deloads?: DeloadMap
  // Giant Block accessory rep targets (user-scoped) — the summary's accessory line.
  giantAccessory?: GiantAccessoryReps
  // The Capability block: the athlete's movement library (to resolve log
  // rows' names) + all-macro Hypertrophy/Oly logs.
  movements?: Movement[]
  hypertrophyLogs?: HypertrophyLog[]
  olyLogs?: OlyLog[]
}

export function Data({ sessions, macros, accessory = {}, weights = {}, deloads = {}, giantAccessory, movements = [], hypertrophyLogs = [], olyLogs = [] }: DataProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState('')

  const numberById = new Map(macros.map((m) => [m.id, m.number]))

  const entries: Entry[] = sessions
    .map((s): Entry => {
      const n = numberById.get(s.macroId)
      const isDeload = s.weekType === 'deload' || (n != null && s.cycle != null && s.week != null && !!deloads[weekKeyFor(n, s.cycle, s.week)])
      return { key: s.id, date: s.date, s, isDeload, label: `${sessionLabel(s, n)}${isDeload ? ' · DELOAD' : ''}` }
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const selected = entries.find((e) => e.key === selectedKey) || null

  function summaryFor(e: Entry): string {
    return sessionSummary(e.s, numberById.get(e.s.macroId) ?? 0, accessory[e.s.macroId], weights[e.s.macroId], e.isDeload, giantAccessory)
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
          Sessions (with volume_difficulty + deload_week columns) and the Hypertrophy/Oly Capability results export as
          three CSV files — each lives in its own table.
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
            onClick={() => downloadCsv(hypertrophyToCsv(hypertrophyLogs, sessions, movements, macros), `giant-program-hypertrophy-${todayISO()}.csv`)}
            style={btn(hypertrophyLogs.length === 0)}
            disabled={hypertrophyLogs.length === 0}
          >
            Hypertrophy CSV
          </button>
          <button
            onClick={() => downloadCsv(olyToCsv(olyLogs, sessions, movements, macros), `giant-program-oly-${todayISO()}.csv`)}
            style={btn(olyLogs.length === 0)}
            disabled={olyLogs.length === 0}
          >
            Oly CSV
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
          Pick any logged session — training or deload — and copy a plain-text summary to share.
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
                  color: active ? C.gold : C.off,
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
