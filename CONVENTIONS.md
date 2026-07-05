# The Giant Program — Code Conventions

A reference for working on the codebase consistently. This covers **how** the code
is built; the domain and the **why** live in `ARCHITECTURE.md` (at the repo
root), and the dated record of **what** changed lives in the
repo's `specification.md` (see §10). Where they overlap, this file links rather than repeats.

> **Code location:** the app is a git repo at
> `Downloads/01_Projects/ACTIVE/APP - The Giant Program` (GitHub:
> `zsolt17/giant-programV2`). All paths below are relative to that repo root.
> These conventions were extracted from the actual code, not invented.

---

## 1. Project structure

```
src/
  data/            data layer — the ONLY code that touches the backend
    supabase.ts    Supabase client init + auth helpers
    mappers.ts     pure DB-row <-> app-object coercion (no DB calls); typed row<->app
    repository.ts  every read/write; all functions throw on error
    offline-queue.ts / cache.ts  offline write queue + last-known snapshot (PWA)
  engine/          pure domain logic, framework-agnostic, unit-tested
    types.ts       shared domain types (Difficulty, Lift, Position, Session, SessionDraft, …)
    constants.ts   ROTATION, SCHEMES, DAY_SPREAD/SET_LADDER/VOLUME_PCT (anchor cascade), DAY_META, SECONDARY_ITEM (day→recorded-accessory), BLOCK_COMPLETION, PULLUP, SIGNALS, TESTING_SCHEDULE, MACRO_WEEKS
    date-engine.ts position math from the macro start date (see §7)
    loading.ts     single-anchor cascade (dayTop/expandDayTops/giantSets/volumeWeight), 2.5 kg rounding, fmt
    deload-rule.ts reactive-deload signals + trigger
    trends.ts      pure derivations: Session/accessory/deload -> Trends chart view-models
    export-csv.ts  pure Session[] -> CSV string (Data page "Download all data")
    session-summary.ts  pure Session -> plain-text share summary (Data page "Copy")
    recovery-content.ts  static Recovery content (joints/tendons/exercises + 64x64 SVGs, PHASE_DOSE)
    recovery.ts    local-date phase/day helpers for Recovery (suggestedPhase/effectivePhase/protocolDay)
    pullups.ts     phase-1 cluster parsing/totals
    *.test.js      Vitest unit tests (node:assert), colocated with each module
  ui/              React components (presentational + container)
    App.tsx        shell: auth gate, top-level state, tab routing, all handlers
    Today.tsx, Calendar.tsx, History.tsx, Deload.tsx, Setup.tsx, Trends.tsx, Data.tsx, Recovery.tsx, Auth.tsx
    SessionForm.tsx     shared prescription + log fields (Today + SessionModal)
    SessionModal.tsx    calendar-cell overlay wrapping SessionForm / TestingResultForm
    TestingResultForm.tsx
    Trends.tsx      charts/analytics tab (recharts); renders engine/trends.ts view-models
    nav.tsx         BottomNav + MenuDrawer + inline SVG icon set
    components.tsx  shared shell bits (Shell, Card, BlockTitle, Center, Spinner)
    controls.tsx    shared log controls (Row, SpeedPick, LogRpe, PositionHeader, errMsg)
    theme.ts        design tokens + shared CSSProperties style objects
    global.css      base CSS (reset, body bg, fonts, .spin keyframes)
  main.tsx          mounts <App/> in React.StrictMode, imports global.css
supabase/migrations/  numbered SQL schema + RLS (0001_init.sql, …); see MIGRATIONS.md
supabase/MIGRATIONS.md  how migrations are applied (Supabase CLI) + backup routine
scripts/smoke-test.js data-layer round-trip test against live Supabase
.github/workflows/deploy.yml  GitHub Pages deploy
```

**Hard rule: only `src/data/` touches Supabase.** `repository.ts` and `supabase.ts`
are the sole modules that import the Supabase client. Everything above the data
layer works with plain app objects, so the backend is swappable in one place. The
engine never imports from `data/` or `ui/`; the UI never calls Supabase directly —
it calls repository functions (always via handlers passed down from `App.tsx`).

