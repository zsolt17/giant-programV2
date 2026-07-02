import { useState } from 'react'
import { C } from './theme'
import { Card, BlockTitle } from './components'
import { sessionsToCsv } from '../engine/export-csv'
import { sessionSummary } from '../engine/session-summary'
import { todayISO } from '../engine/date-engine'
import { LIFT_SHORT } from '../engine/constants'
import type { Session, Macro, AccessoryByCycle } from '../engine/types'

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

export function Data({ sessions, macros, accessory = {} }: { sessions: Session[]; macros: Macro[]; accessory?: Record<string, AccessoryByCycle> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState('')

  const numberById = new Map(macros.map((m) => [m.id, m.number]))
  const selected = sessions.find((s) => s.id === selectedId) || null

  function onDownload() {
    const csv = sessionsToCsv(sessions, macros)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `giant-program-export-${todayISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function onCopy() {
    if (!selected) return
    setCopyErr('')
    const text = sessionSummary(selected, numberById.get(selected.macroId) ?? 0, accessory[selected.macroId])
    const ok = await copyText(text)
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
          Exports every logged session across all macros as a CSV file.
        </p>
        <button onClick={onDownload} style={btn(sessions.length === 0)} disabled={sessions.length === 0}>
          Download CSV
        </button>
        {sessions.length === 0 && (
          <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0' }}>No sessions logged yet.</p>
        )}
      </Card>

      {/* Section 2 — per-session copy */}
      <Card>
        <BlockTitle tag="Clipboard">Copy session summary</BlockTitle>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
          Pick a session, then copy a plain-text summary to share.
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
          {sessions.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: C.muted, textAlign: 'center' }}>No sessions logged yet.</div>
          )}
          {sessions.map((s) => {
            const active = s.id === selectedId
            return (
              <button
                key={s.id}
                role="option"
                aria-selected={active}
                onClick={() => setSelectedId(s.id)}
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
                {sessionLabel(s, numberById.get(s.macroId))}
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
            {sessionSummary(selected, numberById.get(selected.macroId) ?? 0, accessory[selected.macroId])}
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
