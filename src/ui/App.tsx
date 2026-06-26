import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { onAuthChange, getUser, signOut } from '../data/supabase'
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
import { errMsg } from './controls'
import { computePosition, parseLocalDate } from '../engine/date-engine'
import { C } from './theme'

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
} from '../engine/types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = checking, null = logged out
  const [tab, setTab] = useState<TabKey>('today')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sessionRunning, setSessionRunning] = useState(false) // drives the Shell top inset for the fixed session bar
  const [trends, setTrends] = useState<TrendsData | null>(null) // all-macro data, loaded on first Trends open
  const [trendsErr, setTrendsErr] = useState('')
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
        : { weights: {}, accessory: {}, sessions: [], deloads: {}, breakDays: {}, testing: [] }
      setMacros(all)
      setMacro(target)
      setViewedMacroId(target?.id ?? null)
      setWeights(b.weights)
      setAccessory(b.accessory)
      setSessions(b.sessions)
      setDeloads(b.deloads)
      setBreakDays(b.breakDays)
      setTesting(b.testing)
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

  // Cache the loaded bundle so reopening offline shows last-known data (incl.
  // optimistic offline writes, since those flow through state).
  useEffect(() => {
    if (status === 'ready' && user && macro) {
      saveSnapshot({ macros, viewedMacroId, macro, weights, accessory, sessions, deloads, breakDays, testing })
    }
  }, [status, user, macro, macros, viewedMacroId, weights, accessory, sessions, deloads, breakDays, testing])

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
  if (!user) return <Auth />
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

  const computed = macro ? computePosition(macro.startISO, macro.number, devNow()) : null
  if (computed && macro) computed.startISO = macro.startISO

  const needsMacro = !macro

  // Fade the whole app in once on first boot (replacing the login/loading screen),
  // so the complete Today view appears as one deliberate unit. Runs once on mount.
  return (
    <div style={{ animation: 'gp-fade-in 0.4s ease' }}>
    <>
    <Shell sessionRunning={sessionRunning}>
      {status === 'loading' && <TopLoadingBar />}
      <SyncStatus online={online} pending={pending} />

      <Suspense fallback={<Center><Spinner /> Loading…</Center>}>
      {needsMacro && tab !== 'setup' && (
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
          onSaveSession={onSaveSession}
          onApplyDeload={onApplyDeload}
          onSaveTestingResult={onSaveTestingResult}
          onDeleteTestingResult={onDeleteTestingResult}
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
          onToggleBreak={onToggleBreak}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          onSaveTestingResult={onSaveTestingResult}
          onDeleteTestingResult={onDeleteTestingResult}
        />
      )}

      {tab === 'setup' && (
        <Setup
          key={macro?.id || 'new'}
          macro={macro}
          bundle={{ weights, accessory }}
          macros={macros}
          onReload={load}
          onSelectMacro={onSelectMacro}
          onRollMacro={onRollMacro}
        />
      )}

      {tab === 'history' && macro && (
        <History sessions={sessions} testingResults={testing} macroNumber={macro.number} onDeleteSession={onDeleteSession} />
      )}

      {tab === 'deload' && macro && <Deload sessions={sessions} deloads={deloads} macroNumber={macro.number} />}

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
      </Suspense>
    </Shell>

    <BottomNav tab={tab} setTab={setTab} onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
    {menuOpen && <MenuDrawer tab={tab} onSelect={setTab} onSignOut={signOut} onClose={() => setMenuOpen(false)} />}
    </>
    </div>
  )
}
