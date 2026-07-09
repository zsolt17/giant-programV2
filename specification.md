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
user-facing capability. When a dependency or tool is added/removed/version-bumped,
update **Stack & dependencies** in the same change.

---

## Stack & dependencies

At-a-glance snapshot of the toolchain. **`package.json` / `package-lock.json` are the
source of truth for versions** — this table is the human-readable summary (refreshed
when deps change); `CONVENTIONS.md` §2 has the build/scripts narrative.

| Layer | Tool | Version | Used for |
|-------|------|---------|----------|
| Language | TypeScript | 6.0.3 | strict typing across engine/data/UI (`tsc --noEmit`, no emit) |
| Runtime | Node.js | 24 (dev) · 22 (CI) | build + tests; installed via nvm |
| UI framework | react / react-dom | 18.3.1 | function-component UI |
| Build / bundler | Vite | 7.3.6 | dev server + production build (rollup-based) |
| Build plugin | @vitejs/plugin-react | 5.2.0 | React fast-refresh + JSX transform for Vite |
| PWA | vite-plugin-pwa (workbox-build) | 1.3.0 (wb 7.4.1) | service worker, offline app-shell precache, web manifest |
| Backend client | @supabase/supabase-js | 2.108.2 | Postgres + Auth + RLS — **only** imported in `src/data/` |
| Charts | recharts | 3.9.0 | Trends-tab charts — **lazy chunk only** (never eager) |
| Monitoring | @sentry/react | 10.60.0 | error monitoring — DSN-gated, lazy, off unless configured |
| Image tooling | sharp | 0.35.x | PWA icon generation (`scripts/gen-icons.mjs`) |
| Test runner | vitest | 3.2.6 | engine/data unit tests (`*.test.js`, `node:assert`) |
| TS loader | tsx | 4.22.4 | runs the data-layer smoke test under Node |
| Type defs | @types/node · react · react-dom | 26.0.1 · 18.3.31 · 18.3.7 | type definitions |

**Toolchain (not npm deps):** Supabase CLI 2.108 (migrations — see `supabase/MIGRATIONS.md`),
**Colima** (Docker engine for `supabase db dump` / local stack — not Docker Desktop; auto-starts
at login), GitHub Actions (Pages build + deploy — `.github/workflows/deploy.yml`), Homebrew (CLI installs).

---

## Current capabilities

- **Single-user auth** (Supabase email/password, RLS-protected).
- **Today** — date-computed position; full session prescription (warm-up,
  Giant Block, volume, carry) and logging. **Optional session
  timer:** Start → live timer → End, duration derived from `started_at`/`ended_at`,
  90-min auto-end safeguard, manual duration edit.
- **Calendar** — 15-week × Mon/Wed/Fri grid; log/edit/delete any session; mark breaks.
- **History** — latest top sets, recent-session feed, pull-up cluster trend, testing results.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (advise-and-confirm).
- **Setup** — per-cycle (C1/C2/C3) **Hard-top anchor** per lift (Medium/Light, the Giant Block
  ladder and Volume all compute live, with a read-only preview) + recorded accessories (RDL/row, auto-seeded) & carries, macro anchor,
  macro picker, and "start next macro" archiving (carries C3→C1).
- **Data** — export all data as CSV (sessions incl. a deload_week column + a separate
  testing-results file), and copy a plain-text summary of **any** logged session — training, test,
  or deload, each with a type-appropriate format — to the clipboard for coaching conversations.
  (Burger menu → Data.)
- **Recovery → Tendon Health** — joint-specific isometric loading protocol: pick a joint, phase
  auto-advances (Acute/Build/Maintenance, overridable), per-tendon 30s hold timer + light per-day
  "done" logging, position diagrams. One active protocol at a time. (Burger menu → Recovery; first item.)
- **Pull-ups & dips** — two-mode (dips day): a 0/empty per-cycle anchor = bodyweight cluster logging
  (10/8/6 targets) + trend; any anchor = the full weighted cascade at 0.5 kg rounding. Mode flips in Setup.
- **Testing weeks** — record 2–3RM results per lift.
- **Global loading states** — branded pre-React splash (home-screen-icon mark + shimmer bar);
  **first login is held** (sign-in button spinner spans auth + the first data fetch, then Today
  paints complete in one fade-in); slim top progress bar on later in-app reloads.