---

## 2. Tech stack & build

- **Language:** TypeScript (strict). The whole app is `.ts`/`.tsx` — engine, data
  layer, and UI. Shared domain types live in `src/engine/types.ts`; the row↔app
  boundary is typed in `data/mappers.ts`. `tsconfig.json` is `noEmit` (Vite builds;
  `tsc` only typechecks via `npm run typecheck`). Imports are **extensionless** (Vite
  doesn't auto-remap `.js`→`.ts` at runtime the way `tsc` does). Form-draft types
  (`SessionDraft`, `LiftWeightsInput`) keep UI input loose (string-holding inputs)
  while the persistence layer coerces them — the data-layer write functions accept
  these looser shapes.
- **Framework:** React 18 (function components + hooks), TSX. Style objects are typed
  `CSSProperties`; per-component prop interfaces sit alongside each component.
- **Build tool:** Vite 7 (rollup-based) + `@vitejs/plugin-react` 5. ES modules; `package.json` has `"type": "module"`.
- **Code-splitting:** the default view loads eagerly; non-default tab screens are
  `React.lazy` behind a single `<Suspense>` in `App` (fallback = the standard `Spinner`),
  so each is an on-demand chunk. Keep boot-critical deps eager — `@supabase` is needed for
  the startup auth check, so it stays in the main chunk; only split what isn't needed for
  first paint. Sentry is already a lazy chunk (DSN-gated; see §6). **recharts** (the only
  charting lib, used by `Trends.tsx`) is heavy (~120 KB gzip) and lives entirely in the
  lazy Trends chunk — keep it that way; never import recharts from an eager module.
- **Backend:** Supabase (`@supabase/supabase-js` v2) — Postgres + Auth + Row Level Security. Schema in the numbered `supabase/migrations/` files (see `ARCHITECTURE.md` §9 for the model, `supabase/MIGRATIONS.md` for the apply/backup workflow).
- **Node:** installed via nvm (Node 22+). Shells must source nvm first:
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`.

**Scripts** (`package.json`):
- `npm run dev` — Vite dev server (base `/`, port 5173).
- `npm run build` — production build to `dist/` (base `/giant-programV2/`).
- `npm run preview` — serve the production build.
- `npm test` — unit tests via **Vitest** (`vitest run`; colocated `*.test.js`, kept on
  `node:assert`).
- `npm run typecheck` — `tsc --noEmit` (strict). CI runs typecheck + test before build.
- `npm run smoke` — data-layer test against live Supabase (`node --env-file=.env.local --import tsx`).

**Env variables** (Vite inlines `VITE_`-prefixed vars at build time):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public client config. Safe to ship
  (publishable key + RLS). Live in `.env.local` (dev, gitignored) **and**
  `.env.production` (committed, used by `npm run build` locally and in CI).
- `SMOKE_EMAIL`, `SMOKE_PASSWORD` — only for `npm run smoke`. **`.env.local` only,
  never committed.** `vite.config.js` sets `base` to `/giant-programV2/` for builds
  and `/` for dev.
- `VITE_ALLOW_DEV_WRITES` — dev write-guard opt-in (default off/blocked). See below.

**Dev write-guard (don't remove it).** `.env.local` points the dev server at the **PROD**
Supabase project, so `npm run dev` browser testing would write real rows. To prevent that, the
dev server is **write-blocked by default**: every write in `repository.ts` calls `assertWritable()`
(`supabase.ts`), which throws unless `VITE_ALLOW_DEV_WRITES=true` is set in `.env.local`;
`flushQueue()` no-ops when blocked. A fixed on-screen **DEV banner** (`App.tsx` `DevBanner`, gated on
`import.meta.env.DEV`) shows the state — green "writes blocked" / red "writes ON → PROD". The guard
is computed once (`DEV_WRITES_BLOCKED`) and is **inert in production** (`import.meta.env.DEV` false →
tree-shaken) and **inert under Node** (the smoke test sets `process.env.VITE_SUPABASE_URL` and
isolates to a throwaway macro, so it must write). To deliberately test the write path locally, flip
the flag to `true` and use a throwaway macro, then flip it back. **Any new `repository.ts` write
must call `assertWritable()` first.**

**Deploy:** push to `main` → `.github/workflows/deploy.yml` builds and publishes to
GitHub Pages. **Pages source must be "GitHub Actions"** (API `build_type: workflow`).
If it's ever switched to "Deploy from a branch", a branch-build serves the *raw*
`index.html` (which points at `/src/main.tsx`) and the live site 404s — that bug has
bitten this repo once.

---

## 3. Data layer conventions

**`supabase.ts`** creates one shared client and exports auth helpers (`signIn`,
`signOut`, `getUser`, `onAuthChange`). It resolves config from `import.meta.env` in
the browser and `process.env` under Node (so the smoke test works) via a
`typeof process` guard.

**`mappers.ts`** — pure functions, no DB calls. App objects use **camelCase**; DB
rows use **snake_case**. Two normalizers are applied on the way *to* the DB:
- `blankToNull(v)` — `'' | undefined → null` (unset `<select>`s come through as `''`;
  columns stay clean).
- `toNum(v)` — `'' | null | undefined → null`, else `Number(v)`.
Each entity has a `rowToX` / `xToRow` pair (e.g. `rowToSession` / `sessionToRow`).
Per-cycle weights map to nested shapes: `rowsToWeights` → `{ [cycle]: { [lift]: {hard,medium,light} } }`;
`rowsToAccessory` → `{ [cycle]: { [item]: weight } }`.

**`repository.ts`** — every function is `async`, awaits the Supabase call, and
**throws on `error`** (callers handle failures). Patterns:
- **Per-cycle weights** are keyed by `(macro_id, cycle, lift)`; writes use
  `upsert(rows, { onConflict: 'macro_id,cycle,lift' })` (accessory: `...,item`). This
  is the relational fix for the per-cycle bug — a session reads its own cycle's grid.
- **Sessions use upsert-by-id**: the id is the human-readable
  `` `${date}-${dayType}-${difficulty[0].toUpperCase()}` `` (e.g. `2026-06-22-squat-H`),
  so logging is idempotent — `saveSession` does `upsert(row, { onConflict: 'id' })`.
- `loadMacroBundle(macroId)` fetches weights/accessory/sessions/deloads/breakDays/
  testing in one `Promise.all` for app boot.
- `rollToNextMacro(...)` archives a macro: completes the current one, creates the
  next, and carries C3 working+accessory weights forward as the new C1.
- Reads return mapped app objects; `getBreakDays` is user-scoped (RLS via `user_id`),
  everything else is macro-scoped.

**Offline (PWA).** `saveSession`/`deleteSession` detect offline/network failure and
enqueue to `offline-queue.ts` (localStorage), resolving optimistically so the UI
updates; `flushQueue()` replays on reconnect (safe because writes are idempotent
upserts), and `load()` flushes before reading. `cache.ts` snapshots the loaded bundle
so reopening offline shows last-known data. All of this is **browser-guarded**
(`typeof navigator/window`) so the Node smoke test path is unaffected. Any new
mutation meant to work offline must be idempotent and routed through this queue.

---

## 4. State management

All app state lives in **`App.tsx`** (no external state library, no context):
`user`, `tab`, `macros` (list) + `viewedMacroId`, the active `macro`, and the loaded
bundle pieces (`weights`, `accessory`, `sessions`, `deloads`, `breakDays`, `testing`).

- **Boot:** `getUser()` + `onAuthChange` gate on auth → `Auth` screen if logged out.
  Once authed, `load()` fetches macros, picks the viewed/active macro, and loads its
  bundle. `load` depends on `viewedMacroId`, so selecting another macro re-loads.
- **Writes are optimistic-after-persist:** handlers (e.g. `onSaveSession`,
  `onApplyDeload`, `onToggleBreak`, `onSaveTestingResult`, `onRollMacro`) call the
  repository, then update local state from the returned object — no full reload per write.
- **Data flows down as props; updates flow up via handler callbacks.** Leaf
  components are controlled and never call the repository themselves.
- `computePosition(macro.startISO, macro.number, new Date())` is computed in `App`
  each render and passed to `Today` as `computed`.

---

## 5. Naming & code style

- **Files:** React components are `PascalCase.tsx` (one main component each); shared
  component/util grab-bags are lowercase (`components.tsx`, `controls.tsx`). Engine/
  data modules are `kebab-or-lower.ts`. Tests are `<module>.test.js` colocated (run by
  Vitest, which resolves the `.ts` imports).
- **Components:** named function components (`export function Today(...)`). Small
  private sub-components live in the same file (e.g. `SessionEditor`, `PullupCluster`,
  `SignalBanner`).
- **App objects camelCase, DB rows snake_case** — the boundary is `mappers.ts` only.
- **Styling is inline style objects** pulled from `theme.ts` (`cardStyle`, `inp`,
  `lbl`, `btnPrimary`) spread with local overrides; no CSS modules / Tailwind. Only
  `global.css` holds non-inline CSS.
- **Test hooks:** interactive inputs carry `data-*` attributes for verification
  (`data-lift`, `data-diff`, `data-item`, `data-pullup-cluster`). Keep these when
  editing those inputs.
- IDs and keys are derived deterministically (session id; `weekKey` = `M{n}C{meso}W{week}`
  via `weekKeyFor`).

---

## 6. Design system

Tokens in `src/ui/theme.ts`, object `C`:

| token | value | use |
|-------|-------|-----|
| `navy` | `#2E4057` | secondary surfaces |
| `dark` | `#1a2535` | app background |
| `gold` | `#C9A84C` | brand accent, primary actions, "today" |
| `off` | `#f0f3f7` | body text |
| `muted` | `#8A9BB0` | secondary text |
| `green` | `#8ddcb0` | logged / unbroken / saved |
| `red` | `#e88888` | missed / hard / deload-triggered / delete |
| `blue` | `#7eb8f7` | break / volume |

**State colours** (calendar cells, `Calendar.tsx` `STATE_COLOR`): logged → green,
missed → red, today → gold, upcoming → muted, break → blue.
**Difficulty colour:** `pillColor(d)` → hard = red, medium = gold, light = green.

**Fonts:** `HEADING = "'Bebas Neue'"` (headings/lift names), `BODY = "'DM Sans'"`
(everything else); loaded via `<link>` in `index.html`.

**Shared UI — reuse these, don't re-roll:**
- `components.tsx`: `Shell` (page chrome; reserves the fixed-bar zones — see Navigation),
  `Card`, `BlockTitle`, `Center`, `Spinner`, `TopLoadingBar`, `SyncStatus`.
- `nav.tsx`: `BottomNav` (fixed bottom icon nav) + `MenuDrawer` (right slide-in) + the
  inline SVG icon set.
- `controls.tsx`: `Row` (label/desc/value line), `SpeedPick` (↑→↓), `LogRpe`
  (RPE + bar-speed), `PositionHeader` (M·C·W header with difficulty peek),
  `blockTitle`, `speedArrow`, `antagDesc`, `fmtClock`, `errMsg` (unknown→message).
- `theme.ts`: `cardStyle`, `btnPrimary`, `inp`, `lbl`, `pillColor` (all `CSSProperties`).
- `useFocusTrap.ts` / `useWakeLock.ts`: dialog focus-trap + screen wake-lock hooks.

**Navigation (`nav.tsx`):** a **fixed bottom icon bar** (`BottomNav`) is the primary nav —
Today / Calendar / History / **Menu** (burger), thumb-reachable, `position: fixed; bottom: 0`,
active item in gold. **Menu** opens `MenuDrawer`, a right slide-in dialog holding the secondary
destinations (Deload, Setup) + Sign out; add entries via its `MENU_ITEMS` array (no
placeholders for things that don't exist). **Two fixed bars, two zones:** the bottom is owned by
nav (always); the **top** is owned by the running-session bar (`Today`'s `SessionControlBar`,
only while running). They must never both sit at the bottom. **`Shell` reserves both zones** —
`padding-bottom` for the nav always, `padding-top` while `sessionRunning` — using
`env(safe-area-inset-*)`, so content is never hidden behind either bar. Don't pad for these
bars in feature components; let `Shell` own it (lift a `running`-style flag up if a new fixed
bar needs space).

**Accessibility (apply to all interactive UI):**
- **Modals are dialogs.** Use `useFocusTrap(ref, onClose)` (`src/ui/useFocusTrap.ts`): it
  moves focus into the dialog on open, traps Tab / Shift+Tab, closes on **Esc**, and
  **restores focus to the opener** on close. Give the container `role="dialog"
  aria-modal="true" aria-labelledby={titleId}` + `tabIndex={-1}` (see `SessionModal`).
- **Bottom nav = `<nav aria-label="Primary">`** of buttons; the active destination carries
  `aria-current="page"` (gold). The Menu button is `aria-haspopup="dialog"` + `aria-expanded`;
  its drawer is a focus-trapped `role="dialog" aria-modal` (per the Modals rule above).
- **Icon-only / toggle controls need a name + state.** Icon-only buttons (e.g. `SpeedPick`
  arrows) get an `aria-label` and mark the glyph `aria-hidden`; mutually-exclusive toggle
  groups (`SpeedPick`, difficulty/cycle pickers) carry `aria-pressed` inside a
  `role="group" aria-label="…"`.
- **Every input needs an accessible name** — associate a visible label via `htmlFor`/`id`,
  or add an `aria-label` where there's no adjacent label (e.g. the Setup weight grid).
- **Visible keyboard focus.** A global `:focus-visible` gold ring lives in `global.css` —
  **never set inline `outline: none`** (it defeats the ring for keyboard users; that's why
  `inp` no longer does).
- **Contrast.** Text on the navy background must meet WCAG AA (`C.muted` on `C.dark` ≈
  5.4:1). Re-check any new text colour against its background before shipping; don't
  relitigate the brand tokens to fix it.

**Error handling & monitoring:** `ErrorBoundary` (wraps `App` in `main.tsx`) catches
render crashes → branded recovery screen + `captureError`. Async/event-handler errors
are caught at the call site (save handlers) and shown inline ("couldn't save — retry")
via the shared `errMsg(unknown)` helper. Monitoring is `src/monitoring.ts` (Sentry) —
**DSN-gated and lazy-loaded** (`VITE_SENTRY_DSN`
in `.env.production`; blank = off, tree-shaken out). Keep it a no-op when unconfigured.

**Loading states — two layers, always show *something*:**
1. **Pre-React splash** — a static `#splash` overlay (wordmark + gold spinner) lives
   directly in `index.html` with inline `<style>`, so it paints on first HTML parse,
   *before* the JS bundle runs (this is the only thing that covers the blank flash on
   a full reload). `main.tsx` fades it out (`opacity → 0`, then `.remove()`) once
   `createRoot().render()` has mounted. Keep it dependency-free (no bundle CSS/JS).
2. **In-app top bar** — `TopLoadingBar` (`components.tsx`, `.gp-loadbar` in
   `global.css`) is a slim fixed indeterminate bar for data loads. Pattern in
   `App.tsx`: **first load** (no content yet → `!macro`) gets the centered `Spinner`;
   **later reloads** (content already present, e.g. switching macros) keep the current
   screen and just overlay `TopLoadingBar` — never blank a populated view. New
   async-load surfaces should follow this "spinner on empty, bar on refresh" rule.

**Mobile/iOS gotchas:**
- Native `<input type="date">` on iOS WebKit (esp. a home-screen standalone PWA) keeps
  an **intrinsic width** and overflows its container — even at `width:100%`;
  `min-width:0` / `max-width` / stacking don't fix the overflow. **The actual cure is
  `-webkit-appearance: none`** (see `Setup.tsx` `DATE_INPUT`), which strips the native
  control sizing so it respects its box. Apply it to every date input.
- The desktop preview emulates mobile with Chromium, which renders native form
  controls differently — it won't reproduce iOS-specific sizing bugs. Confirm
  control-heavy mobile layouts on a real iPhone.

---

## 7. Domain rules encoded in code

See `ARCHITECTURE.md` §2–§6 for the full domain. In code:

- **Date engine — `src/engine/date-engine.ts`.** Position is computed strictly from
  the macro start date, never set manually. **Critical:** `corePosition` does the
  position math only and never computes the next session. `computePosition` and
  `nextSessionFrom` both call `corePosition`. **Do not make them call each other** —
  that caused infinite recursion and was deliberately split. Dates are computed in
  **local time** (`parseLocalDate`, `isoLocal`, `todayISO`), never UTC.
- **Loading math — `src/engine/loading.ts` (single-anchor model).** Only the **Hard top set**
  is stored per lift/cycle; everything cascades off it via named constants in `constants.ts`
  (`DAY_SPREAD` = Hard 1.0 / Med 0.95 / Light 0.90, `SET_LADDER` = [0.85, 0.90, 0.95, 1.0] uniform
  for all days, `VOLUME_PCT` = 0.80) — no magic numbers at call sites. `dayTop(anchor, difficulty,
  lift?)` → a day's top; `expandDayTops(anchor)` → the three day tops; `giantSets(dayTop, difficulty)`
  uses `SET_LADDER` (reps still per-difficulty from `SCHEMES`); `volumeWeight`, `set1Weight`,
  `warmupSets`; `round(w, inc)` at the **lift's increment** (`LOAD_INCREMENT`: barbell 2.5 kg,
  dips/pullup 0.5 kg — the anchor itself is never rounded); `deloadTop` (70%); `liftMode(anchor)`
  (dips/pull-ups two-mode: 0/empty anchor = bodyweight, else weighted). Every derived-load call site
  passes the lift so nothing re-rounds independently. The computed grid is **never persisted** —
  `mappers.rowsToWeights` expands the stored anchor on every read (so Today/Calendar consumers are
  unchanged), and `weightsToRows` writes only `hard`. The `lift` arg on `dayTop` is a seam for a
  future dips-off-bodyweight path (identical for all lifts today). `fmt` is null-safe (returns `—`).
- **Reactive deload — `src/engine/deload-rule.ts`.** The revised rule (brief §5,
  supersedes the v7 book): `computeWeekSignals` (S1 R9.5+, S6 giant block not completed
  as prescribed, S2 volume incomplete, S3 carry skipped for fatigue, S5 bar-speed down
  in 2+ sessions; S4 Set-1>R7 retired).
  Trigger = 3+ occurrences across ≥2 sessions. `shouldRecommendDeload` adds the
  cap/already-deloaded/break-coming exemptions. Advise-and-confirm, never auto-forced.
- **Constants — `src/engine/constants.ts`.** `ROTATION`, `DAY_META`, `PULLUP`,
  `TESTING_SCHEDULE` (W13 Mon=DL/Fri=Dips, W14 Mon=Squat/Fri=OHP), `MACRO_WEEKS = 15`.
- **Elapsed time / timers (session timer, `Today.tsx`).** Store **timestamps**
  (`started_at` / `ended_at`, `timestamptz`), never a duration — duration is always
  *derived* (`ended − started`). The live display is **recomputed from `started_at`
  on each render** (a 1s interval only forces re-render); never a tick-counter that
  assumes the app stayed open — this is what makes it correct across sleep /
  backgrounding / reopen. **Persist on Start** so a running session survives reload.
  Evaluate time **safeguards from the timestamp** (the 90-min auto-end checks
  `now − started_at` on render, so it fires even if the app was closed when the limit
  passed), and keep a manual override (edit duration → recompute the end timestamp).
  Hold a **screen wake lock only while the timer runs** (`useWakeLock`, Screen Wake
  Lock API) — re-acquire on visibility regain, no-op if unsupported/denied; never
  hold it app-wide (battery).

---

## 8. How to add a feature

**Worked example — add a new logged field on sessions (e.g. `grip` notes):**
1. **Schema:** add the column in a new numbered `supabase/migrations/000N_*.sql` and
   apply it via the `MIGRATIONS.md` workflow (forward-only, idempotent). If it's an
   enumerated field, add a `CHECK` constraint matching the UI's value set (as `0003`
   does for the speed/RPE/skip-reason fields); leave free-text/number fields unconstrained.
