# The Giant Program

Personal training-log web app (single-user PWA). Vite + React + TypeScript
front end, Supabase (Postgres + Auth + RLS) backend. Deployed to GitHub Pages:
https://zsolt17.github.io/giant-programV2/

Three docs at the repo root are the source of truth — read them before making
changes, and keep them updated alongside code:
- **`ARCHITECTURE.md`** — the domain and the *why*.
- **`CONVENTIONS.md`** — *how* the code is built (layout, testing, migrations).
- **`specification.md`** — dated change log of what shipped, when.

## Layout
```
supabase/migrations/   SQL schema + RLS, forward-only, numbered 000N_name.sql
src/data/               data layer — the ONLY code that touches Supabase
  supabase.ts           client init + auth
  mappers.ts             row <-> app-object coercion
  repository.ts          all reads/writes
  cache.ts                local snapshot cache (App.tsx-only, not the source of truth)
  offline-queue.ts        queues writes made while offline, flushes on reconnect
src/engine/             pure logic — date/position math, loading math, deload
                         rule, session-summary text generator, etc. No React,
                         no Supabase imports. Colocated *.test.js (Vitest).
src/ui/                 React UI (App.tsx is the shell: auth gate, tab routing)
scripts/smoke-test.js   data-layer round-trip verification against the live DB
scripts/gen-icons.mjs   regenerates PWA icons from a source image (manual)
```

## Setup
1. Install Node LTS (24 dev / 22 CI). Then `npm install`.
2. `.env.local` holds the Supabase URL + publishable key and, for the smoke
   test only, your user email/password (`.env.example` documents every key).

## Commands
- `npm run dev` — start the Vite dev server.
- `npm test` — run the engine/data unit tests (Vitest).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run smoke` — data-layer round-trip test against the live Supabase DB
  (uses a throwaway macro, cascade-deleted at the end).
- `npm run build` — production build.
