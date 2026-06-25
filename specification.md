# The Giant Program — Specification & Change Log

The living record of **what** has been built and **when** — it grows with the app.
Complements the other two docs (don't duplicate them):
- **`ARCHITECTURE.md`** (repo root) — the domain and the *why*.
- **`CONVENTIONS.md`** (repo root) — *how* the code is built.

## How to maintain this file
On every feature or fix, add a dated entry under a `## YYYY-MM-DD` heading
(**newest first**), one concise line per change, tagged `feat` / `fix` / `chore` /
`docs` and noting the area touched. Keep it factual — this is the project's history,
not marketing. Update **Current capabilities** when a change adds or removes a
user-facing capability.

---

## Current capabilities

- **Single-user auth** (Supabase email/password, RLS-protected).
- **Today** — date-computed position; full session prescription (warm-up, clean
  block on dips day, Giant Block, volume, carry) and logging. **Optional session
  timer:** Start → live timer → End, duration derived from `started_at`/`ended_at`,
  90-min auto-end safeguard, manual duration edit.
- **Calendar** — 15-week × Mon/Wed/Fri grid; log/edit/delete any session; mark breaks.
- **History** — latest top sets, recent-session feed, pull-up cluster trend, testing results.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (advise-and-confirm).
- **Setup** — per-cycle (C1/C2/C3) working-weights grid + cleans/carries, macro anchor,
  macro picker, and "start next macro" archiving (carries C3→C1).
- **Pull-ups** — phase-1 bodyweight cluster logging (OHP day) + trend. *(Phase-2 weighted: deferred.)*
- **Testing weeks** — record 2–3RM results per lift.
- **Global loading states** — instant splash on reload + slim top progress bar on data loads.
- **Accessibility** — keyboard-navigable tab bar (ARIA tablist + arrow keys), modal focus
  trap with Esc-to-close and focus return, labelled custom/icon-only controls, and a visible
  gold keyboard focus ring. Non-default tabs are code-split (lazy-loaded) to protect first load.
- **Deployed** to GitHub Pages: https://zsolt17.github.io/giant-programV2/ (auto-deploy on push to `main`).

---

## Change log

## 2026-06-25
- `chore(db)`: **schema hardening migration `0003_hardening.sql` + migrations runbook**
  (not yet applied — pending the CLI workflow). Adds CHECK constraints on the loose log
  fields now that the mappers normalize unset → NULL (the `*_speed` ∈ up/normal/down,
  `rpe`/`vol_rpe`/`carry_rpe` ∈ R6..R10, `carry_skip_reason` ∈ fatigue/schedule — all
  `NOT VALID` so legacy rows can't fail the run), a `nulls not distinct` unique index on
  `testing_results (macro_id, lift, tested_on)` to stop double-submit duplicates, and the
  FK/`date` indexes Postgres doesn't auto-create. New `supabase/MIGRATIONS.md` documents the
  Supabase-CLI workflow (link → reconcile hand-applied `0001`/`0002` → `db push`), forward-only
  conventions, and a `pg_dump` backup routine. Follow-up noted: switch `saveTestingResult` to
  `upsert(onConflict: 'macro_id,lift,tested_on')` so a re-save updates instead of erroring.
- `docs`: **`CONVENTIONS.md` moved into the repo root** (was `…/ACTIVE/Claude/`), next to
  `ARCHITECTURE.md` and `specification.md` — all three docs now co-locate and version with the
  code. Dropped the "cross-project" framing in §10 (the file is in practice Giant-Program-specific):
  to reuse the conventions, copy this file and strip the specifics rather than keeping it generic
  in place. Re-pointed the cross-references in all three docs; removed the now-empty `Claude/` folder.
- `docs`: **`ARCHITECTURE.md` moved into the repo and made the source of truth.** The
  domain/why brief now lives at the repo root (was `Downloads/ARCHITECTURE.md`), travelling
  with the code. Reframed from a "rebuild handoff brief" to a current-state domain reference
  (the once-"planned" items are all shipped); preserved all program logic (§2–§7), data model
  (§9, now incl. the `started_at`/`ended_at` timer columns), and decisions log. Re-pointed the
  cross-references in this file and `CONVENTIONS.md` to the new location. The old
  `Downloads/ARCHITECTURE.md` is superseded and can be deleted.
- `feat(a11y)` + `perf`: **accessibility pass + code-splitting (final architecture-audit
  item)**. **a11y:** `SessionModal` is now a real dialog — `role="dialog"` / `aria-modal` /
  `aria-labelledby`, plus a reusable `useFocusTrap` hook (`src/ui/useFocusTrap.ts`) that
  moves focus in on open, traps Tab / Shift+Tab, closes on **Esc**, and **restores focus** to
  the opener on close (`×` got `aria-label="Close"`). The tab bar is an ARIA **tablist** with
  roving tabindex + Left/Right/Home/End keys + `aria-selected`. Icon-only / custom controls
  labelled: `SpeedPick` arrows (`aria-label` Faster/Same/Slower + `aria-pressed`, glyph
  `aria-hidden`), difficulty-peek + cycle pickers (`aria-pressed`), Setup weight & accessory
  inputs (`aria-label`), Auth inputs wired via `htmlFor`/`id`. Restored a visible **keyboard
  focus ring** (`global.css :focus-visible` gold outline; dropped the inline `outline:none`
  on `inp`). Muted text on navy measured **~5.4:1** — passes WCAG AA, so no brand-colour
  change. Verified live in-browser: dialog focus-in → Esc → focus-return, tablist roving,
  labelled inputs, focus-ring rule shipped. **code-splitting:** the four non-default tabs
  (Calendar/History/Deload/Setup) are now `React.lazy` behind one `<Suspense>` (Today stays
  eager) — initial JS **121.9 → 116.1 KB gzip** (−4.8%), with tab screens split into
  on-demand chunks (Calendar 3.9 / Setup 2.9 / History 1.8 / Deload 1.0 KB gzip).
  `@supabase` deliberately left in the main chunk (needed at boot for the auth check); the
  Sentry chunk was already lazy. typecheck + 38 tests + build all green.
- `chore(ts)`: **TypeScript migration — Stage 4 (UI)** (audit #8). Converted all of
  `src/ui/*.jsx` → `.tsx` plus `main`, `monitoring`, `theme`, `useWakeLock` → `.ts`;
  `index.html` now loads `/src/main.tsx`. Typed every component's props (containers,
  forms, shared chrome) against the engine/data domain types. Added two **form-draft
  types** to `engine/types.ts` — `SessionDraft` (numeric inputs hold raw strings until
  the mappers coerce them) and `LiftWeightsInput` (Setup's loose H/M/L cell) — and
  widened the persistence inputs (`sessionToRow`/`saveSession`,
  `weightsToRows`/`saveWorkingWeights`) to accept them, documenting that the data layer
  coerces form input. Style objects typed `CSSProperties`; shared `errMsg(unknown)` +
  `TabKey` helpers. Dropped dead code surfaced by `noUnusedLocals` (`SessionForm`'s
  unused `w`/`s1`/`round`/`set1Weight`). Minor honesty fix: testing-result `reps` now
  coerces `'' → null` like `weight`. typecheck + 38 tests + build all green; dev-server
  smoke renders the branded auth screen with no console errors. **Migration complete.**
- `chore(ts)`: **TypeScript migration — Stage 3 (data layer)** (audit #8). Converted
  `mappers`, `supabase`, `repository`, `offline-queue`, `cache` to `.ts`. Typed the
  **row↔app boundary** (`SessionRow`/`MacroRow`/… ↔ `Session`/`Macro`/…) — the
  highest-value step for catching field/null bugs. Added domain types (`Macro`,
  `WeightsByCycle`, `AccessoryByCycle`, `TestingResult`, `MacroBundle`) to
  `engine/types.ts`, and `@types/node`. Data-module imports made extensionless.
  typecheck + 38 tests + build + smoke (22/22, real data untouched) all green.
  Stage 4 (UI `.jsx`→`.tsx`) next.
- `chore(ts)`: **TypeScript migration — Stage 2 (engine)** (audit #8). New
  `src/engine/types.ts` (domain types: `Difficulty`, `Lift`, `WeekType`, `Position`,
  `Session`, `Scheme`, `MacroWeekRow`, etc.); converted `constants`, `date-engine`,
  `loading`, `deload-rule`, `pullups` to typed `.ts`. Engine-module imports made
  **extensionless** (Vite doesn't auto-remap `.js`→`.ts` at runtime the way `tsc`
  does — extensionless resolves everywhere: Vite, tsc-bundler, tsx). typecheck +
  38 tests + build all green; engine behavior unchanged. Stages 3–4 (data → UI) next.
- `chore(ts)`: **TypeScript migration — Stage 1 (tooling)** (audit #8). Added
  TypeScript + React 18 types, strict `tsconfig.json` (`allowJs` for incremental
  conversion, `noEmit` — Vite builds), `typecheck` script. **Switched test runner to
  Vitest** (resolves `.js`→`.ts` imports as modules convert; `node:assert` kept, so
  assertions are unchanged); smoke test now runs via the `tsx` loader. CI runs
  `typecheck` + tests before build. All code still JS; 38 tests + typecheck + build +
  smoke all green. Stages 2–4 (engine → data → UI) to follow.

## 2026-06-24
- `feat`: **PWA — offline logging (audit #7, stage B)** — durable write queue
  (`src/data/offline-queue.js`, localStorage) for session save/delete: while offline
  the write is queued and the UI updates optimistically; on reconnect `repo.flushQueue`
  replays it (safe — idempotent upsert-by-id), and `load()` flushes before reading.
  A bundle cache (`src/data/cache.js`) snapshots the last-loaded data so reopening
  offline shows real data, not a "couldn't load" screen. A `SyncStatus` strip shows
  offline / N-pending. Repository is browser-guarded so the Node smoke test is
  unaffected. Verified deterministically: offline save → queued (not written) →
  reconnect → flushed to DB → queue cleared.
- `feat`: **PWA — installable + offline app shell (audit #7, stage A)** — real web
  manifest (navy/gold, `standalone`, `/giant-programV2/` scope), generated icons
  (192/512/maskable + iOS apple-touch-icon, navy dumbbell emblem via
  `scripts/gen-icons.mjs` → `public/`), iOS PWA metas in `index.html`, and a service
  worker (`vite-plugin-pwa`/Workbox, `autoUpdate`) precaching the built app shell
  (14 entries) so it opens & renders offline; Google Fonts cached at runtime. Stage B
  (offline write queue) next.
- `feat`: **error monitoring (Sentry)** wired (`src/monitoring.js`) — **inert until
  `VITE_SENTRY_DSN` is set**, and lazy-loaded so it's tree-shaken out entirely while
  off (zero bundle cost — verified main chunk unchanged). `ErrorBoundary` forwards
  render crashes via `captureError`; Sentry's default integrations capture unhandled
  errors/promise rejections once enabled. DSN goes in `.env.production` (public client
  key). **Enabled in production** — verified a real test event delivered to the Sentry
  dashboard (ingest responded `200`). Sentry loads as a lazy chunk; main bundle
  unchanged. (Audit item #4.)
- `chore(test)`: **smoke test no longer touches real data** — it ran against the
  real macro and *deleted its weights* on cleanup (a footgun once real data
  existed). Rewritten to run against a throwaway macro (number 999, status
  `completed`) that's cascade-deleted at the end (`scripts/smoke-test.js`). Verified
  macro 2's weights/sessions unchanged across a run. (Audit item #3.)
- `feat`: **keep screen awake while a session runs** — `useWakeLock` hook
  (Screen Wake Lock API) held only while the timer is running (battery-friendly),
  re-acquired on visibility regain, no-op where unsupported/denied (e.g. Low Power
  Mode). Wired in `Today.jsx` `SessionEditor` (`useWakeLock(running)`).
- `feat`: **session timer on Today** — optional Start/End timer, three states
  (not-started: prescription locked + "Start session"; running: live mm:ss + "End
  session"; completed: duration + editable "Edit (min)" + "Update"). Backed by
  `started_at`/`ended_at` (`timestamptz`, migration `0002_session_timer.sql`);
  duration is always **derived**, never stored. Clock is recomputed from
  `started_at` each render, so it survives sleep / backgrounding / reopen. **90-min
  auto-end safeguard** (evaluated from `started_at`, fires even if the app was
  closed) caps the end and appends "auto-ended at 90 min". No auto-start. Files:
  `Today.jsx` (timer + `TimerBar`), `SessionForm.jsx` (`locked` prop), `mappers.js`.
  Verified end-to-end incl. auto-end persistence.
- `feat`: **calendar duration edit** — the `SessionModal` now shows + edits the
  duration of a timed session (editable-after-the-fact for past days). `mm:ss`
  formatter `fmtClock` extracted to `controls.jsx` and shared by Today + the modal.
  Verified: edited a past session's duration → persisted.
- `feat`: **error boundary** — a render crash now shows a branded recovery screen
  with a Reload button instead of a blank page (`ErrorBoundary.jsx`, wrapping `App`
  in `main.jsx`).
- `fix`: **save handlers surface failures** — `try/catch` + visible "couldn't save —
  retry" on session, calendar-modal, and testing-result saves (and delete), so a
  failed write (e.g. flaky gym wifi) no longer silently sticks on "Saving…" and lose
  the entry (`Today.jsx`, `SessionModal.jsx`, `TestingResultForm.jsx`).
- `chore(ci)`: deploy workflow now runs `npm test` before `npm run build` — engine
  tests gate the deploy (`deploy.yml`).
- `fix(mobile)`: iOS date inputs were overflowing their card (native intrinsic
  width) — added `-webkit-appearance:none` via a shared `DATE_INPUT` style applied to
  both Setup date fields so they respect their container (`Setup.jsx`). This is the
  actual cure for the iOS date-input sizing saga (min-width/stacking only mitigated it).
- `feat`: **sticky tab nav** — the menu pins to the top of the viewport on scroll so
  it's always reachable (e.g. at the bottom of the Calendar) (`components.jsx` Tabs).
- `fix(mobile)`: **stacked** the Macro start / Macro # fields vertically — the
  `min-width:0` approach didn't hold for the iOS native date input in standalone
  (home-screen) mode; stacking removes the side-by-side overlap entirely (`Setup.jsx`).
- `fix(mobile)`: (superseded by the above) tried `min-width:0` on the grid items +
  `min-width:0`/`max-width:100%` on the shared input style for the date-input overflow
  (`theme.js`, `Setup.jsx`).
- `feat`: global loading indicators — instant pre-React splash baked into
  `index.html` (removed on mount via `main.jsx`) + `TopLoadingBar` shown during data
  loads; first load keeps the centered spinner, reloads keep content (`App.jsx`,
  `components.jsx`, `global.css`).
- `fix(mobile)`: sign-out button no longer overlaps the title (moved to its own
  right-aligned row); separated the Macro start / Macro # fields (`components.jsx`,
  `Setup.jsx`).
- `docs`: added `CONVENTIONS.md` (cross-project reference, kept in `Downloads/Claude/`)
  and this `specification.md`.

## 2026-06-23
- `chore(ci)`: bumped `actions/checkout` + `setup-node` to v5 (Node 24 runtime).
- `fix(deploy)`: locked GitHub Pages source to "GitHub Actions" (`build_type: workflow`)
  after a legacy branch-build raced and served the raw source `index.html`.
- `feat`: **deployed** to GitHub Pages — `.github/workflows/deploy.yml` builds the
  Vite app and publishes on push to `main`; `vite.config.js` base `/giant-programV2/`
  for builds; public Supabase keys committed in `.env.production`.
- `feat`: **full rebuild** of the app — monolithic single-file `index.html` → modular
  Vite + React + Supabase. Delivered in 8 verified steps:
  1. Supabase schema + RLS + single-user auth (`supabase/migrations/0001_init.sql`).
  2. Data layer — `supabase.js` / `mappers.js` / `repository.js` (only files that touch the backend).
  3. Date engine + loading math ported verbatim into `src/engine/` with unit tests.
  4. **Per-cycle working weights** in Setup — the motivating fix (a session reads its
     own cycle's weights; logging a C1 session no longer prefills C3).
  5. Today + shared `SessionForm` + Calendar.
  6. Reactive deload rule + History + Deload tabs (+ `fmt` made null-safe — a weightless
     session was crashing the calendar/history).
  7. Pull-up cluster logging (phase 1).
  8. Testing-result logger + multi-macro archiving.

## ≤ 2026-06-22 (pre-rebuild)
- Original single-file app: `index.html` (React via CDN) on a Google Sheets backend,
  hosted on GitHub Pages. Superseded by the 2026-06-23 rebuild; preserved in git history.
