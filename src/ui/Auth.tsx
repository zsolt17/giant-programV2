import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from '../data/supabase'
import { C, HEADING, cardStyle, btnPrimary, inp, lbl } from './theme'
import { Shell } from './components'

// `dataLoading` is driven by App: after sign-in succeeds, App keeps this screen
// mounted (with the held loading state) through the first macro-bundle fetch, so the
// user goes straight from the spinning button to a fully-populated Today — no
// intermediate empty shell. We never reset our own busy flag on success (we unmount).
export function Auth({ dataLoading = false }: { dataLoading?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const loading = busy || dataLoading

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signIn(email.trim(), password)
      // Stay loading — App holds us through the data fetch, then swaps in the app.
    } catch (ex) {
      setErr((ex as { message?: string })?.message || 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} style={{ ...cardStyle, maxWidth: 360, margin: '0 auto' }}>
        <div style={{ fontFamily: HEADING, fontSize: 22, letterSpacing: '0.05em', color: C.gold, marginBottom: 14 }}>SIGN IN</div>
        <label style={lbl} htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          style={{ ...inp, opacity: loading ? 0.5 : 1 }}
          type="email"
          value={email}
          autoComplete="username"
          disabled={loading}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label style={{ ...lbl, marginTop: 12 }} htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          style={{ ...inp, opacity: loading ? 0.5 : 1 }}
          type="password"
          value={password}
          autoComplete="current-password"
          disabled={loading}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{err}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ ...btnPrimary, width: '100%', marginTop: 16, background: loading ? '#8a6f30' : btnPrimary.background, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {loading ? (
            <>
              {/* reuses the .spin keyframe; recoloured dark so it reads on the gold button */}
              <span className="spin" style={{ borderColor: 'rgba(26,37,53,0.3)', borderTopColor: C.dark }} aria-hidden="true" />
              <span>Signing in…</span>
            </>
          ) : (
            'Sign in'
          )}
        </button>
        {loading && (
          <div style={{ fontSize: 12, color: '#c9a84c80', textAlign: 'center', marginTop: 8, animation: 'gp-fade-in 0.4s ease' }}>Loading your program…</div>
        )}
      </form>
    </Shell>
  )
}