- **Accessibility** — keyboard-navigable tab bar (ARIA tablist + arrow keys), modal focus
  trap with Esc-to-close and focus return, labelled custom/icon-only controls, and a visible
  gold keyboard focus ring. Non-default tabs are code-split (lazy-loaded) to protect first load.
- **Deployed** to GitHub Pages: https://zsolt17.github.io/giant-programV2/ (auto-deploy on push to `main`).

---

## Change log

## 2026-07-09
- `feat(testing/deload)`: **test days now capture deload signals**. The shared test view (Today +
  Calendar modal) gains the **test-attempt RPE/bar-speed**, the **giant-block completion control**
  (same exported `BlockCompletion` component; helper copy: "prescribed" = ramp sets 1–3 + a recorded
  attempt), and the **volume "both sets completed"** checkbox. Record Result now also upserts a
  **companion sessions row** (`weekType 'testing'`, id `{date}-{lift}-TEST`) through the normal
  idempotent `saveSession` path carrying the structured signal fields — **no migration** (all
  columns existed); Delete removes both rows. The **Deload tab** buckets testing-week sessions as
  `W13/W14 · Testing` (week derived from the macro start date; new `startISO` prop) with signals
  computed by the unchanged `computeWeekSignals`; the red "DELOAD TRIGGERED" label is suppressed for
  testing buckets (gold note: scheduled W15 deload is next) — the recommendation itself was verified
  structurally unable to fire in/from testing weeks (Today's recommendation only renders on
  training-week days; test rows have null cycle/week). Side effects: test cells now turn **green
  (logged)** in the Calendar and count as done in Trends attendance once recorded; the Data list
  filters out companion rows (the richer Test entries represent them); companion rows do appear in
  the sessions CSV. typecheck + 84 tests + build green; smoke 48/48.
- `feat(data)`: **copy-session covers ALL session types + CSV completeness**. Confirmed data-model
  gap: tests live only in `testing_results` (no sessions row), so they never appeared in the Data
  list. The selector now merges **sessions + testing results** date-sorted, with visible type
  markers: tests as `M2 · Test W13 · Deadlift · date` (blue), reactive-deload-week sessions
  suffixed `· DELOAD` (flag from the all-macro deloads map). New summary formats (engine, tested):
  **`testSummary`** — header `Test — M2 W13 — …`, ramp (sets 1–3 off the C3 anchor, per-lift
  rounding), `TEST RESULT: w×r`, Volume line reconstructed by parsing the notes' `Vol:` suffix (new
  shared `splitVolNote`, also reused by the test view), `No carry (testing week)`, notes (no
  Duration — `testing_results` has no timestamps); **reactive-deload sessions** keep the full body
  with a `Deload — …` header + `~70%` context line; hypothetical `weekType 'deload'` rows get the
  minimal W15 format. **W15 + optional-light Wednesday sessions are not loggable in-app** (note
  cards only) — nothing exists to list; generic paths cover any legacy rows. **CSV:** sessions
  export gains a `deload_week` column; testing results export as a **second CSV file**
  (`giant-program-testing-results-…`, own button — two auto-downloads from one tap are unreliable
  on iOS). New repo reads `getAllTestingResults()` / `getAllDeloads()`. typecheck + **84 tests** +
  build green; smoke **48/48** (new reads assert against the throwaway macro).
- `feat(calendar)`: **Calendar test-cell modal now renders the full-structure test view** — the same
  shared component as the Today tab (`TestingSessionView`), so the two surfaces can't drift: warm-up
  build-up, Giant Block sets 1–3 off the C3 Hard anchor, Set 4 as the open test input with the
  1-RIR/+5%-ceiling hint, Volume 2×6 @ 80% with RPE/bar-speed (→ result-notes "Vol:" suffix), and
  the "No carry — testing week" note. `testedOn` = the cell's date, so backfilling a past test day
  round-trips to `testing_results` on the existing `(macro, lift, tested_on)` upsert; break toggle +
  Record/Update/Delete unchanged (delete still closes the modal). The Wednesday optional-light cell
  keeps its simple note modal. The now-unused compact `TestingResultForm` was deleted and the file
  renamed `TestingResultForm.tsx` → `TestingSession.tsx` (one component, two callers). No schema
  change. typecheck + 77 tests + build green.

