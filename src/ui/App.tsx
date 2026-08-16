import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { onAuthChange, getUser, signOut, DEV_WRITES_BLOCKED } from '../data/supabase'
import * as repo from '../data/repository'
import { Shell, Center, Spinner, SplashScreen, Card, TopLoadingBar, SyncStatus } from './components'
import type { TabKey } from './components'
import { BottomNav, MenuDrawer } from './nav'
import { saveSnapshot, readSnapshot } from '../data/cache'
import type { Snapshot } from '../data/cache'
import type { TrendsData } from '../engine/types'
import { Auth } from './Auth'
import { Today } from './Today'
// Non-default tabs are lazy-loaded so they stay out of the initial bundle and
// load on first visit (Today is the default view, so it stays eager).
const Setup = lazy(() => import('./Setup').then((m) => ({ default: m.Setup })))
const Calendar = lazy(() => import('./Calendar').then((m) => ({ default: m.Calendar })))
const History = lazy(() => import('./History').then((m) => ({ default: m.History })))
const Deload = lazy(() => import('./Deload').then((m) => ({ default: m.Deload })))
// Trends pulls in recharts — keep it in its own lazy chunk, off the main bundle.
const Trends = lazy(() => import('./Trends').then((m) => ({ default: m.Trends })))
const Data = lazy(() => import('./Data').then((m) => ({ default: m.Data })))
const Recovery = lazy(() => import('./Recovery').then((m) => ({ default: m.Recovery })))
import { errMsg } from './controls'
import { computePosition, parseLocalDate, isoLocal, todayISO } from '../engine/date-engine'
import { C } from './theme'
import type { Joint, Phase } from '../engine/recovery-content'
import type { RecoveryProtocol, RecoveryLogMap } from '../engine/types'

// Dev-only date override: `?today=YYYY-MM-DD` makes the app treat that date as "now"
// so date-driven views (Today's prescription) can be exercised off a real session day.
// Gated on import.meta.env.DEV → false in production builds, so it's tree-shaken out.
function devNow(): Date {
  if (import.meta.env.DEV) {
    const o = new URLSearchParams(window.location.search).get('today')
    if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return parseLocalDate(o)
  }
  return new Date()
}
import type { Macro, Session, SessionDraft, WeightsByCycle, AccessoryByCycle, DeloadMap, BreakDayMap, MacroBundle, GiantAccessoryReps, Giant2DifficultyConfig, HypertrophyLog, HypertrophyLogDraft, OlyLog, OlyLogDraft, WodLog, WodLogDraft } from '../engine/types'
import type { Movement } from '../engine/movements'
import { GB_DEFAULT_REPS, GIANT2_GIANT_DEFAULT_ROTATION } from '../engine/constants'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

