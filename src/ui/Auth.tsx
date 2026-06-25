import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from '../data/supabase'
import { C, HEADING, cardStyle, btnPrimary, inp, lbl } from './theme'
import { Shell } from './components'

export function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signIn(email.trim(), password)
      // onAuthChange in App will swap us out of this screen.
    } catch (ex) {
      setErr((ex as { message?: string })?.message || 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} style={{ ...cardStyle, maxWidth: 360, margin: '0 auto' }}>
        <div style={{ fontFamily: HEADING, fontSize: 22, letterSpacing: '0.05em', color: C.gold, marginBottom: 14 }}>
          SIGN IN
        </div>
        <label style={lbl}>Email</label>
        <input
          style={inp}
          type="email"
          value={email}
          autoComplete="username"
          onChange={(e) => setEmail(e.target.value)}
        />
        <label style={{ ...lbl, marginTop: 12 }}>Password</label>
        <input
          style={inp}
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...btnPrimary, width: '100%', marginTop: 16, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  )
}
