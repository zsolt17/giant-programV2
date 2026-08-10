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
- **The program schedule** — one program, no era flag: fixed weekday→lift session days
  (**Mon Squat · Tue Bench · Thu Deadlift · Fri OHP, no rotation**), 13-week macros (three
  4-week cycles + one deload, extendable), with the Giant block's difficulty following a
  per-lift weekly rotation that repeats identically every cycle (week 4 collapses to one
  difficulty for all four sessions, by cycle: light/medium/hard) — independent of the Volume
  block's own difficulty, which is fixed for the whole cycle (light C1 / medium C2 / hard C3,
  except C3 week 4 which drops the Volume block entirely).
- **Sessions** — Primer (rope flow + day-typed band activation — Crossover Symmetry upper /
  Hip Halo lower — + a 1-2-3 ascending bodyweight ramp, checkbox-style completion, no load/RPE)
  → Giant Block (the lift's ladder + a day's paired **secondary** — BB Row on OHP day, Pull-ups
  on bench day — + a bodyweight accessory; squat and deadlift train alone) → Volume (80%, gated
  off on C3 week 4 and during any deload) → **Capability**, whose content is a property of the
  CYCLE, not the week: **Hypertrophy** in C1 (per-movement per-SET weight/reps, 3 fixed sets,
  superset pairing where the source sheet groups two exercises, a movement can be flagged
  weight-optional), **Olympic lifting** in C2 (per-movement weight + a Q1/Q2/Q3 quality mark,
  position wave copy by week), **Carries** in C3 (day→implement mapping, flat RPE-6 guidance) —
  all suppressed during any deload, reactive or scheduled.
- **Today** — date-computed position; the session renders as **four independent expandable
  cards** (A. Primer / B. Giant / C. Volume / D. Capability, always this order). Pre-start, all
  four are expanded with fields locked; Start Session collapses them and auto-expands Primer,
  unlocked. Each card's Done button (disabled until that block's own required fields are
  filled) collapses it to a one-line `✓ Done` summary and auto-expands the next card in
  sequence; tapping a done card reopens it to fix a mislogged entry without disturbing whatever
  card is currently active. Calendar's session modal gets the same four cards in a simpler
  free-toggle mode (no lock, no sequence). **Optional session timer:** Start → live timer →
  End, duration derived from `started_at`/`ended_at`, 90-min auto-end safeguard, manual
  duration edit.
- **Calendar** — program-week grid, **4 columns (Mon/Tue/Thu/Fri)**, 13 weeks (14 with an
  extended deload); log/edit/delete any session; mark breaks.
- **History** — latest top sets, recent-session feed, pull-up cluster trend.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (advise-and-confirm;
  S2 has an exception for any session with no Volume block — C3 week 4 or a deload; the
  recommendation card lists every fired signal incl. offending dates).
- **Setup** — per-cycle (C1/C2/C3) **Hard-top anchor** for all six lanes (DL/OHP/Squat/Bench +
  BB Row/Pull-ups) plus the Giant-Difficulty Rotation card (editable per-cycle-week
  Hard/Medium/Light assignment, merged over the built-in default) — the build-up, ladder, and
  Volume all compute live off each anchor, with a read-only preview + **Giant Block
  Accessories** (rep target per day's bodyweight movement) + carries, macro anchor, macro
  picker, and "start next macro" archiving (carries C3→C1 anchors forward).
- **Data** — export sessions (incl. `volume_difficulty`), Hypertrophy logs, and Oly logs as
  CSVs, and copy a plain-text summary of any logged session (secondary/accessory/Volume-block
  detail + a Capability-not-included note where relevant) to the clipboard for coaching
  conversations. (Burger menu → Data.)
- **Trends** — Lifts (DL/OHP/Squat/Bench, dynamic per-macro attendance columns) · Carries ·
  Session views; multi-macro range picker; lazy recharts chunk. No Hypertrophy/Oly series yet.
- **Recovery → Tendon Health** — joint-specific isometric loading protocol: pick a joint, phase
  auto-advances (Acute/Build/Maintenance, overridable), per-tendon 30s hold timer + light per-day
  "done" logging, position diagrams. One active protocol at a time. (Burger menu → Recovery; first item.)
- **Pull-ups** — the two-mode engine (bodyweight cluster vs weighted ladder) is live as bench
  day's secondary: a real Setup-writable per-cycle anchor, not history rendering.
- **Global loading states** — branded pre-React splash (home-screen-icon mark + shimmer bar);
  **first login is held** (sign-in button spinner spans auth + the first data fetch, then Today
  paints complete in one fade-in); slim top progress bar on later in-app reloads.
- **Accessibility** — keyboard-navigable tab bar (ARIA tablist + arrow keys), modal focus
  trap with Esc-to-close and focus return, labelled custom/icon-only controls, and a visible
  gold keyboard focus ring. Non-default tabs are code-split (lazy-loaded) to protect first load.
- **Deployed** to GitHub Pages: https://zsolt17.github.io/giant-programV2/ (auto-deploy on push to `main`).

---

## Change log

## 2026-08-10 (Hypertrophy RPE + a real state-update bug behind the "data vanishes" report)
- `fix`: **RPE re-enabled on the Hypertrophy Capability block — it should never have been
  disabled.** The Today-tab card redesign built this column as a static, non-interactive dash
  based on a misreading of the reference wireframe (the dash meant "not filled in yet in the
  mockup", not "this field doesn't exist"). Checked before flipping any UI flag: the schema
  genuinely had no `rpe` column on `hypertrophy_logs` at all, so there was nowhere for a typed
  value to land — this needed a real migration (`0028_hypertrophy_rpe.sql`), not a CSS/prop
  fix. RPE now renders as the same select input reps/load already use, for every exercise incl.
  both superset pairs and standalones (Serratus Anterior Raise, Front-Foot-Elevated Split
  Squat). Stays **optional** — deliberately NOT added to `isHypertrophyDone`'s required-field
  check, per instruction; a regression test confirms RPE presence/absence never affects
  Done-readiness. Extracted the R6–R10 option list (previously only inline in `LogRpe`) into a
  shared `RPE_OPTIONS` constant so Giant/Volume/Carry and Hypertrophy's per-set RPE read from
  one source. Spot-checked the rest of Capability for the same "built read-only" mistake — Oly's
  quality-mark buttons and weight input, and Carries' RPE-6 entry, were already genuinely
  interactive; nothing else was disabled.
- `fix`: **Hypertrophy data appeared to vanish after navigating away and back (present again
  after a full restart) — a real in-memory state bug, not a caching/service-worker issue.**
  `App.tsx`'s `onSaveHypertrophyLog` deduped the local `hypertrophyLogs` array by
  `(sessionId, movementId)` only — the correct key, since `hypertrophy_logs` moved to one row
  per (session, movement, SET) in the 2026-08-10 card redesign, is
  `(sessionId, movementId, setNumber)`. Every per-set save's `Promise.all` (3 concurrent saves
  per movement) filtered out and discarded the OTHER already-saved sets for that movement
  before appending its own — only the last-resolving set's row survived in memory. The database
  itself was always correct (the actual per-set upsert has always used the right key); a full
  reload re-fetches from the DB and looks fine, which is exactly why the symptom pattern
  pointed away from a failed write. The Capability card's stuck Done button was the SAME bug,
  not a second one — `isHypertrophyDone` was correctly evaluating an array that had already
  lost rows before the card even re-rendered; fixing the one dedup key fixed both symptoms.
  Ruled out the service-worker hypothesis directly: `vite.config.js`'s `runtimeCaching` only
  covers Google Fonts, nothing touches the Supabase API. Verified the fix logic in isolation
  (the buggy filter collapses 3 sequential per-set saves for one movement down to `[3]`; the
  fixed filter correctly keeps `[1,2,3]`) since dev writes are blocked against production and a
  live concurrent-save repro wasn't safe to force. Confirmed live against the real Aug 10
  session: `D. Hypertrophy` reads `✓ Done` on a fresh load with real per-set data intact.

## 2026-08-10 (Copy Session Summary — data bugs + collapsed-by-default list)
- `fix`: **Volume Block weight was wrong whenever the Volume difficulty differs from the
  Giant block's.** `session-summary.ts` computed the main lift's Volume-block weight as
  `volumeWeight(s.topWeight)` — `topWeight` is the GIANT block's own day-top (at the Giant
  difficulty), not the Volume block's day-top (at its own independent `volumeDifficulty`).
  The secondary lift's Volume line already read the correct value off the `weights` grid; only
  the main lift had the bug, which is why it went unnoticed — the one test with mismatched
  difficulties never gave the main lift its own weights-grid entry, so the wrong number went
  unchecked. Reported live: Giant Hard top 120 kg → summary showed 95 kg (`volumeWeight(120)`)
  for a Volume block actually run at the Light day-top, 108 kg → 85 kg logged. Fixed to read
  `weights[cycle][dayType][volumeDifficulty]`, the same source Today renders from. Audited the
  rest of the generator against this same failure mode (a separate calculation that can drift
  from what Today actually shows) — every other field (Giant top/RPE/arrow, set ladder,
  completion, secondary ladder, accessory reps, duration, notes) already reads the stamped
  session record directly or recomputes via the identical engine call Today uses; confirmed
  `trends.ts`/`export-csv.ts` don't touch Volume-block math at all, so this was isolated to the
  summary screen.
- `fix`: **A "Carry" line rendered on every session regardless of the active cycle.** The Carry
  section was gated only on `meta && s.dayType` (true for every session) instead of the active
  cycle's program — it rendered because `carryRounds` defaults to `3` (never null) in every
  blank session draft, so the presence check was always true even on C1/C2 sessions where the
  Carries UI never appears. Folded Carry into the same cycle-dispatch already used for
  Hypertrophy/Oly (`capabilityProgramFor(s.cycle)`), so exactly one Capability line renders,
  matching whichever block is actually active that cycle. Two existing tests had fixtures that
  incidentally exploited these bugs (same Giant/Volume difficulty masked the first; an
  unrealistic `weekType: 'training'` + `cycle: null` combo masked the second) — corrected both
  and added explicit regression tests. 5 new tests, 19/19 passing (was 16).
- `feat`: **Copy Session Summary's session list is collapsed by default.** Previously, tapping
  a day immediately showed the full plain-text preview inline (notes included), pushing Copy
  below it — every copy meant scrolling past the notes. Now rows render as one-line collapsed
  summaries (same collapse/expand visual language as the Today-tab SessionCards, §Today
  redesign above); tapping a row selects it and reveals a Copy action right there on the row,
  no expansion needed (the "copy and move on" path); a separate chevron expands the row to read
  the full text. Selecting and expanding are independent state (`selectedKey`/`expandedKey`) —
  neither requires the other. (`Data.tsx`.)