## 2026-07-06
- `feat(testing)`: **full-structure test-day view** (Today tab, testing weeks) — replaces the bare
  result recorder. A test day now renders like a normal hard day **computed off the C3 Hard anchor**
  (exact, never rounded) via the loading engine at each lift's increment: Warm-Up build-up
  (8-5-3-2 @ ~40/55/70/85% of Set 1), Giant Block sets 1–3 prescribed (85/90/95%), **Set 4 = the
  test** with open weight+reps inputs and a muted guidance hint ("anything from C3 top upward at
  1 RIR is valid; ceiling ~+5% — new engine helper `testCeiling`, +1 test; no grinders"), Volume
  2×6 @ 80% with RPE/bar-speed (persisted into the result notes as a "Vol: …" suffix, replaced on
  re-save, since `testing_results` has no structured fields), and a "No carry — testing week" note.
  Record Result / Update / Delete keep the existing `testing_results` save path. Degrades gracefully
  with no usable C3 anchor (loads "—", generic hint). New `TestingSessionView` in
  `TestingResultForm.tsx`; the Calendar's testing-cell modal keeps the compact form. No schema
  change. typecheck + **77 tests** + build green.

## 2026-07-05
- `feat(loading)`: **per-lift rounding + two-mode dips & pull-ups**. Derived loads now round at the
  lift's increment (`LOAD_INCREMENT`: DL/OHP/Squat 2.5 kg; **dips + pull-ups 0.5 kg**); the **anchor
  is never rounded** (fixes a latent bug where a 1 kg dips anchor snapped its Hard day-top to 0).
  Dips and pull-ups share **two-mode logic** decided purely by the cycle's anchor: 0/empty =
  **bodyweight mode** (no cascade; 10/8/6 targets; final-round cluster logging + History trend —
  dips log the new `dips_cluster`, pull-ups keep `pullup_cluster`); anchor > 0 = the **full standard
  cascade** at 0.5 kg (day spread, 85/90/95/100 ladder, day rep scheme, 80% volume) — weighted
  pull-ups render the 4-round ladder in place of the cluster input, like a primary lift. Pull-ups
  join `working_weights` (Setup gains a 5th anchor row; `AnchorLift` type); the dips warm-up
  build-up rounds at 0.5 (0 → "BW"). Setup's cascade preview is mode-aware (bodyweight-mode note ↔
  weighted ladder). Copy-session summary: BW dips top set, dips-cluster line, weighted pull-up
  ladder (via a new `getAllWorkingWeights()` read). Every computed-load call site passes the lift —
  nothing re-rounds independently. Migration `0009_dips_pullup_modes.sql` (applied): widens the
  `working_weights.lift` CHECK + adds `sessions.dips_cluster`. typecheck + **76 tests** + build
  green; smoke **46/46** (pullup anchor 0.5-kg cascade, anchor exactness, dips-cluster round-trip).

## 2026-07-02
- `feat(program/data)`: **final carry reassignment + expanded copy-session summary**. **Carries**
  (config only, no schema change; keys stay `carry_<day>`, logged history untouched): DL → Farmer's
  60/hand, OHP → Overhead 2×20, Squat → Sandbag Bear Hug 68, Dips → Suitcase 50/hand (unchanged) —
  updated in `DAY_META`, the Carries trend `CARRY_OF`, and Setup labels; per-cycle stored carry
  weights kept (review in Setup, they now belong to the new implement). **Copy-session summary**
  (Data page) expanded to the complete session picture: Giant Block section with top set (R/arrow),
  the **full computed set ladder** (`giantSets` — the same engine call Today renders, e.g.
  `8@110 · 6@117.5 · 4@122.5 · 2@130`), completion label, weighted **secondary with its per-cycle
  recorded weight** (`One-Arm DB Row 20kg × 10/arm`), pull-up cluster (dips), cardio; **Volume Block**
  with computed 80% load (dips = push-ups BW); **Carry** with implement name + per-cycle weight +
  rounds×distance + RPE (or skipped+reason); duration/notes as before. New repo read
  `getAllAccessoryWeights()` (grouped by macro) feeds the Data page; `sessionSummary(s, macroNum,
  accessory?)` degrades gracefully without it. Tests rewritten (9 summary tests incl. an exact
  full-format match; 67 total). typecheck + build + smoke 42/42 green.

