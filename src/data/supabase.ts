import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

// Resolve config from Vite's import.meta.env in the browser, or process.env when
// running under plain Node (the smoke test). The typeof-process guard keeps the
// browser path clean (Vite statically inlines import.meta.env.VITE_*).
let SUPABASE_URL: string | undefined
let SUPABASE_ANON_KEY: string | undefined
if (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL) {
  SUPABASE_URL = process.env.VITE_SUPABASE_URL
  SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
} else {
  SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase config — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
}

// Single shared client. This module (and repository.ts) are the ONLY files that
// touch Supabase — everything else works with plain app objects.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// ---- dev write-guard -------------------------------------------------------
// `npm run dev` reads .env.local, which points at the PROD Supabase project — so
// logging a session while testing locally writes real rows. To prevent that, the
// Vite dev server is WRITE-BLOCKED by default: every repository write calls
// assertWritable(), which throws unless you explicitly opt in with
// VITE_ALLOW_DEV_WRITES=true in .env.local. This is never active in a production
// build (import.meta.env.DEV is false), and never under Node (the smoke test sets
// process.env.VITE_SUPABASE_URL and isolates to a throwaway macro, so it must write).
function computeDevWritesBlocked(): boolean {
  if (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL) return false // Node (smoke test)
  return import.meta.env.DEV === true && import.meta.env.VITE_ALLOW_DEV_WRITES !== 'true'
}
export const DEV_WRITES_BLOCKED = computeDevWritesBlocked()

export function assertWritable(): void {
  if (DEV_WRITES_BLOCKED) {
    throw new Error(
      'Dev write-guard: writes are disabled on the dev server to protect the production database. ' +
        'Set VITE_ALLOW_DEV_WRITES=true in .env.local to allow writes (test on a throwaway macro).'
    )
  }
}

// ---- auth helpers ----------------------------------------------------------
export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

// Subscribe to auth changes; cb receives the user (or null).
export function onAuthChange(cb: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null))
}