// Dev-only banner: a constant reminder that `npm run dev` points at the PROD
// database. Gated on import.meta.env.DEV at every call site, so it's tree-shaken
// out of production builds entirely. Red when writes are enabled (danger), green
// when the write-guard is blocking them (safe). See supabase.ts assertWritable().
function DevBanner() {
  const blocked = DEV_WRITES_BLOCKED
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 200,
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderBottomRightRadius: 4,
        color: blocked ? C.dark : C.white,
        background: blocked ? C.green : C.red,
        boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
      title={
        blocked
          ? 'Dev server — writes to the production DB are blocked. Set VITE_ALLOW_DEV_WRITES=true in .env.local to enable.'
          : 'Dev server — WRITES ARE ENABLED against the production database.'
      }
    >
      {blocked ? 'DEV · writes blocked' : 'DEV · writes ON → PROD'}
    </div>
  )
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = checking, null = logged out
  const [tab, setTab] = useState<TabKey>('today')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sessionRunning, setSessionRunning] = useState(false) // drives the Shell top inset for the fixed session bar
  const [trends, setTrends] = useState<TrendsData | null>(null) // all-macro data, loaded on first Trends open
  const [trendsErr, setTrendsErr] = useState('')
  const [allSessions, setAllSessions] = useState<Session[] | null>(null) // all-macro sessions, loaded on first Data open
  const [allAccessory, setAllAccessory] = useState<Record<string, AccessoryByCycle>>({}) // macroId -> per-cycle accessory (Data summary)
  const [allWeights, setAllWeights] = useState<Record<string, WeightsByCycle>>({}) // macroId -> per-cycle anchors (Data summary: weighted pull-ups)
  const [allDeloads, setAllDeloads] = useState<DeloadMap>({}) // all-macro deload week flags (Data labels)
  const [allHypertrophyLogs, setAllHypertrophyLogs] = useState<HypertrophyLog[]>([]) // all-macro Hypertrophy results (Data CSV)
  const [allOlyLogs, setAllOlyLogs] = useState<OlyLog[]>([]) // all-macro Oly results (Data CSV)
  const [allWodLogs, setAllWodLogs] = useState<WodLog[]>([]) // all-macro Engine WOD results (Data CSV)
  const [dataErr, setDataErr] = useState('')
  // Recovery (Tendon Health) — independent of macros, loaded on first Recovery open.
  const [recovery, setRecovery] = useState<{ protocol: RecoveryProtocol | null; logs: RecoveryLogMap } | null>(null)
  const [recoveryErr, setRecoveryErr] = useState('')
  // First-login boot: hold the login/loading screen until the initial bundle is in,
  // so Today's first paint is complete (no empty shell / partial fill).
  const [booted, setBooted] = useState(false)
  const loggedOutRef = useRef(false) // true once we've shown the login screen (manual-login path)
  const [macros, setMacros] = useState<Macro[]>([])
  const [viewedMacroId, setViewedMacroId] = useState<string | null>(null)
  const [macro, setMacro] = useState<Macro | null>(null)
  const [weights, setWeights] = useState<WeightsByCycle>({})
  const [accessory, setAccessory] = useState<AccessoryByCycle>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [deloads, setDeloads] = useState<DeloadMap>({})
  const [breakDays, setBreakDays] = useState<BreakDayMap>({})
  const [giantAccessory, setGiantAccessory] = useState<GiantAccessoryReps>(() => ({ ...GB_DEFAULT_REPS }))
  const [giant2Difficulty, setGiant2Difficulty] = useState<Giant2DifficultyConfig>(() => ({ ...GIANT2_GIANT_DEFAULT_ROTATION }))
  const [hypertrophyLogs, setHypertrophyLogs] = useState<HypertrophyLog[]>([])
  const [olyLogs, setOlyLogs] = useState<OlyLog[]>([])
  const [wodLogs, setWodLogs] = useState<WodLog[]>([])
  // The movement library — user-scoped (like breakDays), loaded next to the
  // macro bundle and seeded on first boot. Nothing prescribes from it yet.
  const [movements, setMovements] = useState<Movement[]>([])
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [err, setErr] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false)
  const [pending, setPending] = useState(repo.pendingCount())

  useEffect(() => {
    getUser()
      .then(setUser)
      .catch(() => setUser(null))
    const {
      data: { subscription },
    } = onAuthChange((u) => setUser(u))
    return () => subscription.unsubscribe()
  }, [])

  function applySnapshot(snap: Snapshot) {
    setMacros(snap.macros || [])
    setViewedMacroId(snap.viewedMacroId ?? null)
    setMacro(snap.macro || null)
    setWeights(snap.weights || {})
    setAccessory(snap.accessory || {})
    setSessions(snap.sessions || [])
    setDeloads(snap.deloads || {})
    setBreakDays(snap.breakDays || {})
    setGiantAccessory(snap.giantAccessory || { ...GB_DEFAULT_REPS })
    setGiant2Difficulty(snap.giant2Difficulty || { ...GIANT2_GIANT_DEFAULT_ROTATION })
    setHypertrophyLogs(snap.hypertrophyLogs || [])
    setOlyLogs(snap.olyLogs || [])
    setWodLogs(snap.wodLogs || [])
    setMovements(snap.movements || [])
  }

  const load = useCallback(async () => {
    setStatus('loading')
    setErr('')
    try {
      // Persist any offline writes before reading, so the canonical fetch includes them.
      if (navigator.onLine !== false) await repo.flushQueue()
      const all = await repo.getMacros()
      const target =
        (viewedMacroId && all.find((m) => m.id === viewedMacroId)) ||
        all.find((m) => m.status === 'active') ||
        all[all.length - 1] ||
        null
      const b: MacroBundle = target
        ? await repo.loadMacroBundle(target.id)
        : {
            weights: {},
            accessory: {},
            sessions: [],
            deloads: {},
            breakDays: {},
            giantAccessory: { ...GB_DEFAULT_REPS },
            giant2Difficulty: { ...GIANT2_GIANT_DEFAULT_ROTATION },
            hypertrophyLogs: [],
            olyLogs: [],
            wodLogs: [],
          }
      setMacros(all)
      setMacro(target)
      setViewedMacroId(target?.id ?? null)
      setWeights(b.weights)
      setAccessory(b.accessory)
      setSessions(b.sessions)
      setDeloads(b.deloads)
      setBreakDays(b.breakDays)
      setGiantAccessory(b.giantAccessory)
      setGiant2Difficulty(b.giant2Difficulty)
      setHypertrophyLogs(b.hypertrophyLogs)
      setOlyLogs(b.olyLogs)
      setWodLogs(b.wodLogs)
      // The movement library is user-scoped (independent of the macro).
      // syncSeedMovements seeds a fresh library AND backfills any new
      // content added since. Best-effort by design: a blocked dev write
      // must never take down the whole load — degrade to whatever the
      // library holds.
      try {
        setMovements(await repo.syncSeedMovements())
        // The program version — seeded once, alongside the movement
        // library. The Capability block reads it; best-effort so a blocked
        // dev write can never take down boot.
        await repo.ensureSeedProgramVersion()
      } catch {
        try {
          setMovements(await repo.listMovements())
        } catch {
          setMovements([])
        }
      }
      setStatus('ready')
      setBooted(true)
    } catch (e) {
      // Offline / network failure: fall back to the last cached snapshot if we have one.
      const snap = readSnapshot()
      if (snap && snap.macro) {
        applySnapshot(snap)
        setStatus('ready')
        setBooted(true)
      } else {
        setErr(errMsg(e))
        setStatus('error')
      }
    }
  }, [viewedMacroId])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  // Remember if we ever showed the login screen — distinguishes a manual login
  // (hold the login screen through boot) from a cold start with a stored session.
  useEffect(() => {
    if (user === null) loggedOutRef.current = true
  }, [user])

  // Track connectivity; on reconnect, reload (which flushes the queue first).
  useEffect(() => {
    function goOnline() {
      setOnline(true)
      if (user) load()
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [user, load])

  // Keep the pending-writes count in sync for the status strip.
  useEffect(() => repo.onPendingChange(setPending), [])

  // Load the all-macro Trends dataset once, on first open of the Trends tab.
  useEffect(() => {
    if (tab !== 'trends' || !user || trends) return
    let cancelled = false
    setTrendsErr('')
    repo
      .loadTrends()
      .then((d) => !cancelled && setTrends(d))
      .catch((e) => !cancelled && setTrendsErr(errMsg(e)))
    return () => {
      cancelled = true
    }
  }, [tab, user, trends])

  // Load all-macro sessions + accessory weights once, on first open of the Data tab
  // (CSV export + session-summary copy, which resolves secondary/carry per cycle).
  useEffect(() => {
    if (tab !== 'data' || !user || allSessions) return
    let cancelled = false
    setDataErr('')
    Promise.all([repo.getAllSessions(), repo.getAllAccessoryWeights(), repo.getAllWorkingWeights(), repo.getAllDeloads(), repo.getAllHypertrophyLogs(), repo.getAllOlyLogs(), repo.getAllWodLogs()])
      .then(([s, acc, w, d, hl, ol, wl]) => {
        if (cancelled) return
        setAllAccessory(acc)
        setAllWeights(w)
        setAllDeloads(d)
        setAllHypertrophyLogs(hl)
        setAllOlyLogs(ol)
        setAllWodLogs(wl)
        setAllSessions(s)
      })
      .catch((e) => !cancelled && setDataErr(errMsg(e)))
    return () => {
      cancelled = true
    }
  }, [tab, user, allSessions])

  // Load the active recovery protocol + today's tendon logs, on first Recovery open.
  useEffect(() => {
    if (tab !== 'recovery' || !user || recovery) return
    let cancelled = false
    setRecoveryErr('')
    repo
      .getActiveProtocol()
      .then(async (p) => {
        const logs = p ? await repo.getTendonLogsForDate(p.id, todayISO()) : {}
        if (!cancelled) setRecovery({ protocol: p, logs })
      })
      .catch((e) => !cancelled && setRecoveryErr(errMsg(e)))
    return () => {
      cancelled = true
    }
  }, [tab, user, recovery])

  const onStartProtocol = useCallback(async (joint: Joint, startISO: string) => {
    const p = await repo.startProtocol(joint, startISO)
    setRecovery({ protocol: p, logs: {} })
  }, [])

  const onSetPhaseOverride = useCallback(
    async (phase: Phase | null) => {
      if (!recovery?.protocol) return
      const p = await repo.setPhaseOverride(recovery.protocol.id, phase)
      setRecovery((prev) => (prev ? { ...prev, protocol: p } : prev))
    },
    [recovery]
  )

  const onCloseProtocol = useCallback(async () => {
    if (!recovery?.protocol) return
    await repo.closeProtocol(recovery.protocol.id, todayISO())
    setRecovery({ protocol: null, logs: {} })
  }, [recovery])

  const onToggleTendonLog = useCallback(
    async (tendonKey: string, on: boolean) => {
      if (!recovery?.protocol) return
      await repo.setTendonLog(recovery.protocol.id, tendonKey, todayISO(), on)
      setRecovery((prev) => {
        if (!prev) return prev
        const logs = { ...prev.logs }
        if (on) logs[tendonKey] = true
        else delete logs[tendonKey]
        return { ...prev, logs }
      })
    },
    [recovery]
  )

  // Cache the loaded bundle so reopening offline shows last-known data (incl.
  // optimistic offline writes, since those flow through state).
  useEffect(() => {
    if (status === 'ready' && user && macro) {
      saveSnapshot({ macros, viewedMacroId, macro, weights, accessory, sessions, deloads, breakDays, giantAccessory, giant2Difficulty, hypertrophyLogs, olyLogs, wodLogs, movements })
    }
  }, [status, user, macro, macros, viewedMacroId, weights, accessory, sessions, deloads, breakDays, giantAccessory, giant2Difficulty, hypertrophyLogs, olyLogs, wodLogs, movements])

  const onSaveSession = useCallback(async (record: SessionDraft): Promise<Session> => {
    const saved = await repo.saveSession(record)
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== saved.id).concat(saved)
      next.sort((a, b) => (a.date < b.date ? 1 : -1))
      return next
    })
    return saved
  }, [])

  const onDeleteSession = useCallback(async (id: string) => {
    await repo.deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // Capability block — Hypertrophy is one row PER MOVEMENT PER SET, upsert on
  // (sessionId, movementId, setNumber) — matching hypertrophy_logs' real
  // unique constraint. Dropping setNumber from this dedup key was a real bug:
  // concurrent per-set saves (Promise.all in CapabilityBlock's save()) each
  // wiped out the OTHER already-saved sets from local state, since every
  // save's filter matched (and removed) every set for that movement, not just
  // its own. The database was always correct (a real per-set upsert); only
  // this in-memory array lost rows, which is why the data reappeared after a
  // full reload (a fresh fetch) but looked gone after in-app navigation.
  const onSaveHypertrophyLog = useCallback(async (log: HypertrophyLogDraft): Promise<HypertrophyLog> => {
    const saved = await repo.saveHypertrophyLog(log)
    setHypertrophyLogs((prev) => prev.filter((l) => !(l.sessionId === saved.sessionId && l.movementId === saved.movementId && l.setNumber === saved.setNumber)).concat(saved))
    return saved
  }, [])

  const onSaveOlyLog = useCallback(async (log: OlyLogDraft): Promise<OlyLog> => {
    const saved = await repo.saveOlyLog(log)
    setOlyLogs((prev) => prev.filter((l) => !(l.sessionId === saved.sessionId && l.movementId === saved.movementId)).concat(saved))
    return saved
  }, [])

  // Engine WOD — one row PER ROUND, upsert on (sessionId, roundNumber),
  // matching wod_logs' real unique constraint — same dedup-key discipline as
  // onSaveHypertrophyLog above (concurrent per-round saves must each only
  // replace their OWN round in local state, not every round for the session).
  const onSaveWodLog = useCallback(async (log: WodLogDraft): Promise<WodLog> => {
    const saved = await repo.saveWodLog(log)
    setWodLogs((prev) => prev.filter((l) => !(l.sessionId === saved.sessionId && l.roundNumber === saved.roundNumber)).concat(saved))
    return saved
  }, [])

  // Movement library — create/edit and archive (never delete: an archived
  // movement must keep resolving for any slot that referenced it).
  const onSaveMovement = useCallback(async (m: Movement): Promise<Movement> => {
    const saved = await repo.saveMovement(m)
    setMovements((prev) => {
      const next = prev.filter((x) => x.key !== saved.key).concat(saved)
      next.sort((a, b) => a.name.localeCompare(b.name))
      return next
    })
    return saved
  }, [])

  const onArchiveMovement = useCallback(async (id: string, archived: boolean) => {
    await repo.archiveMovement(id, archived)
    setMovements((prev) => prev.map((m) => (m.id === id ? { ...m, archived } : m)))
  }, [])

  // Extend (or un-extend) the deload by one identical week — decided during the
  // deload itself, from the deload-week view.
  const onExtendDeload = useCallback(
    async (on: boolean) => {
      if (!macro) return
      const updated = await repo.updateMacro(macro.id, { deloadExtended: on })
      setMacro(updated)
      setMacros((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    },
    [macro]
  )

  const onToggleBreak = useCallback(async (iso: string, on: boolean) => {
    await repo.setBreakDay(iso, on)
    setBreakDays((prev) => {
      const next = { ...prev }
      if (on) next[iso] = true
      else delete next[iso]
      return next
    })
  }, [])

  const onApplyDeload = useCallback(
    async (weekKey: string, on: boolean) => {
      if (!macro) return
      await repo.setDeload(macro.id, weekKey, on)
      setDeloads((prev) => {
        const next = { ...prev }
        if (on) next[weekKey] = true
        else delete next[weekKey]
        return next
      })
    },
    [macro]
  )

  const onSelectMacro = useCallback((id: string) => setViewedMacroId(id), [])

  const onRollMacro = useCallback(
    async (newStartISO: string) => {
      if (!macro) return
      const next = await repo.rollToNextMacro({ currentMacroId: macro.id, currentMacroNumber: macro.number, newStartISO })
      setViewedMacroId(next.id) // triggers reload via load()'s dependency
    },
    [macro]
  )

  // Checking the stored session — keep the splash up (seamless with the pre-React one).
  if (user === undefined) return <SplashScreen />
  if (!user)
    return (
      <>
        {import.meta.env.DEV && <DevBanner />}
        <Auth />
      </>
    )
  // A first-load failure is retryable here (re-runs load()) — the user is already
  // authenticated, so this is the right landing, not the login form.
  if (status === 'error' && !booted)
    return (
      <Shell onSignOut={signOut}>
        <Center style={{ color: C.red }}>
          <div style={{ marginBottom: 12 }}>Couldn't load: {err}</div>
          <button onClick={load} style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
            Retry
          </button>
        </Center>
      </Shell>
    )
  // First login: hold the screen until the initial bundle is loaded so Today paints
  // complete. A manual login keeps the login screen (held spinner spans auth + data);
  // a cold start with a stored session shows a matching full-screen loading view.
  if (!booted)
    return loggedOutRef.current ? (
      <Auth dataLoading />
    ) : (
      // Logged-in reopen: hold the splash through the first bundle load, then fade in.
      <SplashScreen />
    )
  // After boot, in-app reload failures use the same retry screen.
  if (status === 'error')
    return (
      <Shell onSignOut={signOut}>
        <Center style={{ color: C.red }}>
          <div style={{ marginBottom: 12 }}>Couldn't load: {err}</div>
          <button onClick={load} style={{ background: C.gold, color: C.dark, border: 'none', borderRadius: 2, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>
            Retry
          </button>
        </Center>
      </Shell>
    )

  const computed = macro
    ? computePosition(macro.startISO, macro.number, devNow(), { weeks: macro.weeks, deloadExtended: macro.deloadExtended }, giant2Difficulty)
    : null
  if (computed && macro) computed.startISO = macro.startISO

  const needsMacro = !macro

  // Fade the whole app in once on first boot (replacing the login/loading screen),
  // so the complete Today view appears as one deliberate unit. Runs once on mount.
  return (
    <div style={{ animation: 'gp-fade-in 0.4s ease' }}>
    <>
    {import.meta.env.DEV && <DevBanner />}
    <Shell sessionRunning={sessionRunning}>
      {status === 'loading' && <TopLoadingBar />}
      <SyncStatus online={online} pending={pending} />

      <Suspense fallback={<Center><Spinner /> Loading…</Center>}>
      {needsMacro && tab !== 'setup' && tab !== 'recovery' && (
        <Card style={{ textAlign: 'center', color: C.muted }}>No active macro yet — create one in the Setup tab.</Card>
      )}

      {tab === 'today' && macro && computed && (
        <Today
          computed={computed}
          macroId={macro.id}
          weights={weights}
          accessory={accessory}
          sessions={sessions}
          deloads={deloads}
          breakDays={breakDays}
          deloadExtended={macro.deloadExtended}
          dateISO={isoLocal(devNow())}
          giantAccessory={giantAccessory}
          movements={movements}
          hypertrophyLogs={hypertrophyLogs}
          olyLogs={olyLogs}
          wodLogs={wodLogs}
          onSaveSession={onSaveSession}
          onApplyDeload={onApplyDeload}
          onSaveHypertrophyLog={onSaveHypertrophyLog}
          onSaveOlyLog={onSaveOlyLog}
          onSaveWodLog={onSaveWodLog}
          onExtendDeload={onExtendDeload}
          onRunningChange={setSessionRunning}
        />
      )}

      {tab === 'calendar' && macro && (
        <Calendar
          startISO={macro.startISO}
          macroNumber={macro.number}
          macroId={macro.id}
          weights={weights}
          accessory={accessory}
          sessions={sessions}
          deloads={deloads}
          breakDays={breakDays}
          macroWeeks={macro.weeks}
          deloadExtended={macro.deloadExtended}
          giantAccessory={giantAccessory}
          giant2Difficulty={giant2Difficulty}
          movements={movements}
          hypertrophyLogs={hypertrophyLogs}
          olyLogs={olyLogs}
          wodLogs={wodLogs}
          onToggleBreak={onToggleBreak}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          onSaveHypertrophyLog={onSaveHypertrophyLog}
          onSaveOlyLog={onSaveOlyLog}
          onSaveWodLog={onSaveWodLog}
        />
      )}

      {tab === 'setup' && (
        <Setup
          key={macro?.id || 'new'}
          macro={macro}
          bundle={{ weights, accessory, giantAccessory, giant2Difficulty }}
          macros={macros}
          movements={movements}
          onReload={load}
          onSelectMacro={onSelectMacro}
          onRollMacro={onRollMacro}
          onSaveMovement={onSaveMovement}
          onArchiveMovement={onArchiveMovement}
        />
      )}

      {tab === 'history' && macro && <History sessions={sessions} macroNumber={macro.number} onDeleteSession={onDeleteSession} />}

      {tab === 'deload' && macro && <Deload sessions={sessions} deloads={deloads} macroNumber={macro.number} startISO={macro.startISO} />}

      {tab === 'trends' &&
        (trendsErr ? (
          <Card style={{ textAlign: 'center', color: C.red }}>Couldn't load trends — {trendsErr}.</Card>
        ) : trends ? (
          <Trends data={trends} />
        ) : (
          <Center>
            <Spinner /> Loading trends…
          </Center>
        ))}

      {tab === 'data' &&
        (dataErr ? (
          <Card style={{ textAlign: 'center', color: C.red }}>Couldn't load data — {dataErr}.</Card>
        ) : allSessions ? (
          <Data
            sessions={allSessions}
            macros={macros}
            accessory={allAccessory}
            weights={allWeights}
            deloads={allDeloads}
            giantAccessory={giantAccessory}
            movements={movements}
            hypertrophyLogs={allHypertrophyLogs}
            olyLogs={allOlyLogs}
            wodLogs={allWodLogs}
          />
        ) : (
          <Center>
            <Spinner /> Loading data…
          </Center>
        ))}

      {tab === 'recovery' &&
        (recoveryErr ? (
          <Card style={{ textAlign: 'center', color: C.red }}>Couldn't load recovery — {recoveryErr}.</Card>
        ) : recovery ? (
          <Recovery
            protocol={recovery.protocol}
            logs={recovery.logs}
            onStartProtocol={onStartProtocol}
            onSetPhaseOverride={onSetPhaseOverride}
            onCloseProtocol={onCloseProtocol}
            onToggleTendonLog={onToggleTendonLog}
          />
        ) : (
          <Center>
            <Spinner /> Loading recovery…
          </Center>
        ))}
      </Suspense>
    </Shell>

    <BottomNav tab={tab} setTab={setTab} onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
    {menuOpen && <MenuDrawer tab={tab} onSelect={setTab} onSignOut={signOut} onClose={() => setMenuOpen(false)} />}
    </>
    </div>
  )
}
