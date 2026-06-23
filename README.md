# The Giant Program

Personal training-log web app. Vite + React front end, Supabase backend.
See `../ARCHITECTURE.md` for the full brief and `docs/` for per-step setup.

## Layout
```
supabase/migrations/   SQL schema + RLS (Step 1)
src/data/              data layer — the ONLY code that touches Supabase
  supabase.js          client init + auth
  mappers.js           row <-> app-object coercion
  repository.js        all reads/writes
src/engine/            date engine, loading math, deload rule (Step 3+, TBD)
src/ui/                React UI (Step 5+, TBD)
scripts/smoke-test.js  data-layer verification against the live DB
```

## Setup
1. Install Node LTS (20+). Then `npm install`.
2. `.env.local` holds the Supabase URL + publishable key (already filled) and,
   for the smoke test only, your user email/password.

## Commands
- `npm run dev` — start the Vite dev server (placeholder UI until Step 5).
- `npm run smoke` — run the data-layer round-trip test against Supabase.
- `npm run build` — production build.