## 2026-06-30
- `feat(recovery)`: **new Recovery section — Tendon Health** (drawer item, ordered **first**, above
  Deload). A joint-specific isometric loading protocol: pick a joint (wrist/elbow/shoulder/knee/ankle)
  + start date → an active protocol with a hybrid **phase** (Acute/Build/Maintenance auto-suggested
  from days-since-start, overridable via a segmented control; tapping the suggested segment clears the
  override). Per-tendon rows show a 64×64 position diagram, exercise + current dose (from `PHASE_DOSE`),
  a **30s hold timer** (countdown ring, manual set advance 1/3→3/3, screen wake-lock while holding,
  auto-checks "done today" on 3/3), and a per-tendon done checkbox. Logging is intentionally light —
  one row per (tendon, day); the row's existence is the signal. Close = confirm → status `completed`,
  `closed_early`, joint picker re-opens. **Data:** two new tables `recovery_protocols` +
  `recovery_tendon_logs` (RLS: protocols via `user_id`, logs transitive via `protocol_id`; **one active
  protocol per user** enforced by a partial unique index). New engine modules `recovery-content.ts`
  (static content incl. all 16 exercise SVGs — the 3 provided + 13 authored) and `recovery.ts`
  (local-date phase/day helpers, 3 tests). Recovery is **macro-independent** (works with no active
  macro) and loaded lazily on first open (own ~4 KB-gzip chunk). Migration `0008_recovery.sql`.
  typecheck + 65 tests + build green; smoke extended (protocol/override/log/close round-trip).
- `fix(calendar)`: **session modal no longer slides behind the bottom nav / leaks scroll to the
  calendar**. The `SessionModal` overlay was `zIndex 50` — equal to the fixed bottom nav, which
  (later in the DOM) painted over the Log button; and the background wasn't scroll-locked, so
  touch-scrolling moved the calendar behind while the fixed overlay appeared frozen. Raised the
  overlay to `zIndex 60` (above the nav), added bottom padding for the home-indicator safe-area inset,
  locked `document.body` overflow while the modal is open, and set `overscroll-behavior: contain`.
  `SessionModal.tsx` only.
- `feat(program)`: **finalized program revision** (builds on the same-day exercise overhaul). The
  Giant Block "antagonist" slot is **renamed Secondary** throughout (`DAY_META.secondary`,
  `secondaryDesc`, `SECONDARY_ITEM`, `secondaryLoad`). **Secondaries:** DL B-stance RDL → **Reverse
  Lunge** (8/leg); Squat Copenhagen plank → **B-stance RDL** (8/leg — the RDL moves DL→Squat); OHP
  one-arm row + dips pull-ups unchanged. **Squat core** Leg Raises → **strict toes-to-bar**.
  **Carries reassigned** (all four kept, keyed by day): DL bear-hug sandbag 68, OHP farmer 60/hand,
  Squat overhead 2×20, Dips suitcase 50/hand. **Recorded secondary weights** are now `lunge_deadlift`
  / `rdl_squat` / `row_ohp` (RDL item renamed, lunge added), auto-seeded across cycles. **Giant-block
  completion control** — one-tap "completed as prescribed ✓" or a categorical reason
  (`block_completion`: failed_heavy / stopped_fatigue / stopped_form / reduced_weight / cut_time),
  under the top-set RPE/speed; Volume + per-round cardio logging unchanged. **Deload:** retired S4,
  added **S6** (giant block not completed, driven by the new control) → signal set S1·S6·S2·S3·S5,
  trigger unchanged (3+ across 2+ sessions, max 1/meso). **Trends:** Accessories view now **3 charts**
  (one-arm row, B-stance RDL, **reverse lunge**); carry trend remapped to the new day→implement
  assignment; deload signal chart scales /5. Migration `0007_program_revision.sql` widens the
  accessory item CHECK and adds `sessions.block_completion`. typecheck + 62 tests + build green; smoke
  updated (new accessory items + `block_completion` round-trip).

