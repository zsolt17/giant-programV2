import React, { useState, useEffect, useCallback } from 'react'
import { onAuthChange, getUser, signOut } from '../data/supabase.js'
import * as repo from '../data/repository.js'
import { Shell, Center, Spinner, Tabs, Card, TopLoadingBar, SyncStatus } from './components.jsx'
import { saveSnapshot, readSnapshot } from '../data/cache.js'
import { Auth } from './Auth.jsx'
import { Setup } from './Setup.jsx'
import { Today } from './Today.jsx'
import { Calendar } from './Calendar.jsx'
import { History } from './History.jsx'
import { Deload } from './Deload.jsx'
import { computePosition } from '../engine/date-engine.js'
import { C } from './theme.js'

export function App() {
  const [user, setUser] = useState(undefined) // undefined = checking, null = logged out
  const [tab, setTab] = useState('today')
  const [macros, setMacros] = useState([])
  const [viewedMacroId, setViewedMacroId] = useState(null)
  const [macro, setMacro] = useState(null)
  const [weights, setWeights] = useState({})
  const [accessory, setAccessory] = useState({})
  const [sessions, setSessions] = useState([])
  const [deloads, setDeloads] = useState({})
  const [breakDays, setBreakDays] = useState({})
  const [testing, setTesting] = useState([])
  const [status, setStatus] = useState('idle')
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

  function applySnapshot(snap) {
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
      const b = target
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
    } catch (e) {
      // Offline / network failure: fall back to the last cached snapshot if we have one.
      const snap = readSnapshot()
      if (snap && snap.macro) {
        applySnapshot(snap)
        setStatus('ready')
      } else {
        setErr(String(e?.message || e))
        setStatus('error')
      }
    }
  }, [viewedMacroId])

  useEffect(() => {
    if (user) load()
  }, [user, load])

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

  // Cache the loaded bundle so reopening offline shows last-known data (incl.
  // optimistic offline writes, since those flow through state).
  useEffect(() => {
    if (status === 'ready' && user && macro) {
      saveSnapshot({ macros, viewedMacroId, macro, weights, accessory, sessions, deloads, breakDays, testing })
    }
  }, [status, user, macro, macros, viewedMacroId, weights, accessory, sessions, deloads, breakDays, testing])

  const onSaveSession = useCallback(async (record) => {
    const saved = await repo.saveSession(record)
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== saved.id).concat(saved)
      next.sort((a, b) => (a.date < b.date ? 1 : -1))
      return next
    })
    return saved
  }, [])

  const onDeleteSession = useCallback(async (id) => {
    await repo.deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const onToggleBreak = useCallback(async (iso, on) => {
    await repo.setBreakDay(iso, on)
    setBreakDays((prev) => {
      const next = { ...prev }
      if (on) next[iso] = true
      else delete next[iso]
      return next
    })
  }, [])

  const onApplyDeload = useCallback(
    async (weekKey, on) => {
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
    async (result) => {
      const saved = await repo.saveTestingResult({ ...result, macroId: macro.id })
      setTesting((prev) => prev.filter((r) => r.id !== saved.id).concat(saved))
      return saved
    },
    [macro]
  )

  const onDeleteTestingResult = useCallback(async (id) => {
    await repo.deleteTestingResult(id)
    setTesting((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const onSelectMacro = useCallback((id) => setViewedMacroId(id), [])

  const onRollMacro = useCallback(
    async (newStartISO) => {
      if (!macro) return
      const next = await repo.rollToNextMacro({ currentMacroId: macro.id, currentMacroNumber: macro.number, newStartISO })
      setViewedMacroId(next.id) // triggers reload via load()'s dependency
    },
    [macro]
  )

  if (user === undefined)
    return (
      <Shell>
        <TopLoadingBar />
        <Center>
          <Spinner /> Checking session…
        </Center>
      </Shell>
    )
  if (!user) return <Auth />
  // First load (nothing to show yet) gets the centered spinner; later reloads keep
  // the current content and show the slim top bar instead of blanking the screen.
  if ((status === 'idle' || status === 'loading') && !macro)
    return (
      <Shell onSignOut={signOut}>
        <TopLoadingBar />
        <Center>
          <Spinner /> Loading your data…
        </Center>
      </Shell>
    )
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

  const computed = macro ? computePosition(macro.startISO, macro.number, new Date()) : null
  if (computed) computed.startISO = macro.startISO

  const needsMacro = !macro

  return (
    <Shell onSignOut={signOut}>
      {status === 'loading' && <TopLoadingBar />}
      <Tabs tab={tab} setTab={setTab} />
      <SyncStatus online={online} pending={pending} />

      {needsMacro && tab !== 'setup' && (
        <Card style={{ textAlign: 'center', color: C.muted }}>No active macro yet — create one in the Setup tab.</Card>
      )}

      {tab === 'today' && macro && (
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
    </Shell>
  )
}
