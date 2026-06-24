import React, { useState, useEffect, useCallback } from 'react'
import { onAuthChange, getUser, signOut } from '../data/supabase.js'
import * as repo from '../data/repository.js'
import { Shell, Center, Spinner, Tabs, Card, TopLoadingBar } from './components.jsx'
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

  useEffect(() => {
    getUser()
      .then(setUser)
      .catch(() => setUser(null))
    const {
      data: { subscription },
    } = onAuthChange((u) => setUser(u))
    return () => subscription.unsubscribe()
  }, [])

  const load = useCallback(async () => {
    setStatus('loading')
    setErr('')
    try {
      const all = await repo.getMacros()
      const target =
        (viewedMacroId && all.find((m) => m.id === viewedMacroId)) ||
        all.find((m) => m.status === 'active') ||
        all[all.length - 1] ||
        null
      if (target) {
        const b = await repo.loadMacroBundle(target.id)
        setWeights(b.weights)
        setAccessory(b.accessory)
        setSessions(b.sessions)
        setDeloads(b.deloads)
        setBreakDays(b.breakDays)
        setTesting(b.testing)
      } else {
        setWeights({})
        setAccessory({})
        setSessions([])
        setDeloads({})
        setTesting([])
      }
      setMacros(all)
      setMacro(target)
      setViewedMacroId(target?.id ?? null)
      setStatus('ready')
    } catch (e) {
      setErr(String(e?.message || e))
      setStatus('error')
    }
  }, [viewedMacroId])

  useEffect(() => {
    if (user) load()
  }, [user, load])

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