## 2026-06-29
- `feat(exercises)`: **exercise-selection overhaul** (3 parts). **Movements:** removed the
  power-clean block entirely (UI + logging fields + loading); dips-day antagonist Ring Rows →
  **Pull-ups** (the phase-1 cluster logging + History trend moved here from OHP day); deadlift-day
  Sørensen Hold → **B-Stance DB RDL** (8/leg); OHP-day Pull-ups → **One-Arm DB Row** (10/arm). With
  no clean block, every day is now A Warm-Up · B Giant · C Volume · D Carry. **Recorded accessory
  weights:** the RDL and row get a per-cycle weight in Setup (`accessory_weights` items
  `rdl_deadlift` / `row_ohp`; recorded, no cascade), **auto-seeded from the previous cycle** as a
  starting reference and shown in the Giant Block prescription (threaded as `antagLoad`, like
  `carryLoad`). **Graphs:** removed the power-clean trend; the **Cleans** filter chip is now
  **Accessories** with two per-cycle weight charts (One-Arm DB Row, B-Stance RDL;
  `engine/trends.ts` `toAccessoryTrend`). Migration `0006_remove_cleans.sql` drops `sessions.clean_*`,
  deletes the `clean` accessory rows, and widens the `accessory_weights.item` CHECK for the two new
  items. New shared `ANTAG_ITEM` map (day → accessory item). typecheck + 61 tests + build green;
  smoke updated (new-accessory + clean-less session round-trip on the live DB).

## 2026-06-27
- `feat(nav)` + `chore(tooling)`: **moved Setup to the bottom of the menu drawer** — order is now
  Deload · History · **Data · Setup** (Data above Setup), `nav.tsx` `MENU_ITEMS` only. Separately,
  installed **Colima** + the Docker CLI (Apple Silicon, via Homebrew) as the Docker engine so
  `supabase db dump` and the local stack work (Docker Desktop wasn't installed; Colima auto-starts
  at login). Documented in `supabase/MIGRATIONS.md` (backups) and the Stack toolchain note above.
- `feat(loading)`: **single-anchor loading engine** — Setup now takes only the **Hard top set**
  per lift per cycle; Medium (×0.95) / Light (×0.90) day tops, the four Giant Block sets
  (uniform **85/90/95/100%** of each day's top), and Volume (80%) all compute live, rounded to
  2.5 kg. Named engine constants (`DAY_SPREAD`, `SET_LADDER`, `VOLUME_PCT` in `constants.ts`) +
  `dayTop`/`expandDayTops` and a reworked `giantSets` in `loading.ts` (no magic numbers).
  **Within-day ladder changed** from the old per-difficulty 75/82/90 (etc.) to the uniform
  85/90/95/100 — this raises Giant Block back-off loads on every prescribed session and
  supersedes `ARCHITECTURE.md §2.4`. All four lifts (incl. dips) use the identical cascade; a
  per-lift `dayTop(...,lift)` seam is left for a future dips-off-bodyweight path. **Data model:**
  `working_weights` now stores **only** the Hard anchor — `mappers.rowsToWeights` expands it on
  read (Today/Calendar/History consumers unchanged), `weightsToRows` writes only `hard`; the
  computed grid is never persisted, so editing the anchor is instantly correct everywhere.
  **Setup UI:** one Hard-top input per lift + a read-only live cascade preview (3 day tops ×
  Set 1–4 + Volume, kg prominent / % secondary). Migration `0005_anchor_weights.sql` drops the
  old `medium`/`light` columns (the existing `hard` is the seed — no data move). typecheck +
  60 tests + build green; **smoke 32/32** (anchor write→computed-cascade round-trip on the live
  DB, real data untouched).
- `fix(today/calendar)`: **carry prescription now reads the per-cycle weight from Setup** instead of
  a hardcoded value. The carry block's load (e.g. Farmer's Carry) showed the static `DAY_META`
  default (`60 kg / hand`) regardless of Setup; it now shows `accessory_weights.carry_<lift>` for the
  session's cycle, formatted with the per-carry unit (`perHand` flag → Farmer/Suitcase/Overhead append
  "/ hand", Sandbag is total). Falls back to the descriptive default only when that cycle's carry
  weight is unset. Threaded a `carryLoad` prop through `SessionForm` (Today's `SessionEditor` + the
  calendar `SessionModal`); **display-only, no data-model change**. (Overhead/dips treats the Setup
  number as per-hand — confirm if you track it as total.) typecheck + 56 tests + build green.
- `feat(nav)`: **raised the bottom-nav icon+label cluster** toward the top of the bar
  (YouTube-style). Rebalanced padding so the cluster rides ~12px higher while the bar's **total
  height is unchanged** (`NAV_H` stays 82): nav-item padding `10px 0` → `4px 0 16px` (height-neutral),
  and bar `paddingTop` 8 → 2 with the 6px added back to `paddingBottom` (`+12px` → `+18px` over the
  safe-area inset). `nav.tsx` only; the raise amount is a single tunable (the item top/bottom split +
  the bar paddingTop). Verify on iPhone.
