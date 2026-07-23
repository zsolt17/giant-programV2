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
import type {
  Macro,
  Session,
  SessionDraft,
  WeightsByCycle,
  AccessoryByCycle,
  DeloadMap,
  BreakDayMap,
  TestingResult,
  MacroBundle,
  Run,
  RunDraft,
  RunTargetsByCycle,
  CapacityConfig,
} from '../engine/types'
import { defaultCapacityConfig } from '../engine/capacity'

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
  const [allTesting, setAllTesting] = useState<TestingResult[]>([]) // all-macro test results (Data list + copy)
  const [allDeloads, setAllDeloads] = useState<DeloadMap>({}) // all-macro deload week flags (Data labels)
  const [allRuns, setAllRuns] = useState<Run[]>([]) // all-macro runs (Data list + runs CSV)
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
  const [testing, setTesting] = useState<TestingResult[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runTargets, setRunTargets] = useState<RunTargetsByCycle>({})
  const [capacity, setCapacity] = useState<CapacityConfig>(() => defaultCapacityConfig())
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
    setTesting(snap.testing || [])
    setRuns(snap.runs || [])
    setRunTargets(snap.runTargets || {})
    setCapacity(snap.capacity || defaultCapacityConfig())
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
        : { weights: {}, accessory: {}, sessions: [], deloads: {}, breakDays: {}, testing: [], runs: [], runTargets: {}, capacity: defaultCapacityConfig() }
      setMacros(all)
      setMacro(target)
      setViewedMacroId(target?.id ?? null)
      setWeights(b.weights)
      setAccessory(b.accessory)
      setSessions(b.sessions)
      setDeloads(b.deloads)
      setBreakDays(b.breakDays)
      setTesting(b.testing)
      setRuns(b.runs)
      setRunTargets(b.runTargets)
      setCapacity(b.capacity)
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
    Promise.all([repo.getAllSessions(), repo.getAllAccessoryWeights(), repo.getAllWorkingWeights(), repo.getAllTestingResults(), repo.getAllDeloads(), repo.getAllRuns()])
      .then(([s, acc, w, t, d, r]) => {
        if (cancelled) return
        setAllAccessory(acc)
        setAllWeights(w)
        setAllTesting(t)
        setAllDeloads(d)
        setAllRuns(r)
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
      saveSnapshot({ macros, viewedMacroId, macro, weights, accessory, sessions, deloads, breakDays, testing, runs, runTargets, capacity })
    }
  }, [status, user, macro, macros, viewedMacroId, weights, accessory, sessions, deloads, breakDays, testing, runs, runTargets, capacity])

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

  const onSaveRun = useCallback(async (record: RunDraft): Promise<Run> => {
    const saved = await repo.saveRun(record)
    setRuns((prev) => {
      const next = prev.filter((r) => r.id !== saved.id).concat(saved)
      next.sort((a, b) => (a.date < b.date ? 1 : -1))
      return next
    })
    return saved
  }, [])

  const onDeleteRun = useCallback(async (id: string) => {
    await repo.deleteRun(id)
    setRuns((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // TT confirm flow + Setup both set the Giant Run reference pace P (never silent
  // from a save — always behind an explicit confirm tap).
  const onSetRefPace = useCallback(
    async (refPaceS: number | null) => {
      if (!macro) return
      const updated = await repo.setMacroRefPace(macro.id, refPaceS)
      setMacro(updated)
      setMacros((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    },
    [macro]
  )

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

  const onSaveTestingResult = useCallback(
    async (result: TestingResult): Promise<TestingResult> => {
      const saved = await repo.saveTestingResult({ ...result, macroId: macro!.id })
      setTesting((prev) => prev.filter((r) => r.id !== saved.id).concat(saved))
      return saved
    },
    [macro]
  )

  const onDeleteTestingResult = useCallback(async (id: string) => {
    await repo.deleteTestingResult(id)
    setTesting((prev) => prev.filter((r) => r.id !== id))
  }, [])

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
    ? computePosition(macro.startISO, macro.number, devNow(), { weeks: macro.weeks, deloadExtended: macro.deloadExtended })
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
          testingResults={testing}
          runs={runs}
          runTargets={runTargets}
          refPaceS={macro.refPaceS}
          macroWeeks={macro.weeks}
          deloadExtended={macro.deloadExtended}
          dateISO={isoLocal(devNow())}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          onApplyDeload={onApplyDeload}
          onSaveTestingResult={onSaveTestingResult}
          onDeleteTestingResult={onDeleteTestingResult}
          onSaveRun={onSaveRun}
          onSetRefPace={onSetRefPace}
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
          testingResults={testing}
          runs={runs}
          runTargets={runTargets}
          refPaceS={macro.refPaceS}
          macroWeeks={macro.weeks}
          deloadExtended={macro.deloadExtended}
          onToggleBreak={onToggleBreak}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          onSaveTestingResult={onSaveTestingResult}
          onDeleteTestingResult={onDeleteTestingResult}
          onSaveRun={onSaveRun}
          onDeleteRun={onDeleteRun}
          onSetRefPace={onSetRefPace}
        />
      )}

      {tab === 'setup' && (
        <Setup
          key={macro?.id || 'new'}
          macro={macro}
          bundle={{ weights, accessory, runTargets, capacity }}
          macros={macros}
          onReload={load}
          onSelectMacro={onSelectMacro}
          onRollMacro={onRollMacro}
        />
      )}

      {tab === 'history' && macro && (
        <History sessions={sessions} testingResults={testing} macroNumber={macro.number} onDeleteSession={onDeleteSession} />
      )}

      {tab === 'deload' && macro && <Deload sessions={sessions} runs={runs} deloads={deloads} macroNumber={macro.number} startISO={macro.startISO} />}

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
          <Data sessions={allSessions} macros={macros} accessory={allAccessory} weights={allWeights} testing={allTesting} deloads={allDeloads} runs={allRuns} />
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
