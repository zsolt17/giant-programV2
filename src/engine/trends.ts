// Pure derivation: our persisted Session/Macro/deload data -> the flat row shape
// the Trends charts consume (TrendSession). No DB calls, no React. The deload
// signal flags mirror deload-rule.ts exactly so Trends never disagrees with Deload.
import type { Session, Macro, Run, DeloadMap, BreakDayMap, AccessoryByCycle, TrendSession, TrendDay, TrendAccessory, TrendCarry, TrendRun, CarryType, AttStatus, AttMacro, AttCycle } from './types'
import { weekKeyFor } from './deload-rule'
import { enumerateMacro, todayISO } from './date-engine'
import { derivedPaceS } from './runs'

const DAY_LABEL: Record<string, TrendDay> = { deadlift: 'DL', ohp: 'OHP', squat: 'Squat', bench: 'Bench', dips: 'Dips' }
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
        // Signal definitions match deload-rule.ts (S4 is notebook-only, omitted).
        S1: rpe != null && rpe >= 9.5 ? 1 : 0,
        S2: s.volDone === false ? 1 : 0,
        S3: s.carrySkipped && s.carrySkipReason === 'fatigue' ? 1 : 0,
        S5: s.barSpeed === 'down' ? 1 : 0,
        S7: s.blockCompletion && s.blockCompletion !== 'completed' ? 1 : 0,
        volOk: s.volDone !== false,
        status: isDeload ? 'deload' : 'done',
        sets: (s.cardioCals || []).filter((c): c is number => c != null),
      } satisfies TrendSession
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Giant Run: every logged run with a derivable pace, oldest → newest, for the
// Runs trend view. Pace is derived with the same engine call the UI renders.
export function toRunTrend(runs: Run[], macros: Macro[]): TrendRun[] {
  const numById: Record<string, number> = {}
  macros.forEach((m) => {
    numById[m.id] = m.number
  })
  return runs
    .map((r) => {
      const paceS = derivedPaceS(r.distanceKm, r.durationS)
      if (paceS == null) return null
      const num = numById[r.macroId] ?? 0
      return { macro: `M${num}`, macroNumber: num, date: r.date, type: r.runType, paceS, distanceKm: r.distanceKm, hr: r.avgHr, terrain: r.terrain || 'road' } satisfies TrendRun
    })
    .filter((r): r is TrendRun => r != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Recorded per-cycle accessory weight (one-arm DB row / B-stance RDL) over time:
// one point per (macro, cycle) that has a value, ordered M1C1, M1C2, … MnC3.
// These are Setup values (no per-session log), so the series is per cycle, not per session.
export function toAccessoryTrend(macros: Macro[], accessory: Record<string, AccessoryByCycle>, item: string): TrendAccessory[] {
  const out: TrendAccessory[] = []
  macros
    .slice()
    .sort((a, b) => a.number - b.number)
    .forEach((m) => {
      for (const cycle of [1, 2, 3]) {
        const w = accessory[m.id]?.[cycle]?.[item]
        if (w != null) out.push({ macro: `M${m.number}`, cycle: `C${cycle}`, label: `M${m.number}C${cycle}`, weight: w })
      }
    })
  return out
}

// Each training session has one carry, typed by the day's lift. Weight is the
// per-cycle accessory load; distance is the session's logged metres/round.
// Day → carry implement (final reassignment). Weight comes from the per-cycle
// accessory item keyed by day (carry_<day>), so the keys are unchanged.
const CARRY_OF: Record<string, { type: CarryType; item: string }> = {
  deadlift: { type: 'Farmer', item: 'carry_deadlift' },
  ohp: { type: 'Overhead', item: 'carry_ohp' },
  squat: { type: 'Sandbag', item: 'carry_squat' },
  dips: { type: 'Suitcase', item: 'carry_dips' },
}
export function toCarrySessions(sessions: Session[], macros: Macro[], accessory: Record<string, AccessoryByCycle>): TrendCarry[] {
  const numById: Record<string, number> = {}
  macros.forEach((m) => {
    numById[m.id] = m.number
  })
  return sessions
    .filter((s) => s.dayType && s.cycle != null && s.week != null && !s.carrySkipped && s.carryDistance != null)
    .map((s) => {
      const c = CARRY_OF[s.dayType as string]
      const weight = accessory[s.macroId]?.[s.cycle as number]?.[c.item] ?? null
      return {
        macro: `M${numById[s.macroId] ?? 0}`,
        cycle: `C${s.cycle}`,
        week: `W${s.week}`,
        date: s.date,
        type: c.type,
        weight,
        distance: s.carryDistance,
      }
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Attendance, derived from the real schedule (enumerateMacro) — columns are the
// Mon/Wed/Fri slots, so the lift rotation isn't forced into fixed lift-columns.
// Each cell's status comes from breaks / deload weeks / what was logged / whether
// the date has passed.
export function toAttendance(macros: Macro[], sessions: Session[], deloads: DeloadMap, breakDays: BreakDayMap): AttMacro[] {
  const logged = new Set(sessions.map((s) => s.date))
  const today = todayISO()

  return macros
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const rows = enumerateMacro(m.startISO, m.number, { weeks: m.weeks, deloadExtended: m.deloadExtended })
      const cycleMap: Record<number, AttCycle> = {}
      const endRows: AttMacro['endRows'] = []
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
        } else if (row.weekType === 'testing' || row.weekType === 'deload') {
          const isDeloadRow = row.weekType === 'deload'
          const label = isDeloadRow ? `W${row.displayWeek}` : `T${endRows.filter((r) => r.row.startsWith('T')).length + 1}`
          const cells: AttStatus[] = row.cells.map((cell) => {
            const planned = isDeloadRow || cell.testRole === 'test' // a counted slot
            if (breakDays[cell.date]) {
              if (planned) {
                epTotal++
                epHoliday++
              }
              return 'holiday'
            }
            if (logged.has(cell.date)) {
              if (planned) {
                epTotal++
                epDone++
              }
              return isDeloadRow ? 'deload' : 'test'
            }
            if (planned) {
              epTotal++
              if (cell.date < today) {
                epMissed++
                return 'missed'
              }
              return 'upcoming'
            }
            return null // optional Wed light day — not counted
          })
          endRows.push({ row: label, cells })
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