- `feat(data)`: **new Data page** (burger menu → Data, after Setup). Two sections: **Download all
  data** — exports every session across all macros as a CSV download
  (`giant-program-export-YYYY-MM-DD.csv`), all session columns, RFC-4180 escaping, `cardio_cals`
  collapsed to one `15/14/15/15` cell; and **Copy session summary** — pick a session from a
  newest-first list, copy a plain-text coaching summary to the clipboard (Clipboard API + textarea
  fallback for non-secure contexts, brief "Copied ✓"). New pure engine modules `export-csv.ts`
  (`sessionsToCsv`) + `session-summary.ts` (`sessionSummary`, exact share format — OHP-day pull-ups,
  dips-day cleans, skipped-carry, omitted Duration/Notes handled) with **11 new tests**. New
  RLS-scoped read `repo.getAllSessions()` (all macros); **no schema change**. `Data.tsx` is
  lazy-loaded (own ~2.8 KB-gzip chunk, off the main bundle). typecheck + 56 tests + build green;
  clean boot verified in-browser.
- `chore(safety)`: **dev write-guard** — `npm run dev` reads `.env.local`, which points at the
  **PROD** Supabase project, so local browser testing was writing real rows. The dev server is now
  **write-blocked by default**: every `repository.ts` write calls `assertWritable()` (in
  `supabase.ts`), which throws unless `VITE_ALLOW_DEV_WRITES=true` is set in `.env.local`;
  `flushQueue` no-ops when blocked. A fixed on-screen **DEV banner** shows the state (green "writes
  blocked" / red "writes ON → PROD"). **Never** active in production builds (`import.meta.env.DEV`
  is false → tree-shaken) or under Node (the smoke test sets `process.env` and isolates to a
  throwaway macro, so it must write). Opt-in documented in `.env.example`. Verified: banner both
  states in-browser, **smoke 30/30** (Node write path intact, real data untouched), typecheck +
  56 tests + build green.
- `feat(nav)`: **swapped Trends into the bottom nav, History into the drawer** (Trends now sits
  in the top-3 with Today/Calendar; History moves under Deload in the menu). Menu-active
  highlight re-keyed `trends`→`history`. Also **gold-coloured the drawer item icons** (labels
  unchanged; Sign out icon left muted). `nav.tsx` only.
- `fix(mobile)`: **raised the bottom nav** so the tap rows clear the curved bottom corners
  on modern iPhones (iPhone 16). Added top padding + extra bottom padding beyond the
  safe-area inset and taller touch rows (`nav.tsx`); bumped the content reserve `NAV_H`
  56→82 (`components.tsx`) so content still scrolls clear. Device-verified on iPhone 16.
- `feat`: **splash held through a logged-in reopen** — on opening the PWA with a stored
  session, the splash now stays on screen for the whole first data load (was: splash → a
  separate spinner screen → Today). React renders an identical `<SplashScreen/>` during the
  session-check + first-bundle-load states via the shared `.gp-splash` styles (defined once in
  index.html), so the pre-React splash hands off seamlessly to it; the app then fades in,
  fully populated. `main.tsx` still removes the bootstrap splash on React mount (unchanged) —
  React owns the held splash, so a slow/failed load can't strand it (falls through to the
  Retry screen). typecheck + 45 tests + build green; React splash verified pixel-identical.
- `feat`: **polished launch flow** — splash + held first-login. (1) Redesigned the pre-React
  `#splash` (index.html): the actual home-screen icon mark (`icon-192.png`, gold-bordered
  rounded tile) + "THE GIANT PROGRAM" + a gold shimmer bar; `main.tsx` fade trigger
  unchanged (still tied to React mount, not data). (2) `Auth.tsx` gains a held loading state —
  button spinner + dimmed/disabled inputs + "Loading your program…" — driven by a `dataLoading`
  prop so it spans **both** the auth call and the first macro-bundle fetch. (3) `App.tsx` gates
  on a `booted` flag: on first login it keeps the login screen (held) until the bundle is in
  (cold-start-with-session shows a matching full-screen loading view), then the whole app
  **fades in once, fully populated** — no empty shell / partial fill. Post-auth *data* failures
  land on the existing Retry-load screen (not the login form, since already authenticated);
  credential failures still return to the login form. In-app reloads after login keep the
  existing top-bar/spinner behaviour. No deps, no schema, engine untouched. typecheck + 45 tests
  + build green; splash + login visuals verified in-browser.