2. **Mapper:** add it to both `rowToSession` (snake→camel) and `sessionToRow`
   (camel→snake, with `blankToNull`/`toNum` as appropriate) in `mappers.ts`.
3. **Repository:** usually nothing — `saveSession` upserts whole rows generically.
4. **Blank draft:** add the field to `buildBlankSession` in `SessionForm.tsx`.
5. **UI:** add the input to `SessionForm.tsx` bound to `draft`/`setField` (give it a
   `data-*` hook); it flows through Today and SessionModal automatically.
6. **Verify** (see §9).

For a **new entity/table**: add migration + RLS → `rowToX`/`xToRow` mappers →
repository CRUD functions (and add to `loadMacroBundle` if part of the bundle) → state
+ handlers in `App.tsx` → UI. Keep all Supabase calls inside `repository.ts`.

For a **new tab**: add it to `TABS` in `components.tsx`, render it in `App.tsx`'s tab
switch, pass state + handlers as props.

---

## 9. Testing / verification

A change isn't done until verified. In order of cost:

1. **Engine unit tests — `npm test`** (Vitest, `node:assert`, colocated `*.test.js`). The date
   engine has **known-correct outputs that must stay green**:
   `13 Apr 2026 → M2 C1 W1 Deadlift Hard`, `22 Jun 2026 → M2 C3 W3 Squat Hard`.
   Add/adjust tests when changing engine logic.