## 2026-08-10 (Today tab — sequential expandable cards)
- `feat`: **Today redesigned as four independent SessionCards** (A. Primer, B. Giant,
  C. Volume, D. Capability — always this order; only D's label/content changes by cycle).
  Pre-start: all four render expanded with fields locked, same as before. Start Session
  collapses all four to one-line summaries and auto-expands Primer, unlocked. Each card's
  "Done" button — plain "Done" everywhere, never block-specific text — is disabled until
  that block's own required fields are filled (`engine/session-progress.ts`:
  `isPrimerDone`/`isGiantDone`/`isVolumeDone`/`isCarriesDone`/`isHypertrophyDone`/`isOlyDone`,
  each reading the block's real schema, not a generic "every visible field" rule). On Done
  the card collapses to `[Letter]. [Name] — [context] ✓ Done` and the next card in sequence
  auto-expands. Tapping a `✓ Done` card reopens it for peek-and-fix without disturbing
  whichever card is currently active further down the sequence; Done again re-collapses it.
  A card only collapses on a *successful* save — `onSaveCard` now rethrows on failure
  (`Today.tsx`/`SessionModal.tsx`) so a blocked/failed write leaves the card open with the
  edit intact instead of silently discarding it behind a card that looks complete.
- `feat`: **Calendar's SessionModal gets the same four cards**, in a simpler "free" mode —
  no lock, no sequence: every card starts expanded and its header freely toggles open/closed
  regardless of done state (`Giant2SessionForm`'s new `sequential` prop, default `true` for
  Today, `false` for the modal).
- `feat`: **Hypertrophy moves to real per-SET logging** (`GIANT2_HYPERTROPHY_SETS` = 3 rows
  per exercise, each with its own Reps/Load — RPE shown as a static "–", not a field). Schema
  change: `hypertrophy_logs` gets a `set_number` column and its unique constraint becomes
  `(session_id, movement_id, set_number)` (migration `0027`; table was empty in prod, no
  backfill needed). A movement can be flagged `weight_optional` (new real boolean column on
  `movements`, not the free-text `note`) so its Done-check only requires reps — `movements.ts`
  sets this on `hip_back_extension`. Giant/Volume/Oly/Carries deliberately keep today's
  existing aggregate fields as their Done-gate (RPE+bar-speed+block-completion for Giant;
  RPE+bar-speed for Volume; quality-mark-only for Oly, no weight requirement — several Oly
  primer movements are legitimately unloaded; rounds+distance+RPE, or just a reason if
  skipped, for Carries) — a deliberate, narrower scope than "every prescribed set" read
  literally, since the Giant/Volume ladder is auto-computed off the anchor, never user-entered
  per set, and extending per-set entry there would cut against the single-anchor design
  principle in `ARCHITECTURE.md`.
- `feat`: **Primer becomes checkbox-style** (rope flow, band activation, the four day-typed
  ramp movements, and an aggregate "barbell build-up done" + optional secondary build-up
  checkbox) instead of pure prescription. Which items are checked is local/ephemeral UI
  state, never persisted per-item; `sessions.primer_done` (new boolean column, migration
  `0027`) is the one thing Done actually saves — reopening a done Primer shows every item
  pre-checked rather than trying to recall which ones (nothing meaningful to "fix" per-item
  on a warm-up checklist anyway).
- `chore`: new `SessionCard` component (`ui/SessionCard.tsx`) — the generic collapse/expand
  shell (locked/pending/active/done visual states, collapsed summary row, click-to-toggle
  header in both expanded and collapsed form) used by all four cards in both Today and the
  Calendar modal. New shared `DoneButton` (`controls.tsx`). 12 new unit tests
  (`session-progress.test.js`); smoke test extended to cover the per-set upsert and
  `primer_done` round-trip (71/71 passing).

## 2026-08-10 (Primer copy fix + Hypertrophy superset grouping)
- `fix`: **Primer — reps/rounds text was duplicated.** The bodyweight-ramp block header
  ("Bodyweight ramp — 1-2-3 reps, 3 rounds:") repeated verbatim under every one of the four
  day-typed exercise rows. Header now reads "Bodyweight ramp — 1-2-3, 10 minutes"; the per-row
  description is cleared to name-only (`Giant2SessionForm.tsx`).
- `feat`: **Hypertrophy (C1) — superset pairing.** Added a generic, nullable `superset_group`
  column on `movements` (migration `0026`, deliberately not scoped to Hypertrophy/C1 — any
  future block can reuse it) so two accessories on the same day sharing a group alternate
  rather than render as one flat list. Backfilled per the source sheet's pairing: Squat
  (Walking Lunge+Lying Hamstring Curl / Hip-Back Extension+Standing Calf Raise), Bench (Seated
  DB Press+One-Arm Row / Bicep Curl+Skull Crusher, Serratus Anterior Raise standalone),
  Deadlift (Hip Thrust+Leg Extension, Front-Foot-Elevated Split Squat standalone), OHP (Flat DB
  Bench+Lat Pulldown / Lateral Raise+Rope Face Pull). `CapabilityBlock.tsx`'s `HypertrophyBlock`
  clusters adjacent same-group items into a bordered "Superset — alternate" group; standalone
  items render unchanged. **Logging flow unchanged, deliberately** — Hypertrophy logging was
  already one aggregate weight+reps entry per movement (not per-set), so pairing two movements
  for display doesn't change what gets captured; grouping is display-only.

## 2026-08-10 (Single-program cleanup — retire Giant v7 + GiantFit, remove Giant Run)
- `chore`: **Phase 0 — backup.** Full schema+data dump taken before any destructive change
  (`giant_schema_2026-08-09.sql` / `giant_data_2026-08-09.sql`, outside the repo); row counts
  verified before/after export matched exactly.
- `chore`: **Phase 1 — audit.** Confirmed exactly what was still reachable from either retired
  era (macro M2 entirely Giant v7; M3's GiantFit-window sessions, `2026-07-27`–`2026-08-10`;
  `program_versions` #1; a set of GiantFit/Giant-Run/orphaned-duplicate `movements` rows) versus
  what Giant 2.0 actually reuses (the `db_row`/`pendlay_row` anchor lanes, the carry keys, the
  Recovery tables, the session timer).
- `feat`/`chore`: **Phase 2 — data/schema cleanup.** `0024_giant2_only_cleanup.sql` deleted
  macro M2 (cascade), the GiantFit-window sessions on M3, the now-stale `program_versions` #1
  (cascading its `program_slots`), 28 GiantFit/Giant-Run/orphaned-duplicate `movements` rows,
  and dropped `capacity_logs`/`capacity_config`/`capacity_settings`/`testing_results` outright;
  narrowed the `working_weights`/`sessions`/`accessory_weights` CHECK constraints to only the
  values Giant 2.0 ever writes. `0025_prune_empty_secondary_lanes.sql` removed the two
  never-populated `secondary_deadlift`/`secondary_squat` `program_slots` rows the smoke test
  surfaced as newly orphaned once `engine/program.ts` dropped the concept.
- `feat`: **Phase 3 — Giant Run fully removed.** UI, data, and schema all dropped — `runs` and
  `run_targets` tables, `macros.ref_pace_s`, `engine/runs.ts`, `RunForm.tsx`/`RunModal.tsx`, the
  Calendar run row, the Trends pace view. This goes further than the plan on the table at the
  start of this cleanup, which had only proposed relocating Giant Run's nav entry off the
  colliding Tue/Thu slots; the explicit decision made during this phase was to remove it
  completely instead, after confirming the running history would remain readable only in the
  Phase 0 dump. Giant Run may be rebuilt from scratch at some point, but that's out of scope
  here and isn't planned.
- `chore`: **Phase 4 — verification.** 119 engine unit tests passing, clean `tsc --noEmit`,
  clean `npm run build`, a live-DB smoke test (`npm run smoke`, throwaway macro), and live
  browser testing against production. Found and fixed one real bug during the browser pass:
  `Setup.tsx`'s Giant Block Accessories section had a React key collision (two Setup rows for
  the same accessory movement, since two lift-days share one accessory) — fixed by keying on
  `day` instead of `m.key`.
- `docs`: **Phase 5 — this doc rewrite.** `ARCHITECTURE.md` rewritten to describe one program
  throughout (no more LEGACY markers or era-branching sections; §9's schema section brought in
  line with `0024`/`0025`; the old Giant Run §13 and its scheduling-collision note in old §2.13
  removed entirely) — cut from 1178 to ~720 lines. `CONVENTIONS.md`'s file tree, domain-rules
  section, and stale bundle/id-scheme references updated to match the current single-era
  codebase. `specification.md`'s "Current capabilities" rewritten to drop every GiantFit/Giant
  Run/Capacity/testing-week claim.

## 2026-08-09 (Giant 2.0, Phase 6 — Trends/Data/CSV/docs)
- `feat`: **Trends spans Giant 2.0** — `AttendanceChart` now computes each macro's own
  `cols`/`slotLabels` from its real schedule (`enumerateMacro`) instead of a hardcoded
  3-column Mon/Wed/Fri grid + fixed `SLOTS` array, so a Giant 2.0 macro's 4-column
  Mon/Tue/Thu/Fri attendance renders correctly alongside GiantFit/legacy 3-column macros in
  the same multi-macro view. The S2 signal computed in `trends.ts` mirrors `deload-rule.ts`'s
  Giant-2.0 C3-week-4 gate exactly, so Trends and Deload never disagree on which sessions
  count as incomplete.
- `feat`: **Data page exports Giant 2.0** — `export-csv.ts` gained a `volume_difficulty`
  column on the sessions CSV (blank on GiantFit/legacy rows and on any Giant 2.0 session with
  no Volume block that week) plus two new CSVs, `hypertrophyToCsv`/`olyToCsv` (one row per
  movement per session, movement name resolved from the athlete's library, Oly rows carry the
  Q1/Q2/Q3 quality mark instead of reps) — wired into `Data.tsx`'s existing export flow
  alongside sessions/capacity/runs/testing.
- `feat`: **Copy-to-clipboard summaries cover Giant 2.0** — `session-summary.ts` gained full
  branches for the secondary (BB Row/Pull-ups)/accessory/Volume-block content and a
  Capability-not-included note on weeks where that block doesn't render; the pre-existing
  `weekType==='deload'` early-return (a legacy W15 stub) now excludes Giant 2.0 sessions
  (`!giant2`) so a real Giant 2.0 deload week gets a real summary instead of the wrong stub
  text.
- `docs`: **`ARCHITECTURE.md` rewritten as the Giant 2.0 domain doc** — §2 (domain model)
  restructured into 14 subsections describing Giant 2.0 as the current program (fixed
  Mon/Tue/Thu/Fri lift days, the two independent Giant/Volume difficulties, the
  cycle-determined Capability block, the retired Capacity block, the Giant Run scheduling
  collision), with GiantFit and legacy Giant v7 content kept as clearly-marked history;
  sections 1/3/4/5/6/7/8/9/11 updated to match, and every internal `§2.N` cross-reference
  throughout the document rechecked against the new numbering (several stale references to
  the pre-rewrite section numbers, including ones phrased as "in the prior revision," were
  found and corrected — a document that can't be safely cross-referenced from within itself
  isn't done).
- `docs`: **`CONVENTIONS.md` updated for Giant 2.0** — the file tree gained the new engine
  modules (`movements.ts`/`program.ts`, deliberately unwired from any live session view) and
  UI components (`Giant2SessionForm.tsx`, `CapabilityBlock.tsx`); §7's domain-rules section now
  describes three eras decided strictly per session date (never a stored flag) with the
  Giant 2.0 date-engine branch (`isGiant2Date`, fixed lift days, the two independent
  difficulty lookups, `capabilityProgramFor`) and a note that the retired Capacity block is an
  era gate, not a deletion.
- `docs`: **`specification.md`'s "Current capabilities" rewritten** — it had described
  GiantFit as the current program since before this migration started (Phases 1-5 only added
  change-log entries, not a capabilities-summary update); now describes Giant 2.0's schedule,
  session structure, and every touched screen as current, with GiantFit condensed to its prior-
  era role, matching the level of detail the GiantFit migration itself received when it landed.
- `chore`: all 225 engine unit tests pass (13 files); `tsc --noEmit` and `npm run build` both
  clean.

## 2026-08-09 (Giant 2.0, Phase 5 — deload signals)
- `feat`: **deload signals correct for Giant 2.0** — mostly confirming what
  was already true by construction, plus one real bug found while checking.
  - S1/S3/S5/S7 needed no code change at all: they already go quiet
    structurally for Giant 2.0 where they don't apply (S3 only ever gets set
    where the Carry UI renders — C3; S6 never has a `capacity_logs` row to
    find, since no Capacity block exists to write one).
  - S2 (Volume incomplete) got one explicit gate: C3 week 4 has no Volume
    block at all, so `volDone` can never meaningfully be "incomplete" that
    session. `volDone` already defaults `true` and the checkbox structurally
    can't render that week, so this was already unreachable — the gate was
    added anyway as an explicit domain rule in `deload-rule.ts`
    (`isGiant2Date(s.date) && s.volumeDifficulty == null`) rather than an
    implicit consequence of which checkbox happens to render, since deload
    recommendations directly affect real training decisions.
  - **A real gap caught while verifying this**: GiantFit's Volume and
    Capacity blocks have always gated on `!isDeload` (suppressed during ANY
    deload — reactive/mid-cycle or scheduled). Giant 2.0's Phase 3/4 Volume
    and Capability blocks were gated only on the SCHEDULE (`volumeDifficulty`/
    `cycle`), which happens to already be null during the scheduled
    end-of-macro deload but does NOT go null during a REACTIVE mid-cycle
    deload — so a reactive deload applied to, say, a C2 (Oly) week would have
    left the Volume and Oly blocks rendering at full, un-reduced content.
    Fixed: both now also gate on `!isDeload`, matching GiantFit's own
    precedent exactly ("Deload: Giant block only... Capability
    light-or-skipped" applies to any deload, not just the scheduled one).
  - The 3-occurrences/2-sessions trigger threshold is unchanged for Giant 2.0
    despite its 4th weekly session (Mon/Tue/Thu/Fri vs GiantFit's Mon/Wed/Fri)
    — reused verbatim, not rescaled; nothing asked for a new threshold and
    inventing one wasn't in scope.
  - `SIGNALS` (constants.ts) is unchanged — S6 stays fully defined since it's
    still live for GiantFit; only a doc comment notes it has no Giant 2.0
    equivalent and isn't replaced.
  - 4 new deload-rule tests (S2's C3W4 exception + a GiantFit regression guard
    proving the gate doesn't leak into the era it shouldn't touch, + one
    proving S3/S6 need no code change at all). Also caught and fixed a crash
    the new S2 gate introduced in the existing test suite (`isGiant2Date`
    called on the test factory's unset `date` field) before it reached anyone
    — guarded with `!!s.date` first. 215/215 tests passing, clean typecheck,
    clean build.

## 2026-08-09 (Giant 2.0, Phase 4 — Capability block: Hypertrophy/Oly/Carries)
- `feat`: **the Capability block now renders — Giant 2.0 sessions are
  complete, Primer through Capability, in Today and the Calendar modal.**
  Content is dispatched purely by cycle (`capabilityProgramFor`: Hypertrophy
  C1 / Oly C2 / Carries C3) — never by week or session, and absent entirely on
  deload (no cycle that week).
  - Migration `0023_giant2_phase4.sql`: `hypertrophy_logs` and `oly_logs` —
    one row PER MOVEMENT per session (unlike `capacity_logs`' one row per
    session), keyed `(session_id, movement_id)`. RLS transitive via
    `session_id -> sessions -> macros`, same pattern as `capacity_logs`
    (0014). `oly_logs.quality` is a genuinely new field type (`Q1`/`Q2`/`Q3`),
    not RPE.
  - **Bug found and fixed before it could bite, again**: the athlete's
    existing movement library predates Phase 1's ~35 new Giant 2.0 movements
    — `ensureSeedMovements` only seeds a completely EMPTY library, so those
    new movements (including every Hypertrophy/Oly movement this phase needs
    a real `id` for) would never have reached a real account. New
    `syncSeedMovements` inserts any missing-by-key seed movements into an
    existing library instead of skipping outright, and now runs at boot in
    place of the old call.
  - New `CapabilityBlock.tsx` — `HypertrophyBlock` (per-exercise weight ×
    reps, 3 sets, defaults prefilled from the movement's target) and
    `OlyBlock` (per-exercise weight × quality mark, plus the position-wave
    guidance text for the week). Both self-contained like `CapacityBlock`:
    own their fields, one batched Save across all the day's exercises, and
    the parent wraps `onSave` to ensure the session row exists first (FK) —
    identical shape to capacity's own wrapping in Today.tsx/SessionModal.tsx.
  - Carries (C3) needed no new component or table — inlined directly in
    `Giant2SessionForm.tsx`, reusing the session's own existing
    `carry_rounds`/`carry_distance`/`carry_rpe`/`carry_skipped` fields exactly
    as GiantFit's carry block always has.
  - Full prop-threading chain for the new per-movement log data: App.tsx state
    → Today.tsx (`CapabilityCtx`, mirrors `CapacityCtx`) → SessionForm.tsx →
    Giant2SessionForm.tsx, and the parallel chain through Calendar.tsx →
    SessionModal.tsx for editing any day, not just today.
  - **Known, deliberately deferred gap**: no delete for a Hypertrophy/Oly
    entry — clearing a value and re-saving is how one is unset (same trim
    already made for the Volume block's bodyweight pull-ups in Phase 3).
  - 211/211 tests passing (no new engine logic to test — this phase is
    data-model + UI wiring; the underlying `capabilityProgramFor` dispatch was
    already covered in Phase 2), clean typecheck, clean build. Main bundle
    crossed the 500kB warning threshold (Today.tsx is intentionally eager, not
    lazy-loaded) — noted, not addressed; a future code-splitting pass is
    optional cleanup, not correctness.
  - Same verification caveat as Phases 1-3: no UI/component test infrastructure
    exists in this repo for any session view, and login for a real visual
    check isn't available to me (the only credential is the athlete's real
    account password).

## 2026-08-09 (Giant 2.0, Phase 3 — Primer/Giant/Volume session views)
- `feat`: **Giant 2.0 sessions are now loggable** — Primer → Giant → Volume,
  end to end (Today, the Calendar's per-day modal, and Setup's anchor labels).
  The Capability block (Hypertrophy/Oly/Carries) is still Phase 4 — nothing
  renders it yet, so an athlete training under Giant 2.0 before that ships
  will not see that block on screen.
  - New `Giant2SessionForm.tsx` — a SEPARATE component from `SessionForm.tsx`,
    dispatched to by date (`isGiant2Date`) at the top of `SessionForm`.
    Deliberately kept separate rather than adding a third branch inline:
    GiantFit's live rendering had to stay untouched while a real macro is
    still running under it.
  - Primer: rope flow + day-typed band activation (Crossover Symmetry upper /
    Hip Halo lower) + the bodyweight ramp, then the barbell build-up (+ the
    secondary's own build-up when weighted) — prescription-only, no RPE, same
    treatment as GiantFit's own Warm-Up block.
  - Giant block: the main lift's 4-set ladder (SCHEMES/SET_LADDER reused
    unchanged) + the secondary (BB Row always weighted, Pull-ups two-mode —
    reactivates `liftMode`/`ClusterInput` for real, not just legacy rendering)
    + the GB accessory (Ab-Roll / Leg Raises). Reused `BlockCompletion` (S7)
    and `LogRpe` verbatim.
  - Volume block: genuinely independent of the Giant block's difficulty — its
    own day-top (`volumeTop`, read off the SAME per-cycle cascade, just
    indexed by `volumeDifficulty`) and its own rep count
    (`SCHEMES[volumeDifficulty].vol` — confirmed to be the exact 6/8/10 the
    spec calls for, no new constant needed). Doesn't render at all when
    `volumeDifficulty` is null (C3 week 4).
  - **Giant 2.0's deload week is a real, loggable session** — Today and the
    Calendar modal both got a dedicated branch (GiantFit's deload has never
    had one and still shows only the static card). Reads the last training
    cycle's (C3) Hard anchor as the reference weight, `deloadTop` at ~70%,
    fixed Hard rep scheme (no H/M/L that week).
  - **Bug found and fixed before it could bite**: Giant Run's Tue/Thu/Sat
    schedule would have intercepted Giant 2.0's Bench (Tue) and Deadlift (Thu)
    sessions — the exact collision flagged as a risk in the Phase 1 plan.
    Giant Run is now explicitly suppressed on Giant2-era dates in both
    `Today.tsx` (the run-slot check) and `Calendar.tsx` (the run row) — it
    stays fully intact for any GiantFit-era macro.
  - Session ids drop the difficulty suffix for Giant 2.0
    (`buildBlankSession`/`SessionModal.buildRecord` — `${date}-${lift}`, day-
    lift is already unique, difficulty is no longer singular per session).
  - Setup's anchor grid now shows "BB Row"/"Pull-ups" instead of "DB Row"/
    "Pendlay Row" when the macro being edited/created is Giant2-era (by its
    own start date) — the underlying `db_row`/`pendlay_row` lanes and
    `ANCHOR_LABEL` (still GiantFit's) are unchanged; only the display resolves
    differently per era.
  - `giant_accessory_config`'s default merge (mappers.ts) now includes
    `leg_raises` (Giant 2.0's new GB accessory key) alongside GiantFit's four —
    one shared table, one shared merge, both eras' keys known.
  - **Known, deliberately deferred gaps**: the Volume block's bodyweight-mode
    Pull-ups render prescription-only (no separate cluster-log field from the
    Giant block's); `session-summary.ts` (the copy-to-clipboard text
    generator, `Data.tsx`) and the CSV export still render Giant 2.0 sessions
    with GiantFit-flavored labels — not a crash, just wrong copy — both belong
    to Phase 6 (Trends/Data/CSV/docs), not this phase.
  - No React/UI component tests exist in this repo for any session view
    (GiantFit's included) — verified by typecheck + build + careful review,
    matching the project's existing testing boundary. Could not log in to
    visually verify (same constraint as Phase 1 — the only credential
    available is the athlete's real account password). 211/211 engine tests
    still passing, clean typecheck, clean build.

## 2026-08-09 (Giant 2.0, Phase 2 — date/position engine)
- `feat`: **Giant 2.0 date/position engine** — `corePosition` (and
  `computePosition`/`nextSessionFrom`/`enumerateMacro`) now compute Giant 2.0
  positions directly, gated by a new `isGiant2Date` (mirrors `isGiantFitDate`
  exactly; UNCHANGED — still true for Giant2 dates too, since they're
  chronologically later). New `Position.giant2` flag — check it FIRST, it's
  the more specific era.
  - **Fixed Mon/Tue/Thu/Fri day→lift** (`GIANT2_DAY_LIFT`), no rotation —
    `isSessionDay` now reads `GIANT2_SESSION_DAYS` for Giant2 dates instead of
    the Mon/Wed/Fri set.
  - **Two independent difficulties resolved per session**: `giant2GiantDifficultyFor`
    (week 1-3 reads the athlete's Setup override merged over the code default,
    week 4 always collapses per cycle, ignoring any override) and
    `giant2VolumeDifficultyFor` (fixed per cycle, null on C3 week 4 — no Volume
    block that week). Both exposed as pure, date-free lookups for reuse
    outside the position engine.
  - **Deload week carries a dayType** for Giant 2.0 (Mon is always Squat, deload
    or not — confirmed against the 13-week calendar) — a deliberate departure
    from GiantFit, where deload has never had one. No H/M/L difficulty either
    way (deload runs a flat ~70%).
  - `capabilityProgramFor(cycle)` — the cycle→Hypertrophy/Oly/Carries dispatch,
    exposed as its own pure function (`GIANT2_CAPABILITY_BY_CYCLE`).
  - `capacityVariant` is now explicitly null for ALL Giant2 dates, including
    Monday/Friday which overlap GiantFit's own Mon/Wed/Fri capacity-slot
    weekdays — guarded so the two unrelated mechanisms can never cross-talk.
  - `Calendar.tsx`'s week-row grid is now `repeat(row.cells.length, 1fr)`
    instead of a hardcoded 3 columns, so a Giant2 week's 4 cells (and a
    macro that happens to straddle the cutover) render correctly. The
    separate Giant Run row stays fixed at 3 columns (unrelated schedule).
  - `giant2Difficulty` (the athlete's Setup override, loaded in Phase 1) is now
    threaded into the live `computePosition`/`enumerateMacro` calls in
    `App.tsx`/`Calendar.tsx` — Setup edits already take effect everywhere a
    position is computed, ahead of any session view existing to render one.
  - **Important, confirmed-intentional behavior** (documented in a new test,
    mirrors exactly how the GiantFit cutover itself always worked): **the
    DATE decides the era, not the macro.** A macro that started under GiantFit
    and is still running on 2026-08-10 does NOT keep running GiantFit — its
    remaining sessions render under Giant 2.0 rules from that date on, using
    that macro's OWN week/meso clock (e.g. its own C1 W3), not a fresh C1 W1.
    To get the clean Giant 2.0 C1 W1 the 13-week calendar describes, a **new
    macro dated 2026-08-10 must be started in Setup** — the engine has no
    concept of "pause this macro at the cutover," by design (GiantFit is
    retired outright, not run alongside).
  - 28 new/updated tests (18 new Giant 2.0 date-engine cases + 3 existing
    GiantFit tests fixed — their fixture dates fell past the new cutover,
    since GIANT2_START_DATE is only 14 days after GIANTFIT_START_DATE,
    narrower than one mesocycle; rotation-table coverage for the
    now-unreachable slots moved to the existing date-free `rotationLiftFor`
    helper). 211/211 tests passing, clean typecheck, clean build.
  - **Still nothing renders a Giant 2.0 session view** — Setup's anchor grid
    and every session component are next (Phase 3).

## 2026-08-09 (Giant 2.0, Phase 1 — data model)
- `feat`: **Giant 2.0 — Phase 1 of the program replacing GiantFit entirely** (cutover
  `GIANT2_START_DATE = 2026-08-10`, a Monday; no program-type selector, GiantFit becomes
  read-only history below the cutover exactly like Giant v7 did before it). This phase is
  data-model-only — nothing renders Giant 2.0 sessions yet (Phase 2/3).
  - **Two independent difficulties per session.** `sessions.volume_difficulty` (new,
    nullable) — the Volume block's OWN difficulty, fixed per cycle (Light C1 / Medium C2 /
    Hard C3), independent of the Giant block's; null = no Volume block that session (C3
    week 4, a semi-peak week). Migration `0022_giant2_phase1.sql`.
  - **Weekly Giant-difficulty rotation is athlete-editable, not hardcoded** — new table
    `giant2_giant_difficulty` (week-in-cycle × lift → difficulty, RLS), capacity-config
    merge pattern against a code default (`GIANT2_GIANT_DEFAULT_ROTATION`, confirmed against
    the athlete's 13-week calendar, same rotation repeats every cycle). Week 4 always
    collapses to one difficulty for all four lifts and is never stored
    (`GIANT2_WEEK4_DIFFICULTY`, a pure function of the cycle). New Setup card ("Giant
    Difficulty Rotation") to review/edit it ahead of the cutover.
  - **The Capability block's content changes by CYCLE** (Hypertrophy C1 / Oly C2 / Carries
    C3, `GIANT2_CAPABILITY_BY_CYCLE`) — the "one level further" than GiantFit's Move 1
    modularity, which only made exercises *within* a fixed block into data. Extended
    `engine/program.ts` with new always-seeded slot groups (`primer.upper`/`primer.lower`,
    `capability.hypertrophy.<day>`, `capability.oly.<day>`; Carries reuses `carry.<day>`
    unchanged) — the registry doesn't need to know about cycles, only the reader does.
  - **The modular program-slots system (dormant since the GiantFit Phase 1/2 prep) is now
    a real consumer**: Giant 2.0 is seeded as **program version 2**
    (`ensureSeedGiant2ProgramVersion`, `buildGiant2SeedSlots`), effective from
    `GIANT2_START_DATE` — `versionForDate` already resolves multi-era history correctly
    with no changes (GiantFit-era dates → version 1, Giant2-era dates → version 2,
    pre-GiantFit → neither). OHP's BB Row and Bench's Pull-ups **reuse the existing
    `db_row`/`pendlay_row` anchor LANES** (only the occupant changes, per the
    carry-key/lane discipline) — no anchor `CHECK` migration needed. Pull-ups stays
    two-mode (`liftMode`, reactivated for real use, not just legacy rendering).
  - New movement-library content (`engine/movements.ts`): `bb_row`, `pullup` (anchored);
    `leg_raises` (Ab-Roll reuses the existing `ab_rollout`); Primer content (rope flow, band
    activation, 8 day-typed bodyweight-ramp movements, 1-2-3 ascending scheme,
    `GIANT2_PRIMER_RAMP_ROUNDS`, tempo not tracked); 16 Hypertrophy accessories; 10 Oly
    technical-work movements (cluster notation in `note`, e.g. "4-5×2+1"). Carries reuse
    the GiantFit day→implement mapping unchanged.
  - **Oly quality mark** (`OLY_QUALITY`: Q3/Q2/Q1) is a new logging concept — deliberately
    NOT modeled as a movement capability or reused RPE field; lands on a dedicated
    `oly_logs` table in Phase 4.
  - 13 new tests (`engine/giant2.test.js`): rotation-table internal consistency (the exact
    contradiction almost shipped during planning is now a permanent regression guard),
    seed-slot parity, multi-era `versionForDate` coexistence. 196/196 tests passing,
    clean typecheck, clean build.
  - **Open for Phase 2+**: no session view reads any of this yet. Deload signal S6 is
    retired (no Capacity block in Giant 2.0), not replaced.

## 2026-07-31 (S6 replacement)
- `feat(deload)`: **S6 stops measuring the clock — capacity time → capacity completion.**
  The capacity TIME trend (per-round time vs a rolling same-variant average ×1.15, 3-session
  cold start, deload-week exclusion both sides) is **retired as a deload trigger**: in a
  7-movement circuit with no time cap, per-round time is dominated by transitions and
  equipment availability, so a 15% swing sat inside the noise floor — it measured the gym,
  not the athlete — and because variants alternate weekly, a variant needed ~3 weeks to earn
  a baseline that any circuit edit then reset. Meanwhile the capacity block had **no
  completion signal at all**, while the rest of the rule treats "couldn't complete the
  prescribed work" as its core fatigue currency (S2/S7/S3). **S6 is now "Capacity not
  completed as prescribed (fatigue)":** one occurrence per capacity log in the week whose
  `completion` is a `*_fatigue` value — no streak rule, no cold start, no baseline, exactly
  like S2 and S3. Migration `0021` adds `capacity_logs.completion` with a CHECK over
  `completed` / `cut_short_fatigue` / `cut_short_time` / `scaled_fatigue` / `scaled_other`;
  the **firing rule is encoded in the value names** (`isCapacityFatigue` — any `*_fatigue`
  fires), mirroring `carry_skip_reason`'s fatigue-vs-schedule split, so attribution is the
  athlete's at log time and never inferred. **No backfill:** null reads as `completed` like
  `sessions.block_completion`, and since signals are computed and never stored, history
  re-renders under the new definition with **no data loss**. **Deleted:**
  `capacityPointsForSignals`, `rollingVariantAvg`, `S6_THRESHOLD`, `CAPACITY_ROLLING_N` and
  the `slow` flag on the capacity point; `computeWeekSignals`' trailing param is now the
  week's capacity **logs** (still trailing, still defaulting empty — lift-only callers
  unchanged), narrowed by the new `capacityLogsForSessions`. **The Trends per-round chart is
  untouched** and asserted so — good enough to look at, not good enough to fire a trigger.
  **UI:** the capacity block gains a completion control beside its RPE — the giant block's
  one-tap-then-reason control, generalised into a shared `CompletionPick` in `controls.tsx`
  and now used by both (S7's rendering is unchanged). **Consumers:** capacity CSV gains a
  `completion` column; copy-summaries append the state only when it isn't `completed` (a
  completed session's summary is **byte-identical** to before — asserted). Trigger
  arithmetic, exemptions, and S1/S2/S3/S5/S7 are all untouched. typecheck + **183 tests** +
  build green; **smoke 108/108** (all five values accepted, `''`→NULL reads back as
  completed, unknown rejected).

## 2026-07-31 (later)
- `feat(program)`: **modular program content — Phase 2: versioned slot assignment + the
  resolver.** The data-driven path is built **alongside** the hardcoded one and proven
  identical; **nothing in `src/ui/` reads it yet**, so there is no behavioural change.
  **The slot registry is CODE** (new `engine/program.ts`): 8 **anchored lanes** whose keys
  *are* the `working_weights.lift` values (`deadlift`/`ohp`/`squat`/`bench` mains, `db_row`/
  `pendlay_row` secondaries, and the nullable `secondary_deadlift`/`secondary_squat` lanes —
  so an anchor follows its LANE, never its occupant; `GIANTFIT_ROW` becomes the day→lane
  lookup), plus the variable-count groups `gb_accessory.{day}` · `capacity.{A,B}` ·
  `carry.{day}` · `activation` · `bulletproof`. `SLOT_CONTRACTS` says what each will accept
  and `validateVersion` returns every violation (empty = publishable). **Versioning**
  (migration `0020`, applied): `program_versions` (user-scoped, unique per number and per
  `effective_from`) + `program_slots` (`slot_key` · `order_index` · nullable `movement_id` ·
  `reps` · `rounds` · `optional`), RLS on both (slots transitive via version). **Editing is
  effective-dated, never retroactive:** `versionForDate` picks the greatest
  `effective_from <= date` (local-date math), so a session renders as it was lived; v1 is
  seeded at `GIANTFIT_START_DATE`, and **pre-cutover dates resolve to NO version** and keep
  the legacy path. `resolveProgram` exposes the same shape the constants do —
  `mainFor`/`secondaryFor`/`accessoriesFor`/`capacityFor`/`carryFor`/`activation`/
  `bulletproof` — ordered by `order_index`, with unknown or **archived** occupants skipped
  (`mergeCapacityConfig`'s drop-on-read rule). **Seeding v1** takes the hardcoded occupants
  but the athlete's OWN numbers from `capacity_config` / `capacity_settings` /
  `giant_accessory_config` where set; those three tables are **left in place and still
  written** (absorbed only after the switchover). **The acceptance gate — 18 parity tests**
  (`program.test.js`): the resolver reproduces the constants for every day × difficulty ×
  variant (mains, rows, accessories, both circuits in order, carries, activation doses,
  Bulletproof incl. its optional tail), `sessionSummary` is **byte-identical** fed from the
  resolver vs the constants for all four day types, `versionForDate` is null pre-cutover and
  v1 after, and `validateVersion` rejects a non-anchored movement in an anchored lane while
  accepting an empty nullable lane. **They passed without editing a single constant.**
  `deload-rule.ts`, `date-engine.ts`, `loading.ts`, `constants.ts`, `capacity.ts`,
  `session-summary.ts` and every session view are byte-identical (`git diff` empty).
  typecheck + **178 tests** + build green; **smoke 105/105** (v1 seeded at the cutover, all
  8 lanes present with the two empty ones carrying an explicit null occupant, 7+7 circuits
  in order, the seeded version passes every contract and resolves, and re-seeding is a
  no-op).

## 2026-07-31
- `feat(program)`: **modular program content — Phase 1: the movement library.** Program
  content (which exercise sits in which slot, and its default reps) has been hardcoded in
  `engine/constants.ts` + `engine/capacity.ts`; this is the first half of making the
  **occupants of slots into data** (slots themselves stay code). New **`movements`** table
  (migration `0019`, applied): user-scoped + RLS from the start, `key` (stable identity,
  unique per user) · `name` (display, freely editable) · **two capabilities** —
  `load_type` (anchored/recorded/bodyweight/none) and `count_type`
  (reps/reps_per_side/time_seconds/calories/distance) — plus `default_reps`, `rep_unit`,
  `note`, `archived`. New pure `engine/movements.ts`: the capability unions,
  **`SEED_MOVEMENTS`** (33 movements derived 1:1 from today's content — the six anchors,
  four carry implements, four Giant Block accessories, both capacity circuits, the
  activation list and the Bulletproof circuit), `validateOccupant(contract, movement)`
  (generic over the slot contract that lands in Phase 2), `formatCount` (**the existing**
  display join rule: `/`-prefixed units tight, word units spaced) and `slugify`. The library
  **seeds itself per user on first load** from that code list (`ensureSeedMovements`, writes
  only when the user has none) — so a second account bootstraps with no migration.
  Movements are **archived, never deleted**. `0019` also widens the `working_weights.lift`
  CHECK with the two currently-empty secondary lanes (`secondary_deadlift`,
  `secondary_squat`) — widened, never dropped. New Setup card **Movement Library** (last,
  grouped by load type, archived collapsed, add/edit with an immutable auto-slugged key and
  a live count preview; the archive-blocked-while-referenced guard is written and inert
  until slots exist). Movements are user-scoped: loaded next to `getBreakDays`, **not** in
  `loadMacroBundle`, and cached in the offline snapshot. **Behavioural parity: nothing
  consumes the library for prescription yet** — `deload-rule.ts`, `date-engine.ts`,
  `loading.ts`, `constants.ts` and `capacity.ts` are byte-identical (`git diff` empty), so
  every session view, summary, CSV and Trends output is unchanged. typecheck + **160 tests**
  (7 new: `formatCount` parity per capacity movement, the seed-covers-every-constant set
  diff, contract validation) + build green; **smoke 97/97** (seed lands, is not duplicated
  on a second call, capabilities round-trip, both new lanes accepted, unknown lane still
  rejected).

## 2026-07-30 (docs + summaries)
- `feat(data)` + `docs`: **GiantFit revision — Phase 6 (copy-summaries, migration audit, docs).**
  **Copy-summaries** now match the revised session: the Giant Block prints the **anchored row's
  computed ladder** off its own per-cycle anchor at fixed reps (`Pendlay Row: 8@50 · 8@55 ·
  8@57.5 · 8@60`, degrading to `9 reps/round` when that cycle's anchor is unset) plus the day's
  **bodyweight accessory** (`GHD Abs: 10 reps (BW)`, honouring the Setup target), and the Volume
  block prints the row's own 80% line; a pre-revision free row weight still renders, now marked
  `Pair (logged): …`. `sessionSummary` takes `giantAccessory` as a new optional trailing param
  (additive signature); **legacy pre-cutover summaries are byte-identical** (asserted).
  **Migration audit** (no new migration needed): `0017` + `0018` applied on both sides; the
  revision added **no** session columns and dropped nothing — `sessions.pair_weight` is retained
  and marked deprecated in the schema, retired `capacity_config` rows are ignored on read, and
  `capacity_logs` never referenced a movement key; `rollToNextMacro` carries the two new anchors
  forward automatically (it iterates `ANCHOR_LIFTS`). **Docs:** `ARCHITECTURE.md` §2.1 (six-anchor
  model incl. the per-hand DB Row), **§2.3 rewritten** as the Giant Block composition table (rows
  + accessories, with the superseded free-weight era recorded), §2.2/§2.4 (row build-up, row reps
  vs the descending table), §2.11 (7-movement variants + the content-evolution rule), §2.12, §3,
  §8, §9 (both new migrations, the `giant_accessory_config` DDL, deprecated `pair_weight`) and a
  new decisions-log entry; `CONVENTIONS.md` §1 constants inventory, §7 loading/capacity rules and
  the REMOVED list. typecheck + **153 tests** + build green; **smoke 89/89**.

## 2026-07-30 (late night)
- `feat(capacity)`: **GiantFit revision — Phase 5 (capacity variant edits).** Both circuits
  are now **7 movements**. **Variant A:** GHD 10 removed; Single Unders 40 → **Double Unders
  20** (new `double_unders` key — same movement/count as variant B's). **Variant B:** BB
  Clean 6 → **Hang BB Snatch 5** (loaded, new `hang_bb_snatch` key); Toes-to-Bar 8 removed
  (it lives on as the OHP day's Giant Block accessory — a different table, no collision).
  Everything else is unchanged: timer-only logging, no time cap, A/B alternation by
  scheduled slot, absent on deload weeks, reps/weights user-configurable in Setup, Bike
  still the variant-B calories movement. **No schema change and no data loss:** stored
  `capacity_config` rows for retired movements stay in the DB and are ignored on read
  (`mergeCapacityConfig` drops unknown keys — now covered by a test + a smoke assert), and
  `capacity_logs` never referenced a movement key, so every historical result, the S6
  signal series, the Trends capacity view and the capacity CSV render exactly as before.
  typecheck + **151 tests** + build green; **smoke 89/89**.

## 2026-07-30 (night)
- `feat(giantfit)`: **GiantFit revision — Phase 4 (rows join the Volume Block).** OHP-day
  Volume now lists **DB Row** and bench-day Volume **Pendlay Row** beneath the main lift,
  through the identical helpers — `volumeWeight(rowDayTop)` (80% of the ROW's own day top,
  2.5 kg rounding) and `SCHEMES[difficulty].vol` reps (**Hard 2×6 · Medium 2×8 · Light
  2×10**). No new logging fields: the block's existing "Both sets completed" checkbox and
  Volume RPE/bar-speed cover the whole block (so the S2 volume-incomplete deload signal is
  unchanged). DL/squat days render Volume exactly as before; deload weeks still have no
  Volume block. No schema change. typecheck + **151 tests** + build green.

## 2026-07-30 (evening)
- `feat(giantfit)`: **GiantFit revision — Phase 3 (Giant Block composition).** The Giant
  Block per day is now DL + Ab Rollout · OHP + DB Row + Toes-to-Bar · Squat + GHD Abs ·
  Bench + Pendlay Row + GHD Back Extension. **Rows:** rendered as a computed ladder line
  off the row's own anchor (85/90/95/100% of the row's day top) with **fixed reps by
  difficulty — H8 / M9 / L10** (`GIANTFIT_ROW_REPS`; only the main lift's reps descend);
  the free `pair_weight` entry is **removed from the form** — pre-revision GiantFit
  sessions that logged one keep showing it as a muted "(logged)" line, and the column/
  drafts are untouched (no data loss). **Bodyweight accessories:** rep-only, no load; one
  per day (`GIANTFIT_GB_ACCESSORY`), default **10** each, rep target editable in Setup's
  new "Giant Block Accessories" card (capacity-config pattern: new user-scoped
  `giant_accessory_config` table, migration `0018` applied, defaults merged on read,
  loaded with the bundle + offline snapshot). typecheck + **150 tests** + build green;
  **smoke 88/88** (0018 table live, defaults merge).

## 2026-07-30 (later)
- `feat(giantfit)`: **GiantFit revision — Phase 2 (build-up for the anchored rows).** OHP-
  and bench-day session views (Today + Calendar modal, shared `SessionForm`) now append a
  second barbell build-up to the Warm-Up card — "Then DB Row / Pendlay Row build-up:" —
  using the identical rule as every lift: 8-5-3-2 @ ~40/55/70/85% of the ROW's own Giant
  Block Set 1 for the day (via the same `warmupSets` engine path; the row's day top comes
  from the row's anchor, never the day's main lift; ~70% deload treatment matches the main
  top). New `GIANTFIT_ROW` map (day → row anchor: ohp→`db_row`, bench→`pendlay_row`);
  parents pass the row's weights cell like `pullupCell` — no engine change, loads render
  "—" until the row anchor is set in Setup. DL/squat days unchanged (no row). typecheck +
  **148 tests** + build green.

## 2026-07-30
- `feat(giantfit)`: **GiantFit revision — Phase 1 (rows become anchored lifts).** DB Row
  (OHP day, anchor entered as kg **per hand**) and Pendlay Row (bench day) join the anchor
  set: `ANCHOR_LIFTS` is now six (`db_row`, `pendlay_row` added), each with the identical
  single-anchor cascade — per-cycle Hard-top entry in Setup (C1/C2/C3), 100/95/90 day
  spread, 85/90/95/100 ladder, 80% volume, uniform 2.5 kg rounding — no special-casing
  anywhere (Setup grid/preview, mappers, `rollToNextMacro` are all generic over
  `ANCHOR_LIFTS`). New data-driven `ANCHOR_NOTE` shows "per hand" on the DB Row Setup
  label. Migration `0017_row_anchors.sql` (applied) widens the `working_weights`
  lift CHECK with the two row values; legacy `dips`/`pullup` stay valid. Later phases:
  build-up (2), Giant Block composition + configurable bodyweight accessories (3), Volume
  rows (4), Capacity edits (5), docs (6). typecheck + **147 tests** + build green;
  **smoke 87/87** incl. row-anchor round-trips against the applied CHECK.

## 2026-07-24 (capacity rep semantics)
- `feat(capacity)`: **DB Snatch reps are now per-side, consistent with the lunges' per-leg
  pattern.** The Setup rep value for DB Snatch (variant A) is reps PER SIDE — `repUnit: '/side'`
  replaces the hardcoded "4/side" note everywhere (Setup label, session-view capacity list; no
  summary/CSV surface carries movement detail), the default seeds **4** (was 8 total), and the
  session view renders `{reps}/side` with no total ('/'-prefixed units join tight — "4/side",
  "8/leg" — word units keep the space, "30 sec"). The "· weight optional" label suffix is gone
  from the Setup movement labels (Reverse/Walking Lunges show just "/leg"; the `loadOptional`
  flag stays as content metadata). Variant B checked: no per-side hints present (BB Clean is a
  true total). **Stored user values untouched** — display semantics + default only, no schema
  change. typecheck + **146 tests** + build green.

## 2026-07-24 (Trends cleanup)
- `feat(trends)`: **Trends is GiantFit-only — all legacy views, filters, and series removed**
  (rendering code deleted; DB rows, History/session-log rendering, and CSV exports untouched —
  the archive keeps everything). **Views:** the "Accessories (legacy)" view is gone — chip,
  `AccessoryChart` component, `toAccessoryTrend` builder, and the `TrendAccessory` type deleted
  (the `accessory_weights` fetch stays: the Carries view resolves carry weights from it). Five
  views remain: Lifts · Runs · Capacity · Carries · Session. **Lifts:** the "Dips (legacy)" chip
  and series are gone — `ALL_LIFTS`/colors are the four GiantFit lifts and the Phase 5
  frozen-series legend filter was deleted as dead code; dips `TrendSession` rows still feed the
  day-agnostic Session-view charts (signals/duration/attendance count real lifted sessions).
  **Orphan sweep:** testing-week annotations removed from the attendance chart — legacy testing
  weeks now render as plain done/missed cells with week-number labels (W13/W14 instead of T1/T2),
  the purple 'test' status/legend/`AttStatus` member deleted. **Legacy macros in the picker**
  render error-free with only the remaining series; "All" legends/scaling carry no legacy
  series. typecheck + **146 tests** (2 orphaned accessory-trend tests removed) + build green;
  verified in-browser — five view chips, five lift chips, an M2–M3 span draws exactly
  DL/OHP/Squat/Bench with dips data present in the input, and the legacy Session view shows no
  Test annotation.

## 2026-07-24 (later)
- `feat(giantfit)`: **closing pass — Suitcase starting load.** The bench-day Suitcase carry now
  seeds a **50 kg** starting load in Setup when a cycle's value is blank (`GIANTFIT_CARRY_DEFAULTS`,
  editable like any carry weight, persists on the next Setup save); the bench `DAY_META` descriptive
  fallback shows `50 kg / hand` in session views until then. Other carries keep their values /
  stay athlete-set. Everything else in the final-extension checklist was already live and
  re-verified: the confirmed Phase 4 deload engine (S1/S2/S3/S5 + S6 capacity time trend with
  `S6_THRESHOLD`, deload weeks capacity-free and excluded from rolling averages, signal UI +
  recommendation-card dates), and the 2026-07-24 pairing/warm-up corrections. typecheck +
  **148 tests** + build green; verified in-browser — Setup seeds Suitcase 50 with the other
  carries blank, the DL modal shows the activation list with no row pairing, and a
  deload-flagged session renders Warm-Up + Giant Block only.

## 2026-07-24
- `fix(giantfit)`: **pairings & warm-up corrections + dev-date-override bug.** (1) **Deadlift
  trains alone** — the pairing set is DL alone · OHP + DB Row · Squat alone · Bench + Pendlay
  Row (`GIANTFIT_PAIRING`); any pair weight logged on a DL day during the brief wrong-pairing
  window stays renderable (summary falls back to a "Pair: DB Row …" line when `pair_weight` is
  logged on an unpaired day — History shows what was logged; no data migration). (2) **Warm-up:**
  GiantFit sessions show the fixed activation list (Band pull-aparts ×20 · Face pulls ×15 · Hip
  airplanes ×5/side · Deep squat hold ×30 sec · Thoracic rotations ×5/side, new
  `GIANTFIT_ACTIVATION`) then the unchanged 8-5-3-2 build-up — **no GOWOD reference anywhere**
  in GiantFit sessions (legacy sessions keep their GOWOD note). (3) **Bug (found testing with
  `?today`):** Today computed the position from the dev date override but stamped the session
  draft/id with the REAL date, so an overridden Today rendered the wrong era's layout — the
  session id, blank draft, stamp, and testing props now all use the override-aware date.
  typecheck + **148 tests** + build green; verified in-browser (post-cutover DL modal: activation
  list, no GOWOD, no row; OHP modal: DB Row + weight input present).

## 2026-07-23 (docs)
- `docs`: **ARCHITECTURE.md + CONVENTIONS.md rewritten for the completed GiantFit migration.**
  The phase-by-phase banner is replaced by the current state: the app implements **GiantFit
  only** — Giant v7 is retired (continues on paper; its data is read-only History), with the
  `GIANTFIT_START_DATE` cutover documented as the single per-DATE era switch. §2 now defines
  GiantFit as *the* program (lifts DL/OHP/Squat/Bench at uniform 2.5 kg; Mon/Wed/Fri lifting +
  Tue/Thu/Sat runs; 4-over-3 rotation realigning every 4 weeks with the C1W1D1 Medium-DL
  override; Warm-Up → Giant → Volume → Capacity → Carry; A/B alternation by scheduled slot
  index; carries DL Farmers / OHP Overhead / Squat Bearhug / Bench Suitcase) with new sections
  **§2.11 The Capacity block** and **§2.12 REMOVED — do not reintroduce** (dips anchor +
  two-mode engine, 0.5 kg rounding, clean block, secondary/core circuit slots, testing
  weeks/views, skill days, macro-type selector); Giant-era rules are compressed into marked
  LEGACY notes (read-only rendering, never scheduling), §4 pull-ups marked legacy, §5 already
  carried S1/S2/S3/S5 + S6 (+S7), §8 capabilities refreshed. CONVENTIONS §7 gains the same
  REMOVED list + a note of the untouched subsystems (Giant Run, Recovery, session timer) and
  the constants inventory now leads with the GiantFit set. Section numbering (§2–§14)
  preserved so every cross-reference still resolves. No code change.

## 2026-07-23 (later still)
- `feat(giantfit)`: **GiantFit migration — Phase 5 (trends, data page, export) — MIGRATION
  COMPLETE.** History spans two eras and Trends/Data handle the mix without contamination.
  **Lift trends:** **Bench** joins the Lifts view (weight + RPE + bar-speed series, green —
  post-cutover data only, automatic since bench can't predate the cutover); **Dips is frozen as
  legacy** — muted color, "Dips (legacy)" chip, still fully viewable for its historical range,
  and the weight/RPE legends now list only lifts with data in the selected range so a retired
  series ends cleanly at the cutover with no empty tail; DL/OHP/Squat continue seamlessly across
  eras. Fixed a crash the harness caught: `toCarrySessions` had no bench mapping — a bench
  session with a carry distance took down the whole Trends tab (bench → Suitcase/`carry_bench`).
  **Capacity view (new):** per-round time (total ÷ rounds) over date, **one line per variant —
  A and B never mix**; per-point tooltip (date, variant, rounds, total, per-round, RPE); a Bike
  Calories chart (variant B) below; consumes the same `perRoundSeconds` math as the S6 signal
  (`toCapacityTrend` in `engine/trends.ts`; `loadTrends` now fetches capacity logs).
  **Data/CSV:** sessions CSV gains **`pair_weight`** (union export — legacy rows keep their
  original columns, blank cells fine, old rows never rewritten); new **fourth CSV**
  `giant-program-capacity-…` (date, macro/cycle/week, day_type, difficulty, variant, rounds,
  total_time_seconds, derived per_round_s, calories, rpe, notes) via `capacityToCsv` + the new
  `getAllCapacityLogs` read; the testing button is labeled "Testing CSV (legacy)".
  **Copy-summaries** updated for the era: GiantFit sessions replace the legacy Secondary line
  with the pairing + logged weight (`Pair: Pendlay Row 42.5kg`, squat alone omits it) and append
  a capacity line — `Capacity B — 3 rds, 11:42, 27 cal, R7` (unlogged segments dropped);
  pre-cutover summaries byte-identical. **Testing references** scrubbed from standing labels:
  the attendance legend shows "Test (legacy)" only while a legacy macro with lived test cells is
  in view; Accessories view labeled legacy. typecheck + **147 tests** + build green; **smoke
  90/90**; verified in-browser — M3 range shows Bench with no dips residue, the M2–M3 span draws
  all five series with dips ending at its last pre-cutover point, and the Capacity view renders
  separate A/B lines + the calories chart.

## 2026-07-23 (late night)
- `feat(giantfit)`: **GiantFit migration — Phase 4 (deload signals & deload week)**. **New S6 —
  "Capacity time ↑":** a capacity session is *slow* when its **per-round time** (total ÷ rounds —
  normalizes short sessions) exceeds its own variant's rolling average (last **3** completed
  same-variant sessions, `CAPACITY_ROLLING_N`) × **`S6_THRESHOLD` = 1.15**; **2+ CONSECUTIVE**
  slow capacity sessions (any variant mix, consecutive by session order) = **ONE** weekly
  occurrence, attributed to the week holding the streak's later session, both sessions counting
  toward the 2-session spread. Cold start: a variant is never evaluated until it has 3 completed
  sessions. Built as shared helpers in `engine/capacity.ts` (`buildCapacityPoints` /
  `rollingVariantAvg` / `perRoundSeconds` — the Phase 5 Trends capacity view consumes the same
  series). S1/S2/S3/S5, the 3-occurrences-across-2-sessions trigger, the meso cap, break
  exemption and CONFIRM mode are all unchanged. **Renumber:** the Giant-era block-completion
  signal (previously "S6") is now **S7** — same behavior, same label; signals are computed, never
  stored, so history re-renders identically under the new number (Trends chart + types updated).
  **Deload weeks:** capacity is absent (the block never renders on reactive-deload sessions —
  Phase 3 behavior, now load-bearing; end-of-macro deload sessions are note cards) and deload
  weeks are excluded from S6 on BOTH sides — never evaluated, never in the rolling averages
  (`capacityPointsForSignals` filters by weekType + the applied-deload map), so averages skip a
  deload gap cleanly. Giant Run deload behavior untouched (TT Saturday stays). **UI:** S6 appears
  in the Deload tab's per-week listing/reference and the Today signal banner exactly like
  S1–S5/R1–R3 ("Capacity time ↑"); the recommendation card now **lists every fired signal**, with
  S6 showing the offending capacity-session dates; deload copy notes "no capacity block"
  post-cutover. No schema change. typecheck + **141 tests** + build green (8 new S6 tests:
  consecutive/one-occurrence/dates, cold start, slow-ok-slow, 3-streak still one, variant mix,
  deload exclusion both sides, per-round normalization, pooled trigger; + 3 helper tests);
  verified in-browser — synthetic slow week fires S6 with dates on the recommendation card, the
  Deload tab lists "Capacity time ↑", and a deload-flagged session renders Warm-Up + ~70% Giant
  Block only.

## 2026-07-23 (night)
- `feat(giantfit)`: **GiantFit migration — Phase 3 (session views, capacity block, carries)**.
  Post-cutover strength sessions render the GiantFit structure — **A Warm-Up → B Giant Block →
  C Volume → D Capacity → E Carry** — while pre-cutover sessions keep the legacy Giant layout
  untouched (`SessionForm` branches on `isGiantFitDate(draft.date)`; the Calendar modal + Today
  share it, so the eras can't drift). **Giant Block:** main-lift ladder + the paired row from
  `GIANTFIT_PAIRING` (DL/OHP + DB Row, Bench + Pendlay Row; squat alone) with a **free
  per-session weight entry** (`sessions.pair_weight`, migration `0016`) — unanchored, no ladder;
  secondary/core circuit, per-round cardio, and the dips/pull-up cluster UIs render only on
  legacy sessions. **Capacity block (new UI, `CapacityBlock.tsx`):** header shows the engine's
  variant (A/B) + rounds target; movement list from `capacity_config` (reps × name, weight where
  set); a **count-UP stopwatch** (Start/Pause/Resume/Finish, large display, timestamp-based like
  the session timer so backgrounding never loses time — no countdown ring); **Finish saves to
  `capacity_logs`** (variant, rounds, total seconds, Bike cals on variant B, RPE, notes), with
  manual min:sec entry for backfill, Update/Delete, offline-queued idempotent writes, and the
  session row auto-upserted first (FK-safe). Logs load with the bundle (`getCapacityLogs` join)
  and ride the offline snapshot. **Carries:** DL→Farmers · OHP→Overhead · Squat→Bearhug ·
  **Bench→Suitcase** (`carry_bench`, migration `0016`); Setup's accessories card is now the four
  carries only (legacy secondaries removed from UI; starting loads blank by design); roll-forward
  carries only GiantFit items. History's top-set list gains Bench (dips kept for legacy).
  typecheck + 130 tests + build green; **smoke 89/89** (pair_weight + carry_bench + macro-scoped
  capacity-log join); verified in-browser — DL/Squat/Bench modals show the right block order,
  variants (A/A/B) matching the calendar, pairings and carry names; the stopwatch's Finish saved
  session-then-log; a spring M2 dips session renders the full legacy layout. Known gaps (by
  phase): copy-summaries/CSV of GiantFit fields land in Phase 5; capacity-aware deload signals
  in Phase 4.

## 2026-07-23 (later)
- `feat(giantfit)`: **GiantFit migration — Phase 2 (position engine & rotation)**. The schedule
  cuts over on **`GIANTFIT_START_DATE` = 2026-07-27** (config, `engine/constants.ts`): the DATE
  decides the era — earlier days keep the legacy Giant rules (read-only history, no row
  migration), later days use GiantFit. **Rotation:** `GIANTFIT_ROTATION` puts **Bench** in the
  slots dips held (W1 DL/OHP/Squat · W2 Bench/DL/OHP · W3 Squat/Bench/DL · W4 OHP/Squat/Bench;
  Mon=Hard/Wed=Medium/Fri=Light unchanged); `'bench'` joins the `Lift` type, labels, trends
  day-map, and the `sessions.day_type` CHECK (migration `0015`, applied). Session pairings encoded
  for Phase 3 (`GIANTFIT_PAIRING`: DL+DB Row, OHP+DB Row, Squat alone, Bench+Pendlay Row) + an
  interim bench `DAY_META` entry so bench cells render before the Phase 3 views. **C1 override:**
  each macro's first slot (C1W1D1) computes as a **MEDIUM deadlift** (lift stays, difficulty
  drops → deadlift has no Hard day in C1); C2/C3 untouched. The UI difficulty-peek was made
  override-safe (Today + `PositionHeader` now render the position's own lift and only derive
  peeked lifts via the new era-aware `rotationLiftFor`). **Capacity alternation:**
  `strengthSlotIndex`/`capacityVariantFor` — variant A on even scheduled Mon/Wed/Fri slot
  indices since the cutover, B on odd (missed/edited days can't desync it); exposed as
  `Position.capacityVariant` + on Calendar cells (UI in Phase 3). **Skill days removed**
  post-cutover (Today shows "Rest Day"; deload copy drops "keep skill days"); testing weeks
  remain only as the legacy weeks=15 render path. **Giant Run untouched** (Tue/Thu/Sat, same
  engine). typecheck + **130 tests** + build green (new goldens: 27 Jul → M3 C1W1 DL **Medium**
  variant A · 3 Aug → Bench Hard variant B · C2W1 → DL Hard; all legacy goldens unchanged);
  **smoke 86/86** (bench day_type write); Calendar verified in-browser side-by-side — M3 renders
  the GiantFit rotation incl. the override, M2 renders its lived Giant schedule identically.

## 2026-07-23
- `feat(giantfit)`: **GiantFit migration — Phase 1 (data model & Setup)**. The app starts migrating
  from The Giant Program v7 to **GiantFit** (same single-anchor loading engine); old Giant data is
  **deprecated, never deleted** — everything logged stays readable in History. **Anchors:** Setup's
  Working Weights card now shows the GiantFit lifts **DL / OHP / Squat / Bench** (new `bench` value
  in the `working_weights` CHECK); the dips + pull-up anchors are gone from Setup and every write
  path (rows stay in the DB; legacy sessions keep rendering), and `rollToNextMacro` carries only
  the GiantFit anchors forward. The **two-mode dips/pull-up engine** (`liftMode`) is retired from
  Setup and new-session logic — kept only as a legacy render path for old dips-day sessions. The
  **0.5 kg rounding rule is removed**: `LOAD_INCREMENT`/`incFor` deleted, every derived load rounds
  at the uniform 2.5 kg (`DEFAULT_INCREMENT`); the loading engine's per-lift `lift?` params are
  gone from all call sites. **Capacity (new Setup section):** two 8-movement circuit variants A/B
  (static definitions + defaults in new `engine/capacity.ts` — DB Snatch/Pull-ups/Dips/Reverse
  Lunges/GHD/Goblet Curl/Single Unders/Box-over Burpees · BB Clean/Chin-ups/Push-ups/Walking
  Lunges/Toes-to-Bar/BB Curl/Double Unders/Bike 30 sec-for-cals), editable rep target per movement
  + weight (kg) on loaded ones, rounds 3/4 (default 3). Stored relationally: `capacity_config`
  (user-scoped rows, app defaults merged on read) + `capacity_settings` (rounds); loaded with the
  bundle, cached in the offline snapshot. **Logging table (no UI until Phase 3):** `capacity_logs`
  — one row per session (`session_id` FK, cascade-deletes with it), variant, rounds_completed,
  total_time_seconds, calories (Bike), RPE, notes — with a typed client
  (`get/save/deleteCapacityLog`, upsert on `session_id`). Migration `0014_giantfit_phase1.sql`
  (applied). Giant Run + Recovery untouched. Out of scope for later phases: rotation/position
  engine (2), session views/capacity timer/carries (3), deload signals (4), Trends/CSV (5).
  typecheck + **121 tests** + build green; **smoke 85/85** (bench anchor CHECK, capacity-log
  round-trip incl. cascade delete, legacy-anchor roll-forward exclusion); Setup UI verified in the
  browser (anchor rows exactly DL/OHP/Squat/Bench; both capacity variants render all 8 movements
  with spec defaults).

## 2026-07-15
- `feat(program)`: **13-week macro — testing weeks removed, extendable deload, TT on deload
  Saturday.** The date engine is now **weeks-driven**: every entry point
  (`corePosition`/`computePosition`/`nextSessionFrom`/`enumerateMacro`/`runSlotFor`/
  `runSlotsForWeek`) takes the macro's `{ weeks, deloadExtended }`. Training = weeks 1–12
  always; the deload = the final week, athlete-extendable to a second identical week via a new
  confirm-gated **"Extend deload one week"** control on Today's deload view (undoable; per-macro
  `deload_extended`, migration `0013` which also defaults `macros.weeks` to 13). Runs: deload
  Tue/Thu optional easy; the **first deload Saturday = the 5k TT** (prescribed, with the existing
  confirm-P flow); an extended second Saturday is optional easy. **Legacy 15-week macros (M2)
  keep their lived testing weeks renderable** — testing components/`testing_results`/Data entries
  are dormant, not deleted, and M2's schedule resolves with the deload on 20–26 Jul (acceptance
  goldens: 20.07 under M2 → deload wk 15/15; 27.07 under a new M3 anchor → M3C1W1 Deadlift Hard).
  Calendar renders 13/14/15 rows with dynamic `wk X/Y` labels and an "extended" deload row tag;
  Setup's next-macro default start follows the macro's total weeks. typecheck + **120 tests** +
  build green.

## 2026-07-13
- `fix(run/mobile)` + `feat(run)`: **run-log field fixes + visible target pace**. (1) The
  Distance/Duration/Avg-HR inputs now bottom-align (each field is a flex column with the input
  pinned), so the two-line "Duration (min:sec)" label can't push its input out of line — Today and
  the Calendar modal both (shared RunForm); the TT's "fixed 5" note moved into the distance label.
  (2) Distance is a text+decimal-keypad input — `type="number"` rejected the comma the iOS keypad
  produces in comma-locales; "," normalises to "." so 3,02 / 3.02 both work. (3) **Session-timer
  duration edit accepts seconds**: the lift "Edit (min)" fields (Today TimerBar + SessionModal) are
  now a shared min:sec `DurationEdit` control (controls.tsx) built on `parseClock` — 42.30 / 42,30 /
  4230 = 42:30, bare 42 = whole minutes; commits recompute `ended_at` in seconds. (4) The run Log
  card opens with a **"Target pace:"** line (easy/long → ~easy pace, quality → range, TT → none,
  trail/talk mode → talk test). typecheck + 116 tests + build green.

## 2026-07-12 (late)
- `feat(run)`: **Bulletproof — post-run injury-prevention block**. Every run session (all types
  incl. the time trial; tagged optional on W15/reactive-deload weeks) now ends with a compact
  fixed circuit card after the log fields — calf raises w/ slow 3-sec eccentric (2×15 straight +
  1×12 bent-knee), tibialis raises 2×20, single-leg balance 30–45s/side, seated leg raises over
  obstacle 2×12–15/side, optional plantar rolling 30s/foot; muted note "RPE 5–6, never hard…".
  Content lives in `constants.BULLETPROOF_ITEMS`/`BULLETPROOF_NOTE`; logging is a single
  **"Bulletproof circuit done"** checkbox saved on the run (habit tracker, no per-exercise log).
  Copy-summary gains a `Bulletproof: ✓` line when done (omitted otherwise); runs CSV gains a
  `bulletproof` column. Migration `0012_run_bulletproof.sql` (`runs.bulletproof boolean default
  false`; legacy NULL reads as false). typecheck + **116 tests** + build green; smoke extended
  (boolean round-trip + legacy-NULL default).

## 2026-07-12 (night)
- `feat(run)`: **terrain awareness — Road/Trail toggle on run logging**. Trail pace varies with
  terrain, not fatigue, so trail runs no longer distort pace readouts: the Trends pace chart
  **excludes trail by default** (a "Trail runs" chip overlays them as hollow markers; legend
  numbers stay road-only), and the **R3 pace-at-HR signal evaluates road runs only, on both
  sides** (trail candidates skipped, trail baselines ignored). New segmented Terrain control in
  the run Log card (Road default, `data-run-terrain`); guidance wording centralised in
  `RUN_TERRAIN_NOTE`: quality days always state "flat/road only", the TT "always the same flat
  route", and selecting Trail on easy/long/deload days appends the ignore-pace/talk-test note
  live. Copy-summary marks trail (`… → 8:20/km · Trail`); runs CSV gains a `terrain` column.
  Migration `0011_run_terrain.sql` (`runs.terrain text default 'road'` + CHECK; legacy NULL reads
  as road). typecheck + **115 tests** + build green; smoke extended (terrain round-trip +
  legacy-NULL default).

## 2026-07-12 (evening)
- `feat(run)`: **run-day structure descriptions**. Each run session view (Today + Calendar
  RunModal, shared `RunForm`) now opens with a muted-italic description of the run's structure —
  Easy / Quality (warm-up → 15–20 min of tempo blocks or cruise intervals → cool-down) / Long /
  Time Trial / deload (W15 **and** reactive-deload weeks share the pressure-free text; a C1
  Thursday resolves to the Easy text). In pace mode the engine appends the computed guidance
  ("Easy pace: ~7:15 /km" / "Quality pace: 6:15–6:40 /km"); talk-test mode shows the texts
  verbatim; TT/deload never carry a pace. Texts live once in `constants.RUN_STRUCTURE`, composed
  by pure `runStructureKey`/`runStructureText` (engine, unit-tested). The now-redundant "Pace"
  guidance row and W15 gold note were consolidated into the description (the reactive-deload gold
  note stays). typecheck + **112 tests** + build green; all five texts + pace-append verified in
  the browser (live P=6:00).

## 2026-07-12 (later)
- `fix(run/mobile)`: **pace & duration typeable on the iPhone keypad**. The reference-pace and
  run-duration inputs used `inputMode="numeric"`, whose iOS keypad has no colon — seconds were
  untypeable. Both now use `inputMode="decimal"`, and `parseClock` additionally accepts "." / ","
  as the min:sec separator ("5.35" = 5:35) and bare digit strings of 3+ digits with the last two
  as seconds ("535" = 5:35, "4230" = 42:30, "10230" = 1:02:30); 1–2 bare digits stay whole
  minutes. Invalid-pace hint updated. typecheck + **110 tests** + build green; verified live
  (preview + derived pace correct for "535" / "5.35" / "30.45").

## 2026-07-12
- `feat(run)`: **The Giant Run — companion running program**, built in six verified stages
  (engine → data/Setup → Today → Calendar → signals → Data/Trends).
  **Schema:** migration `0010_giant_run.sql` — `macros.ref_pace_s` (reference pace P, s/km;
  NULL = talk-test), `runs` (one row per logged run, id `{date}-run-{E|Q|L|T}`, macro-scoped
  RLS, `updated_at` trigger), `run_targets` (per-cycle km per slot). **Engine:** new
  `engine/runs.ts` — Tue/Thu/Sat schedule via `corePosition` (Thu quality slot runs easy in
  mesocycle 1; testing Sat = 5k TT, Tue/Thu optional; W15 all optional short easy), two-mode
  pace cascade (Easy P+75 / Quality P+15–40, `roundPace` 5 s/km, **P never rounded**), pace
  always derived from distance+duration, min:sec parse/format, run signals. **Setup:** Running
  card — P as min:sec with live pace preview; per-cycle distance targets seeded forward like the
  recorded secondaries; saved in the normal save flow; `rollToNextMacro` carries C3 targets →
  new C1 and copies P. **Today:** run days render prescription + log form (distance, duration →
  live derived pace, optional avg HR, categorical completion, notes; no timer); testing-Sat TT
  fixes distance at 5 km and, once saved, offers the **explicit-confirm** "Set as new reference
  pace P" chip (updates the current macro's P). **Calendar (Option B):** a second Tue/Thu/Sat
  run row per week block (grows vertically); same state colours with optional days never
  "missed"; logged cells show distance + pace; tap opens the new `RunModal` (focus-trapped,
  break toggle, log/edit/delete incl. retroactive, TT chip shared with Today). **Deload:**
  `computeWeekSignals(sessions, runs, priorRuns)` pools R1 (cut short – fatigue), R2 (felt
  heavy / talk-test failed), R3 (pace-at-HR degraded on 2+ runs vs the previous same-type run,
  ≥10 s/km at same-or-higher HR; skipped without HR) — trigger/suppression/cap unchanged;
  reactive-deload weeks collapse runs to short-easy-only; Deload tab buckets runs (incl.
  W13/14 testing) and lists the R signals. **Data/Trends:** runs in the unified list (`· RUN`,
  green) with a dedicated copy-summary format; third CSV export (derived `pace_s_per_km`
  column); Trends gains a **Runs** view — pace over time per run type, reversed mm:ss axis
  (up = faster), run-type filter. Offline: run writes ride the same idempotent offline queue;
  runs/targets cached in the bundle snapshot. typecheck + **109 tests** + build green; smoke
  extended (run round-trip incl. ""→NULL + idempotent upsert, target per-cycle isolation +
  upsert, ref-pace set/clear, roll-forward carry) — **run it after applying 0010**.

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