- `docs`: added a **Stack & dependencies** table at the top of this file — at-a-glance
  toolchain/deps with versions + what each is for (package.json stays canonical; refreshed
  on dep changes).
- `chore(ci)`: bumped `actions/upload-pages-artifact` v3→v5 and `actions/deploy-pages` v4→v5
  to silence the Node 20 deprecation warnings (those actions now run on Node 24 natively).
- `chore(deps)`: **upgraded Vite 5 → 7** (+ `@vitejs/plugin-react` 4 → 5) to clear two
  dev-tooling advisories (esbuild dev-server request forgery + Vite dev-server path-traversal;
  both dev/build-only, not in the shipped app, and the high-rated Vite ones are Windows-specific
  — N/A here). Chose Vite **7** (rollup-based, mature) over the rolldown-based Vite 8 for a smaller
  blast radius; it fixes the advisories all the same. `vitest`/`vite-plugin-pwa` unchanged (both
  already support Vite 7). `npm audit` now reports **0 vulnerabilities**; typecheck + 45 tests +
  build (PWA SW generates) + dev-server smoke all green.
- `feat`: **Trends tab** — a charts/analytics view in the menu (Deload → **Trends** → Setup),
  ported from a provided mockup onto our Supabase data and navy/gold system. Four views:
  **Lifts** (weight + RPE trends with the 9.5 S1 line, bar-speed distribution), **Cleans**
  (load step-line with speed-coded dots), **Carries** (2×2 summary + per-type dual-axis
  weight/distance charts), **Session** (attendance grid, deload-signal accumulation, duration,
  cardio calories). Sticky filter bar + a multi-macro **range picker** (bottom sheet).
  Data: new `repository.loadTrends()` (all macros via RLS-scoped reads, loaded once on tab open)
  + pure derivations in `engine/trends.ts` (our `Session`/accessory/deload data → the chart
  view-models; signal flags mirror `deload-rule.ts`). Deviations from the mockup's (stale)
  prompt: reads Supabase not Google Sheets; **attendance grid adapted to our Mon/Wed/Fri
  rotation** (the mockup's fixed DL/OHP/Squat columns don't fit our 4-lift rotation); our fonts
  (DM Sans/Bebas) not monospace; calories chart relabeled "Giant Block · 30s Cardio" (it's our
  per-round `cardio_cals`, not assault-bike carries). New dep **recharts** (lazy-loaded — Trends
  is a code-split chunk, ~122 KB gzip, off the main bundle). 7 new engine tests for the
  derivations. typecheck + 45 tests + build green; device-verified on iPhone Safari + browser.
- `feat`: **navigation redesigned — fixed bottom icon bar + slide-in menu drawer; session
  timer moved to the top.** Replaced the sticky top `Tabs` tablist with `BottomNav` (new
  `nav.tsx`): a fixed bottom bar of icon+label items — Today / Calendar / History / **Menu**
  (burger), active in gold, `aria-current`. **Menu** opens `MenuDrawer`, a right slide-in
  focus-trapped dialog with the secondary destinations (Deload, Setup) + **Sign out** (moved
  out of the `Shell` header), extensible via a `MENU_ITEMS` array. The running-session
  `SessionControlBar` moved from the bottom to a **fixed top** bar (top safe-area), since the
  bottom is now nav — all timer behaviour unchanged (running-only, `now − started_at`,
  End-confirm, 90-min auto-end, wake-lock). **Zone separation:** `Shell` reserves both — bottom
  inset for the nav always, top inset while `sessionRunning` — via `env(safe-area-inset-*)`, so
  content never hides behind either bar and they never collide. Inline SVG icons (no new dep).
  Fatigue-signal banner unchanged. Device-verified on iPhone Safari; typecheck + 38 tests +
  build green. Docs: `CONVENTIONS.md` §6 navigation + a11y notes rewritten.

