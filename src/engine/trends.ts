// Pure derivation: our persisted Session/Macro/deload data -> the flat row shape
// the Trends charts consume (TrendSession). No DB calls, no React. The deload
// signal flags mirror deload-rule.ts exactly so Trends never disagrees with Deload.
import type { Session, Macro, DeloadMap, BreakDayMap, WodLog, TrendSession, TrendWod, AttStatus, AttMacro, AttCycle, AttEndRow } from './types'
import { weekKeyFor } from './deload-rule'
import { enumerateMacro, todayISO } from './date-engine'
import { GIANT2_DAY_TYPE } from './constants'

const DAY_LABEL: Record<string, TrendSession['day']> = { deadlift: 'DL', ohp: 'OHP', squat: 'Squat', bench: 'Bench' }
const SPD: Record<string, 0 | 1 | 2> = { down: 0, normal: 1, up: 2 }

// "R9.5" -> 9.5 ; "" / unparseable -> null.
export function parseRpe(rpe: string): number | null {
  if (!rpe) return null
  const n = parseFloat(rpe.replace(/^R/i, ''))
  return Number.isFinite(n) ? n : null
}

// Flatten training-week sessions to chart rows, oldest -> newest.
export function toTrendSessions(sessions: Session[], macros: Macro[], deloads: DeloadMap): TrendSession[] {
  const numById: Record<string, number> = {}
  macros.forEach((m) => {
    numById[m.id] = m.number
  })

  return sessions
    .filter((s) => s.weekType === 'training' && s.dayType && s.cycle != null && s.week != null)
    .map((s) => {
      const num = numById[s.macroId] ?? 0
      const rpe = parseRpe(s.rpe)
      const durMs = s.startedAt && s.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : null
      const isDeload = !!deloads[weekKeyFor(num, s.cycle as number, s.week as number)]
      const spd = s.barSpeed in SPD ? SPD[s.barSpeed] : null
      return {
        macro: `M${num}`,
        macroNumber: num,
        cycle: `C${s.cycle}`,
        week: `W${s.week}`,
        day: DAY_LABEL[s.dayType as string],
        date: s.date,
        weight: s.topWeight,
        rpe,
        spd,
        dur: durMs != null ? Math.round(durMs / 60000) : null,
        // Signal definitions match deload-rule.ts EXACTLY: S2 never applies to a
        // session with no Volume block (C3 week 4, or a deload).
        S1: rpe != null && rpe >= 9.5 ? 1 : 0,
        S2: s.volumeDifficulty != null && s.volDone === false ? 1 : 0,
        S3: s.wodSkipped && s.wodSkipReason === 'fatigue' ? 1 : 0,
        S5: s.barSpeed === 'down' ? 1 : 0,
        S7: s.blockCompletion && s.blockCompletion !== 'completed' ? 1 : 0,
        volOk: s.volDone !== false,
        status: isDeload ? 'deload' : 'done',
        sets: (s.cardioCals || []).filter((c): c is number => c != null),
      } satisfies TrendSession
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Each C3 session's Engine WOD, flattened to its total calories (the sum of
// its logged rounds — the primary improvement marker). Skipped sessions and
// sessions with nothing logged yet are omitted, same filtering spirit as the
// old carry chart's "only sessions with real data" rule.
export function toWodSessions(sessions: Session[], macros: Macro[], wodLogs: WodLog[]): TrendWod[] {
  const numById: Record<string, number> = {}
  macros.forEach((m) => {
    numById[m.id] = m.number
  })
  const roundsBySession: Record<string, WodLog[]> = {}
  wodLogs.forEach((l) => {
    ;(roundsBySession[l.sessionId] ||= []).push(l)
  })

  return sessions
    .filter((s) => s.dayType && s.cycle === 3 && s.week != null && !s.wodSkipped)
    .map((s) => {
      const cals = (roundsBySession[s.id] || []).map((l) => l.machineCalories).filter((c): c is number => c != null)
      return {
        macro: `M${numById[s.macroId] ?? 0}`,
        cycle: `C${s.cycle}`,
        week: `W${s.week}`,
        date: s.date,
        dayGroup: GIANT2_DAY_TYPE[s.dayType!] ?? 'lower',
        totalCalories: cals.length ? cals.reduce((a, c) => a + c, 0) : null,
      }
    })
    .filter((w) => w.totalCalories != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Attendance, derived from the real schedule (enumerateMacro) — columns are the
// Mon/Tue/Thu/Fri slots. Each cell's status comes from breaks / deload weeks /
// what was logged / whether the date has passed.
export function toAttendance(macros: Macro[], sessions: Session[], deloads: DeloadMap, breakDays: BreakDayMap): AttMacro[] {
  const logged = new Set(sessions.map((s) => s.date))
  const today = todayISO()

  return macros
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const rows = enumerateMacro(m.startISO, m.number, { weeks: m.weeks, deloadExtended: m.deloadExtended })
      const cycleMap: Record<number, AttCycle> = {}
      const endRows: AttEndRow[] = []
      let epDone = 0
      let epMissed = 0
      let epHoliday = 0
      let epTotal = 0

      for (const row of rows) {
        if (row.weekType === 'training' && row.meso != null && row.week != null) {
          const meso = row.meso
          const cyc = (cycleMap[meso] ||= { cycle: `C${meso}`, weeks: [], done: 0, deload: 0, missed: 0, holiday: 0, total: 0 })
          const cells: AttStatus[] = row.cells.map((cell) => {
            if (breakDays[cell.date]) return 'holiday'
            if (deloads[weekKeyFor(m.number, meso, row.week as number)]) return 'deload'
            if (logged.has(cell.date)) return 'done'
            return cell.date < today ? 'missed' : 'upcoming'
          })
          cyc.weeks.push({ week: `W${row.week}`, cells })
          cells.forEach((c) => {
            cyc.total++
            if (c === 'done') cyc.done++
            else if (c === 'deload') cyc.deload++
            else if (c === 'missed') cyc.missed++
            else if (c === 'holiday') cyc.holiday++
          })
        } else if (row.weekType === 'deload') {
          const cells: AttStatus[] = row.cells.map((cell) => (breakDays[cell.date] ? 'holiday' : logged.has(cell.date) ? 'done' : cell.date < today ? 'missed' : 'upcoming'))
          endRows.push({ row: `W${row.displayWeek}`, cells })
          cells.forEach((c) => {
            epTotal++
            if (c === 'done') epDone++
            else if (c === 'holiday') epHoliday++
            else if (c === 'missed') epMissed++
          })
        }
      }

      return {
        macro: `M${m.number}`,
        cycles: [1, 2, 3].map((n) => cycleMap[n]).filter((c): c is AttCycle => !!c),
        endRows,
        epDone,
        epMissed,
        epHoliday,
        epTotal,
      }
    })
}

// Distinct macro labels present in the data, ordered M1..Mn.
export function macroLabels(macros: Macro[]): string[] {
  return macros
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((m) => `M${m.number}`)
}