2. **Build — `npm run build`** catches JSX/import errors fast.
3. **Data layer — `npm run smoke`** runs full CRUD against live Supabase (needs
   `SMOKE_EMAIL`/`SMOKE_PASSWORD` in `.env.local`); asserts per-cycle isolation,
   upsert idempotency, and `'' → NULL` normalization. **It must never mutate real
   data:** it operates on a throwaway macro (number 999, cascade-deleted at the end),
   not the real one. Any test that writes to the live DB must isolate to a
   throwaway/owned-and-deleted entity — never the user's active records.
4. **UI — run `npm run dev`** and exercise the change in the browser (sign in, log a
   session, reload, confirm persistence). When verifying against the live DB by hand,
   **delete any test data afterward** to keep history clean.

Reading React-controlled input values right after a programmatic `.click()` returns
the *pre-render* value — re-render is async; read in a separate step.

---

## 10. Living spec (`specification.md`)

**Every project keeps a `specification.md` at the repo root** — a dated record of
*what* was built and changed, growing with the app. Like this file and
`ARCHITECTURE.md`, it lives at the repo root and travels with the code; all three
version together. (To reuse these conventions on a new project, copy this file as a
starting point and strip the Giant-Program specifics — keep a genericized template
project-neutral rather than letting the live doc drift toward generic.)

- **Three-doc split:** `ARCHITECTURE.md` = domain/why · `CONVENTIONS.md` = how it's
  built · `specification.md` = what changed, when.
- **Format:** a short **Current capabilities** summary kept up to date, then a change
  log under `## YYYY-MM-DD` headings, **newest first**, one line per change tagged
  `feat` / `fix` / `chore` / `docs` with the area touched.
- **When:** add an entry as part of the same change (alongside the code), not later.
- **New project bootstrap:** create `specification.md` on day one and seed it with the
  initial build.