## 2026-06-25
- `feat`: **running-session timer consolidated into a fixed bottom control bar** (Today).
  Replaced the split top-timer-display + bottom-End-button with one always-visible
  `SessionControlBar` (`position: fixed`, bottom): gold live `mm:ss` (still `now − started_at`)
  left, **End** right with a quick **Confirm/✕** so a stray tap can't end the session. Rendered
  **only** in the running state — not-started keeps the Start button, completed keeps the
  duration+edit card and Update button, both in their normal places. iPhone-Safari handling:
  `env(safe-area-inset-bottom)` so it floats above the home indicator, and matching
  `padding-bottom` on the scroll content so the last fields clear the bar. No data-model change
  (`started_at`/`ended_at`, 90-min auto-end, persist-on-Start, wake-lock all unchanged).
  Device-verified on iPhone Safari; typecheck + 38 tests + build green.
- `feat`: **History surfaces the new logging fields** (display-only follow-up). The
  Recent-Sessions feed line now appends, where logged: `clean N rds` (dips), `cardio
  15/14/–/15 = 44` (per-round cals + total), and `carry R × D m`. New **Carry Distance**
  trend card shows distance/round oldest→newest, **grouped by day type** (the carry implement
  differs per day, so cross-day distances aren't comparable) — serving the "distance before
  weight" rule. All null-safe/data-gated (renders unchanged until such sessions exist).
  Calendar cells left as-is (the tap-to-open modal already shows the full form). typecheck +
  38 tests + build green. `chore(dev)`: `?today=YYYY-MM-DD` override (dev-only, tree-shaken
  from prod) to exercise date-driven views off a real session day.
- `feat`: **three new session logging fields** (Today + SessionModal, via the shared
  `SessionForm`). **Clean rounds** — a "rounds completed" count in the dips-day clean block
  (UI default 5). **Per-round cardio calories** — four cells in the Giant Block capturing each
  round's 30 s cardio (the notebook's "15/14/15/15"). **Carry rounds + distance/round (m)** —
  supporting the "distance before weight" progression. Schema: one batched migration
  `0004_session_extra_logging.sql` adds `clean_rounds int`, `cardio_cals int[]` (ordered
  [R1..R4], all-blank → NULL, blank round → NULL element), `carry_rounds int default 3`,
  `carry_distance numeric` — all nullable, RLS inherited. Routed through the existing
  mapper/repository pattern (new `rowToCardio`/`cardioToRow` helpers; generic `saveSession`
  upsert unchanged). Applied via `supabase db push`. Verified: typecheck + 38 unit tests +
  build, and **smoke 30/30** round-tripping all four columns against the live DB (real data
  untouched). History/Calendar display of the new fields intentionally out of scope.
- `chore(security)`: **public sign-ups disabled** in the Supabase dashboard (Auth settings) —
  app stays single-user; the public anon key can no longer be used by strangers to create
  accounts and consume project quota (data was already RLS-isolated). Dashboard-only change,
  invisible in code, noted here so "can't register" isn't a mystery. An approval-gated
  multi-user feature (RLS-enforced, not UI-only) is **parked** for when onboarding real users.
- `fix(db)`: **testing results are now idempotent** — `saveTestingResult` upserts a brand-new
  result on the natural key `(macro_id, lift, tested_on)` (was a plain `insert`), so a
  double-submit/re-save UPDATES in place instead of duplicating; edits still upsert by `id`.
  Pairs with the `0003` unique index (`NULLS NOT DISTINCT`, so a date-less re-save also dedupes).
  Added `testing_results` coverage to the smoke test (save → re-save-updates → no-dup →
  different-date-is-separate). typecheck + 38 unit tests + build + smoke (26/26, real data
  untouched) all green — the smoke run also confirms `0003` is live (CHECKs accept valid writes,
  the dedupe relies on the new index). `saveTestingResult` is also the first migration applied
  through CLI tooling — see below.
- `chore(db)`: **Supabase CLI adopted for migrations** — installed the CLI (`brew`, v2.108.0),
  **linked** the project and **reconciled** the hand-applied history
  (`migration repair --status applied 0001 0002 0003` → all three show applied on Local+Remote).
  Ran `supabase init` for a committed `config.toml` (`project_id = giant-programv2`; the CLI's
  own `supabase/.gitignore` covers `.branches`/`.temp`/local env). Made `MIGRATIONS.md` concrete
  (real ref, run-from-repo-root guard). Forward migrations now go through `migration new` →
  `db push`; no local-dev stack started yet.
- `chore(db)`: **schema hardening migration `0003_hardening.sql` + migrations runbook**
  (applied 2026-06-25 by hand via the Supabase SQL editor, like 0001/0002; CLI adoption
  still the forward plan per `MIGRATIONS.md`). Adds CHECK constraints on the loose log
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
