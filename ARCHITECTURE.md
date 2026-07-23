# The Giant Program — App Architecture & Domain Reference

**Purpose of this document:** This is the **source of truth for the domain and the *why***
behind "The Giant Program" training-log web app. It captures the full program logic, the
data model, and every design decision that's been settled — everything a developer (or a
Claude Code session) needs to understand *what the app is for* and *why it works the way it
does*, without re-deriving anything.

This is one of three docs; keep them in their lanes and don't duplicate:
- **`ARCHITECTURE.md`** (this file, repo root) — the **domain** and the **why**.
- **`CONVENTIONS.md`** (repo root) — **how** the code is built
  (structure, stack, patterns, design system, testing).
- **`specification.md`** (repo root) — **what** was built and changed, dated, newest first.

The app is **built and deployed** (modular Vite + React + TypeScript on a Supabase backend —
see `CONVENTIONS.md` for the code-level picture and `specification.md` for the build history).
The sections below describe the domain it encodes and the decisions behind it; where this file
once read as a "to build" brief, it now reads as "this is what the app does and why."

**Guiding principle** (mirrored from the training philosophy it serves): **resist scope creep,
build one solid piece at a time, don't stack changes before the last one is verified.**

> **GiantFit migration in progress (2026-07-23 →).** The app is migrating from The Giant
> Program v7 to its successor, **GiantFit** — same loading engine (single Hard anchor,
> 100/95/90 day spread, 85/90/95/100 ladder, 80% volume), new lift set
> (**DL / OHP / Squat / Bench** — dips retired as a main lift) and a new **capacity block**
> (two 8-movement circuit variants). Old Giant data is **deprecated, never deleted**: every
> logged session stays readable in History forever. Giant Run (§13) and Recovery (§12) are
> untouched. **Phase 1 (landed):** anchors + Setup Capacity section + `capacity_logs` (§9).
> Still to come: rotation/position engine (2), session views/capacity timer/carries (3),
> deload signals (4), Trends/CSV (5). **Phase 2 (landed):** the position engine cut over —
> `GIANTFIT_START_DATE` (2026-07-27, config) decides the era per DATE: post-cutover days
> schedule with the GiantFit rotation (§2.6b), the C1 opening override, capacity A/B
> alternation, and no skill days; pre-cutover days render the legacy Giant rules unchanged.
> Session STRUCTURE (§2.2–§2.3 blocks, carries) still describes Giant until Phase 3.

---

## 1. What this app is

A personal training-log web app for a single user (the athlete, Zsolt). It is **not** a general
fitness app and has no multi-user requirements. Its core job, in the user's own words: **a
searchable historical overview of training + automatic reactive-deload signal tracking.** The
paper notebook remains an in-gym capture method, but the app is the queryable, structured layer
on top and the primary logging surface going forward.

Three things the app must do well:
1. Know where the athlete is in the program on any given date (deterministic, date-driven).
2. Let the athlete log every session's actual performance, and edit/backfill past sessions.
3. Surface trends and fatigue signals (the reactive-deload markers) as an honest "ego check."

It works across devices (phone + laptop) with synced data — this is why the backend matters.
It is an installable PWA with offline logging (writes queue locally and replay on reconnect).

---

## 2. The training program (domain model)

The authoritative training program lives in the program book (`The_Giant_Program_v7_Book`,
kept in the separate documentation folder — **not** part of the code repo). Summary of what
the app encodes:

### 2.1 Primary lifts (4)
Deadlift, Overhead Press (OHP), Back Squat, Weighted Ring Dips. (Barbell bench and barbell rows
are retired — dips replaced bench. The power-clean block, once on dips day, has also been removed.)

### 2.2 Strength day structure (ordered blocks)
```
Warm-Up → Giant Block → Volume Block → Carry → Cooldown
```
- **Warm-Up:** GOWOD Activate flow (external app) + barbell build-up sets (8-5-3-2 @ ~40/55/70/85% of Giant Block Set 1).
- **Giant Block:** 4-round circuit — main lift + secondary + core + 30s cardio. 2 min rest between rounds.
  Adherence is logged once per session via a completion control (see §2.10).
- **Volume Block:** 2 sets at 80% of top set; reps by difficulty.
- **Carry:** loaded carry, ~10 min, treated as accessory/reward effort (RPE ~6, never pushed).
- **Cooldown:** GOWOD cooldown flow.

### 2.3 Secondary movement / core by day
("Secondary," not "antagonist" — the lower-day movements aren't strict antagonists.)
| Day | Secondary | Core |
|-----|-----------|------|
| Deadlift | Reverse Lunge — 8 / leg | Ab Rollout |
| OHP | One-Arm DB Row — 10 / arm (constant) | GHD Abs |
| Squat | B-Stance (kickstand) DB RDL — 8 / leg | Strict Toes-to-Bar |
| Dips | Pull-ups (cluster, §4) | GHD Back Extension |

The DL Reverse Lunge, OHP row, and Squat RDL carry a **recorded** per-cycle weight (Setup, like
carries — not engine-cascaded). Pull-ups (dips day) are bodyweight.

### 2.4 Difficulty rep schemes (Giant Block: 4 sets, descending)
Reps differentiate the days; the **load ladder is uniform** across all days (single-anchor
model, §3) — each set is 85 / 90 / 95 / 100% of that day's top. *(Supersedes the earlier
per-difficulty percentages 75/82/90, 72/80/88, 70/78/86.)*

| Difficulty | Set 1 | Set 2 | Set 3 | Set 4 | Volume |
|-----------|-------|-------|-------|-------|--------|
| Hard | 8 @ 85% | 6 @ 90% | 4 @ 95% | 2 @ 100% | 2×6 @ 80% |
| Medium | 9 @ 85% | 7 @ 90% | 5 @ 95% | 3 @ 100% | 2×8 @ 80% |
| Light | 10 @ 85% | 8 @ 90% | 6 @ 95% | 4 @ 100% | 2×10 @ 80% |

Set percentages are of that day's top (Set 4 = 100%). The day tops themselves come from the
Hard anchor (Medium = 95%, Light = 90% of the Hard top — §3). Round to nearest 2.5 kg.

### 2.5 The 13-week macrocycle *(restructured 2026-07-15; supersedes the 15-week shape)*
- Weeks 1–12: three 4-week mesocycles (C1, C2, C3), H/M/L rotation.
- Week 13: end-of-macro deload — **extendable to a second identical deload week**
  by the athlete, decided *during* the deload, never pre-planned (per-macro
  `deload_extended` flag → a 14-week macro).
- The old testing block (former weeks 13–14) is **removed from the schedule**;
  see §2.7 for what remains of it. Legacy macros that lived their testing weeks
  keep rendering them (the engine is weeks-driven — §6).

### 2.6 Lift rotation — LEGACY Giant (pre-cutover dates only)
4 lifts across 3 weekly slots (Mon=Hard, Wed=Medium, Fri=Light):
| Week | Mon (Hard) | Wed (Medium) | Fri (Light) |
|------|-----------|--------------|-------------|
| W1 | Deadlift | OHP | Squat |
| W2 | Dips | Deadlift | OHP |
| W3 | Squat | Dips | Deadlift |
| W4 | OHP | Squat | Dips |

### 2.6b Lift rotation — GiantFit (dates on/after the 2026-07-27 cutover)
Bench replaces dips; same slot difficulties and 4-week realignment:
| Week | Mon (Hard) | Wed (Medium) | Fri (Light) |
|------|-----------|--------------|-------------|
| W1 | Deadlift* | OHP | Squat |
| W2 | Bench | Deadlift | OHP |
| W3 | Squat | Bench | Deadlift |
| W4 | OHP | Squat | Bench |

\* **C1 opening override:** in cycle C1 only, W1 Day 1 runs **Medium** instead of Hard —
the lift stays deadlift, only the difficulty drops, so deadlift intentionally has no Hard
day in C1 (M/M/L). C2 and C3 follow the normal slot difficulties.

**Session pairings** (`GIANTFIT_PAIRING`, consumed by the Phase 3 views): Deadlift + DB Row ·
OHP + DB Row · Squat alone · Bench + Pendlay Row.

**Capacity variant alternation:** each scheduled Mon/Wed/Fri strength slot since the cutover
gets an index (Mon=0/Wed=1/Fri=2 per week); even index = variant A, odd = B. Scheduled slots —
not completed sessions — drive it, so missed or backfilled days never desync the alternation.

**No skill days:** post-cutover off-days are plain rest (Tue/Thu/Sat remain Giant Run days, Sun rest).

### 2.7 Testing weeks — LEGACY (removed from the schedule 2026-07-15)

**No longer part of the macro.** Strength testing was dropped with the 13-week
restructure; the running 5k time trial moved to the deload week's Saturday (§13).
Everything below is kept because legacy macros (stored `weeks = 15`) lived these
weeks and their logged results stay renderable/exportable — the components,
`testing_results` table, and Data-page entries are dormant, not deleted.
- **Mon & Fri = test sessions:** Warm-Up → Giant Block (hard rep scheme) → Volume Block (normal) → **no carry**.
- **Wed = optional light/recovery day** (blank placeholder; keep easy or skip).
- Test results are **recorded, not prescribed** — no pre-set target; discover the clean 2–3RM with 1 rep in reserve and log it.
- Test days (Today tab AND the Calendar's test-cell modal — one shared view) render the **full
  session computed off the C3 Hard anchor** like a normal hard day (build-up, ladder sets 1–3, 80%
  volume); Set 4 is the open recording field with guidance only: anything from the C3 top upward at
  1 RIR is valid, ceiling ~+5% (`testCeiling`), no grinders.
- Test days also log **deload-signal data** like any session: test-attempt RPE + bar speed, the
  giant-block completion control ("prescribed" = ramp sets 1–3 + a recorded attempt), and volume
  completion. These save to a **companion sessions row** (`weekType 'testing'`, id
  `{date}-{lift}-TEST`) alongside the `testing_results` record — same fields/mechanism as normal
  sessions, so `computeWeekSignals` needs no special casing (§5).

### 2.8 End-of-macro deload (the final week; week 13, or 13–14 when extended)
- **Fixed layout: Mon = Deadlift, Wed = OHP, Fri = Dips** (NOT the normal rotation).
- Squat deliberately omitted (avoid two heavy lower-body sessions late in the macro).
- Each session: Giant Block only at 50–60%, hard rep scheme, no volume, no carries. Skill days kept.
- **Extension:** the athlete can add one identical second deload week from the
  deload-week view ("Extend deload one week", confirm-gated, undoable). Runs: Tue/Thu
  optional short easy; the **first** deload Saturday is the 5k time trial (§13); an
  extended second week's Saturday is optional easy — the TT happens once.

### 2.9 Carry loads (per day, accessory effort)
Deadlift = Farmer's 60kg/hand · OHP = Overhead 2×20kg · Squat = Sandbag bear hug 68kg · Dips = Suitcase 50kg/hand. Progression: once per mesocycle, position before load, distance before weight. **Carries are reward/accessory work — kept around RPE 6, never pushed to a fourth hard effort.** (Stored per cycle keyed by day — `carry_<day>` — so reassigning the implement doesn't move the key.)

### 2.10 Giant-block completion (adherence)
The top set keeps full RPE + bar-speed logging; the rest of the block is captured by a single
**completion control** — default "completed as prescribed," or a categorical reason (failed-too-heavy,
stopped-fatigue, stopped-form, reduced-weight-mid-block, cut-short-time). Stored categorically
(`sessions.block_completion`) so it's trendable and drives a deload signal (§5, S6). Per-round cardio
calories and the Volume block keep their own separate logging.

---

## 3. Working weights — PER CYCLE, from a single Hard anchor (critical data-model point)

Working weights progress across the macro, so each mesocycle (C1/C2/C3) has its own loads.
**Only one number is entered per lift per cycle: the Hard top set (the anchor).** Everything
else computes off it:
- **Day tops:** Hard = the anchor (100%), Medium = anchor × 0.95, Light = anchor × 0.90.
- **Giant Block sets:** 85 / 90 / 95 / 100% of that day's top (uniform ladder — §2.4).
- **Volume:** 80% of that day's top.
- Derived loads round at the uniform **2.5 kg** (`DEFAULT_INCREMENT` — all GiantFit anchor lifts
  are barbell moves; the Giant-era 0.5 kg dips/pull-up increment is retired). The **anchor itself
  is never rounded** — user input stays exactly as entered.
- **GiantFit anchors (2026-07-23): DL / OHP / Squat / Bench** (`ANCHOR_LIFTS`). Setup shows and
  writes only these; legacy `dips`/`pullup` anchor rows still load so old sessions render, but are
  never written again and are not carried forward by "start next macro".

**Two-mode dips & pull-ups — LEGACY (retired from Setup + new-session logic 2026-07-23):**
decided purely by the cycle's anchor (0/empty = bodyweight cluster mode with 10/8/6 targets and
`dips_cluster`/`pullup_cluster` logging; any weight = the full cascade, formerly at 0.5 kg).
Kept only as a render path (`liftMode`) so pre-GiantFit dips-day sessions keep displaying in
History / the Calendar modal / copy-summaries — computed ladders in those views now round at 2.5 kg.

A logged session reads its own **(macro, cycle)** anchor and recomputes — essential for correct
retroactive logging (the bug that motivated the rebuild: a C1 session must not use C3's heavier
loads). The anchor is editable any time, up or down; the whole cascade recomputes live
everywhere, and **only the anchor is stored** (the computed grid is never persisted, so nothing
goes stale). Solved relationally — see §9.

- Main lifts (DL/OHP/Squat/Dips) all use the **identical** added-weight cascade off their Hard anchor.
- **Dips** use the same cascade today; because the added load is small, sets/days may round to
  near-identical kg — expected (the rep scheme differentiates the days; real load differentiation
  emerges as the added weight grows). A future option may compute dips off **bodyweight + added
  load**; the engine keeps a per-lift seam (`dayTop(..., lift)`) so this drops in without a rebuild.
- Carries + the recorded secondaries (Reverse Lunge DL, B-stance RDL Squat, one-arm row OHP): per-cycle, a single controllable weight each (not part of the anchor cascade).
- **Start-of-macro rule:** a new macro's C1 anchor = the previous macro's C3 anchor (not testing weights).

---

## 4. Pull-ups — a two-phase lift

Pull-ups don't fit the weights model in their first phase.
- **Phase 1 (bodyweight, chasing unbroken):** progress measured by the **cluster shape on the final Giant Block round**, not load. Target reps per round: Hard 10, Medium 8, Light 6. Log the final-round cluster, e.g. `6+4` → `7+3` → `8+2` → `10`, tracked as a trend tightening toward unbroken. (Log final-set cluster only, not all four rounds.)
- **Phase 2 (weighted):** once consistently unbroken at the target, set a pull-up anchor in Setup —
  pull-ups then run the full standard cascade (day spread + ladder + descending day reps, 0.5 kg
  rounding) like a primary lift. *(Supersedes the earlier "reps fix at 6/8/10" note.)*

**Status:** both phases are built (§3 two-mode) — pull-ups are the **dips-day** Giant Block
secondary; the mode flips purely on the per-cycle anchor (0 = phase 1, weight = phase 2).

---

## 5. The reactive deload rule (current, revised version)

An honest fatigue ego-check. Watches objective signals across a training week. **This revised
rule supersedes the version in the v7 program book.**

**Signals (auto-detected):**
- **S1** — any day, top set logged at **R9.5+** (past the intended ceiling on any difficulty).
- **S6** — **giant block not completed as prescribed** (any non-"completed" state of the completion control, §2.10).
- **S2** — volume block incomplete (cut reps / dropped set).
- **S3** — carry skipped due to **fatigue** (not schedule).
- **S5** — bar speed ↓ on the top set in **2+ sessions** within the week (any lifts).
- *(S4 — Set 1 > R7 — retired; the logger captures only the top set, and the new S6 covers in-block breakdown categorically.)*

**Trigger:** fires when there are **3+ total signal occurrences spanning at least 2 different
sessions** in the week. (Three occurrences = severity; two sessions = it's a pattern, not one
bad day. One catastrophic single day never fires it.)

**Testing weeks (W13–14):** signals from test sessions are captured and shown in the Deload tab
(as `W13/W14 · Testing` buckets), but the reactive recommendation **never fires** there — the
scheduled W15 deload is already next. This is structural: the recommendation only renders on
training-week session days, and test rows (null cycle/week) can't enter its week filter.

**Behaviour:** the rule **advises, the athlete decides** — it recommends a deload via a confirm
prompt; the athlete taps Apply. Never auto-forced.

**Deload week (when applied):** Giant Block only at ~70%, hard scheme; no volume; light/no
carries; skill days kept.

**Repeat rule:** if two weeks in one mesocycle trigger it, the next cycle repeats the same
weights instead of progressing.

**Cap & exemption:** max one reactive deload per mesocycle; doesn't fire if a scheduled break
(holiday) is already coming the following week.

---

## 6. The date engine (preserve this logic exactly)

Position is **computed strictly from the macro start date — never set manually.** This is a firm
design decision: miss a session, you rejoin where the calendar says. The structure is sacred; the
program is built to absorb gaps via deload indicators, repeat-cycle rules, and manual weight
adjustment on return.

**Anchor:** Macro 2 started **Monday 13 April 2026**. Macro = 13 weeks (14 when the
deload is extended; legacy macros stored as 15). A new macro rolls forward by the
completed macro's total weeks and carries C3 weights into the new C1.

**Computation (verified correct; WEEKS-DRIVEN since the 13-week restructure —
every engine entry point takes the macro's `{ weeks, deloadExtended }`):**
```
daysSinceStart = floor((today - mondayOf(startDate)) / 1 day)
weekIndex = floor(daysSinceStart / 7)        // 0-based internally; ALWAYS display 1-based
totalWeeks = weeks + (deloadExtended ? 1 : 0)
weekType:  0-11 = training (always)
           weekIndex >= weeks-1 = deload (the final week, + the extension week)
           12..weeks-2 = testing  // legacy gap — exists only when weeks = 15
meso (training only) = floor(weekIndex / 4) + 1   // 1..3
weekInMeso = (weekIndex % 4) + 1                   // 1..4
session days = Mon (hard), Wed (medium), Fri (light)
dayType = ROTATION[weekInMeso-1][difficulty]
```
- **GiantFit cutover (per DATE, not per macro):** days on/after `GIANTFIT_START_DATE`
  (2026-07-27) use `GIANTFIT_ROTATION` (§2.6b), apply the C1W1D1 Medium-deadlift override,
  and stamp `giantfit: true` + `capacityVariant` (A/B by scheduled-slot index since the
  cutover) on the Position; earlier days use the legacy `ROTATION` untouched. No stored
  rows are migrated — rendering old dates always reproduces the lived schedule.
- Legacy testing weeks: Mon/Fri = test, Wed = optional light (`testRole` field distinguishes) —
  reachable only via weeks=15 macros (all pre-cutover); GiantFit macros never compute one.
- Local date (Brașov, Romania timezone) — compute "today" locally, never UTC, to avoid date-boundary bugs.
- Non-session days show the next scheduled session ("Skill day / Rest" pre-cutover; plain
  "Rest Day" post-cutover — GiantFit has no skill days).
- Before start → "upcoming"; past the macro's total weeks → "macro complete, start next macro."

**Important implementation note:** an early version caused infinite recursion because
`computePosition` and `nextSessionFrom` called each other. The fix was to extract a `corePosition`
helper that never computes the next session, and have both callers use it. Preserve that
separation. (Lives in `src/engine/date-engine.ts`; known-correct outputs are unit-tested —
13 Apr 2026 → M2 C1 W1 DL Hard; 22 Jun 2026 → M2 C3 W3 Squat Hard; and GiantFit:
27 Jul 2026 → M3 C1 W1 DL **Medium** variant A; 3 Aug 2026 → Bench Hard variant B.)

---

## 7. The calendar view (Option A)

A **program-structured grid** (NOT a literal month calendar): one row per program week
(13; 14 when the deload is extended; legacy macros 15), each
with 3 cells (Mon/Wed/Fri columns). Each cell shows:
- The real calendar date (past, today, and future all dated).
- Lift + difficulty (or "Test" / "Light optional" / "Deload").
- State by colour: logged / missed / today / upcoming / break.
- Top set once logged.

Tapping a cell opens a **full logging modal** (same fields as live logging) to log, edit, delete,
or **mark the day as a break** (day-level granularity — breaks can straddle weeks). Calendar
auto-scrolls to the current week on open. Break days are exempt from "missed" status and from
deload signals.

---

## 8. Current state

The full rebuild is shipped and deployed to GitHub Pages
(https://zsolt17.github.io/giant-programV2/). Everything that was once "planned" is now built;
see `specification.md` for the dated build history and `CONVENTIONS.md` for how it's structured.
Capabilities, in domain terms:

- **Today** — date-computed position; full session prescription (warm-up, Giant Block, volume,
  carry) + logging, with an optional session timer.
- **Calendar** — the 15-week × Mon/Wed/Fri grid (§7); log/edit/delete any session; mark breaks.
- **History** — latest top sets, recent-session feed, pull-up cluster trend, testing results.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (§5).
- **Setup** — per-cycle (C1/C2/C3) Hard-top anchors + recorded accessories/carries (§3), macro anchor,
  macro picker, and "start next macro" archiving (carries C3→C1).
- **Per-cycle working weights** — the motivating fix; a session reads its own `(macro, cycle)` grid.
- **Pull-up cluster logging** (§4, phase 1) + trend.
- **Testing-session logger** (§2.7) — record 2–3RM results per lift, editable like other sessions.
- **Multi-macro archiving** — roll into a new macro carrying C3 weights forward; prior macros stay viewable.
- **Data export / share** — download all sessions (every macro) as CSV, and copy a plain-text
  per-session summary to the clipboard for pasting into a coaching conversation.
- **Recovery → Tendon Health** (§12) — joint isometric-loading protocols with phase-based dosing,
  per-tendon hold timers, and light per-day "done" logging. Macro-independent.
- **The Giant Run** (§13) — Tue/Thu/Sat companion running program: date-computed schedule,
  two-mode pace engine off a per-macro reference pace, per-cycle distance targets, run
  logging (Today + Calendar run row), pooled deload signals, Data/CSV/Trends coverage.
- **Single-user auth** (Supabase + Row Level Security), installable PWA with offline logging.

Deferred: pull-up **phase-2 weighted** switchover (§4) — waiting until the athlete is consistently
unbroken at target.

---

## 9. Supabase schema (implemented)

Single-user app, but it uses Supabase Auth + Row Level Security so the data is private to the one
account. Canonical schema lives in `supabase/migrations/` (`0001_init.sql`;
`0002_session_timer.sql` adds `started_at`/`ended_at`; `0003_hardening.sql` adds the
log-field CHECK constraints, the idempotent `testing_results` key, and FK/date indexes;
`0004_session_extra_logging.sql` adds `clean_rounds`, `cardio_cals int[]` (per-round Giant
Block cardio cals), `carry_rounds`, `carry_distance`; `0005_anchor_weights.sql` drops
`working_weights.medium`/`light` for the single-anchor model — §3; `0006_remove_cleans.sql` drops the
`sessions.clean_*` columns and retires the `clean` accessory item, adding `rdl_deadlift`/`row_ohp`;
`0007_program_revision.sql` reassigns secondaries (`rdl_deadlift`→`rdl_squat`, adds `lunge_deadlift`)
and adds `sessions.block_completion`; `0008_recovery.sql` adds the Recovery tables — §12; `0009_dips_pullup_modes.sql` adds the
`pullup` anchor lift + `sessions.dips_cluster` for the two-mode logic — §3; `0010_giant_run.sql` adds
`macros.ref_pace_s` + the `runs` and `run_targets` tables — §13; `0011_run_terrain.sql` adds
`runs.terrain` — §13; `0012_run_bulletproof.sql` adds `runs.bulletproof` — §13;
`0013_macro_13_weeks.sql` adds `macros.deload_extended` + defaults `weeks` to 13 — §2.5;
`0014_giantfit_phase1.sql` adds `bench` to the `working_weights` lift CHECK and the three
GiantFit capacity tables below).
See `supabase/MIGRATIONS.md` for how migrations are applied and the DB kept reproducible.
Tables:

```sql
-- Macros: each macrocycle the athlete runs
macros (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  number        int not null,              -- M1, M2, M3...
  start_date    date not null,             -- anchored to a Monday
  weeks         int not null default 13,   -- 12 training + 1 deload; legacy macros store 15 (lived testing weeks)
  status        text not null default 'active',  -- active | completed
  ref_pace_s    int,                       -- Giant Run reference pace P (s/km); NULL = talk-test mode (§13)
  deload_extended boolean default false,   -- athlete added a second identical deload week (§2.8)
  created_at    timestamptz default now()
)

-- Per-cycle Hard top set (the ANCHOR) for the main lifts. Medium/Light day tops and
-- the within-day Giant Block ladder are COMPUTED in the engine (§3), never stored.
-- (0005 dropped the old medium/light columns.)
working_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,              -- 1, 2, 3
  lift          text not null,             -- deadlift | ohp | squat | bench (GiantFit)
                                           --   | dips | pullup (DEPRECATED Giant-era — read-only legacy)
  hard          numeric,                   -- the Hard top set (anchor); everything cascades off it
  unique (macro_id, cycle, lift)
)

-- Per-cycle single-value recorded loads: the RDL/row antagonists and each carry
accessory_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,
  item          text not null,             -- lunge_deadlift | rdl_squat | row_ohp | carry_deadlift | carry_ohp | carry_squat | carry_dips
  weight        numeric,                    -- recorded per-cycle weight (secondaries + carries); not engine-cascaded
  unique (macro_id, cycle, item)
)

-- Testing-week recorded results (filled after the fact, not prescribed)
testing_results (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  lift          text not null,
  weight        numeric,
  reps          int,
  notes         text,
  tested_on     date
)

-- Every logged session (training, testing, or deload)
sessions (
  id            text primary key,          -- e.g. "2026-06-22-squat-H" (date+lift+difficulty)
  macro_id      uuid references macros not null,
  date          date not null,             -- the SCHEDULED slot date (not necessarily the physical day)
  cycle         int,                       -- null for testing/deload weeks
  week          int,                       -- week within meso (1..4), null for special weeks
  week_type     text not null,             -- training | testing | deload
  day_type      text,                      -- deadlift | ohp | squat | dips (null for testing/light)
  difficulty    text,                      -- hard | medium | light
  -- top set
  top_reps      int,
  top_weight    numeric,
  rpe           text,                      -- "R7".."R10"
  bar_speed     text,                      -- up | normal | down
  -- Giant Block per-round cardio calories, ordered [R1..R4] (e.g. {15,14,15,15})
  cardio_cals   int[],
  -- Giant Block adherence (categorical): completed | failed_heavy | stopped_fatigue |
  -- stopped_form | reduced_weight | cut_time. Null on legacy rows = treated as completed.
  block_completion text,
  -- volume
  vol_done      boolean default true,
  vol_rpe       text,
  vol_speed     text,
  -- bodyweight-mode final-round clusters (dips day) e.g. "6+4"
  pullup_cluster text,
  dips_cluster  text,
  -- carry
  carry_skipped boolean default false,
  carry_skip_reason text,                  -- fatigue | schedule
  carry_rounds  int default 3,             -- carry rounds completed
  carry_distance numeric,                  -- metres per round ("distance before weight")
  carry_rpe     text,
  -- session timer (timestamps; duration is always derived, never stored)
  started_at    timestamptz,
  ended_at      timestamptz,
  -- meta
  notes         text,
  updated_at    timestamptz default now()
)

-- Confirmed reactive deloads (one row per week the athlete applied a deload)
deloads (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  week_key      text not null,             -- "M2C3W4"
  applied_at    timestamptz default now(),
  unique (macro_id, week_key)
)

-- Break days (day-level, exempt from missed + deload signals)
break_days (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  date          date not null,
  unique (user_id, date)
)

-- Recovery > Tendon Health: one isometric-loading protocol per joint (0008).
-- Macro-INDEPENDENT (user-scoped, not macro-scoped). One active per user.
recovery_protocols (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null default auth.uid(),
  joint          text not null,             -- wrist | elbow | shoulder | knee | ankle
  start_date     date not null default current_date,
  phase_override text,                       -- acute | build | maintenance (null = auto)
  status         text not null default 'active',  -- active | completed
  closed_early   boolean not null default false,
  end_date       date,
  created_at     timestamptz not null default now()
)
-- partial unique index: one active protocol per user
--   create unique index ... on recovery_protocols (user_id) where status = 'active';

-- Light per-tendon daily log — the row's existence is the "done" signal (no detail).
recovery_tendon_logs (
  id            uuid primary key default gen_random_uuid(),
  protocol_id   uuid references recovery_protocols on delete cascade not null,
  tendon_key    text not null,
  log_date      date not null default current_date,
  unique (protocol_id, tendon_key, log_date)
)

-- The Giant Run (§13): one row per logged run. Pace is always DERIVED
-- (duration_s / distance_km), never stored.
runs (
  id            text primary key,          -- "2026-07-14-run-E" (date + run-type letter)
  macro_id      uuid references macros not null,
  date          date not null,             -- the SCHEDULED slot date (strict-date model)
  cycle         int,                       -- null for testing/deload weeks
  week          int,                       -- week within meso (1..4), null for special weeks
  week_type     text not null,             -- training | testing | deload
  run_type      text not null,             -- easy | quality | long | tt
  distance_km   numeric,
  duration_s    int,
  avg_hr        int,
  completion    text,                      -- completed | cut_fatigue | cut_schedule | felt_heavy (null = completed)
  terrain       text default 'road',       -- road | trail (null = road; trail excluded from pace readouts)
  bulletproof   boolean default false,     -- post-run Bulletproof circuit done (habit boolean; null = false)
  notes         text,
  updated_at    timestamptz default now()
)

-- Per-cycle run distance targets (guidance; accessory-weights pattern — §13)
run_targets (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,              -- 1, 2, 3
  run_type      text not null,             -- easy | quality | long (the weekday slot)
  km            numeric,
  unique (macro_id, cycle, run_type)
)

-- GiantFit capacity block (0014). Movement DEFINITIONS (names, order, which are
-- loaded, defaults) are static app content in engine/capacity.ts — only the
-- user's editable numbers are stored; app defaults are merged on read.
capacity_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  variant       text not null,             -- A | B
  movement_key  text not null,             -- e.g. db_snatch, bb_clean (app-defined)
  rep_target    int,                       -- null = the movement's app default
  weight        numeric,                   -- kg; loaded movements only
  unique (user_id, variant, movement_key)
)

-- Shared capacity settings — one row per user
capacity_settings (
  user_id  uuid primary key references auth.users default auth.uid(),
  rounds   int not null default 3          -- 3 | 4
)

-- One capacity-block result per session (upsert on session_id; cascade-deletes
-- with the session). RLS transitive via session -> macro. No UI until Phase 3.
capacity_logs (
  id                  uuid primary key default gen_random_uuid(),
  session_id          text references sessions on delete cascade not null,
  variant             text not null,       -- A | B
  rounds_completed    int,
  total_time_seconds  int,
  calories            int,                 -- nullable; from the Bike movement (variant B)
  rpe                 text,                -- R6..R10 scale (same CHECK as sessions)
  notes               text,
  updated_at          timestamptz default now(),
  unique (session_id)
)
```

Notes:
- The `sessions.id` keeps the human-readable `date-lift-difficulty` scheme so it's stable and idempotent (upsert on log).
- `working_weights` + `accessory_weights` solve the per-cycle problem relationally — a session reads weights for its own `(macro, cycle)`.
- The data layer stays behind one module so the UI never talks to Supabase directly (see `CONVENTIONS.md` §1, §3).

---

## 10. Architecture in brief

The app is split so only the data layer touches the backend — the engine is pure domain logic,
the UI is presentational, and Supabase is swappable in one place. The full structure, stack,
naming, design system, and testing rules live in **`CONVENTIONS.md`** (the "how" doc) and are not
repeated here. The two load-bearing domain invariants to preserve, wherever the code moves:

- **Only the data layer (`src/data/`) touches Supabase.** Everything else works with plain app
  objects. This is what makes a backend swap a single-module change.
- **The date engine is computed, never manual** (§6), and its `corePosition` split must stay.

**Design identity (don't relitigate):** navy `#2E4057` / dark `#1a2535` / gold `#C9A84C`;
"Bebas Neue" headings, "DM Sans" body. State colours: logged green `#8ddcb0`, missed red
`#e88888`, today gold, break blue. (Token table in `CONVENTIONS.md` §6.)

---

## 11. Decisions log (settled — don't relitigate)

- **GiantFit Phase 2 (2026-07-23):** the era is decided **per date** by a single config
  cutover (`GIANTFIT_START_DATE`, a Monday) — never by migrating rows or flagging macros.
  GiantFit rotation = Giant's structure with Bench in the dips slots; each macro opens on a
  Medium deadlift (C1W1D1 override — difficulty only, C2/C3 untouched, DL has no Hard day
  in C1); capacity variants alternate by **scheduled** strength-slot parity since the
  cutover (immune to missed/edited days); skill days removed post-cutover; pairings
  DL+DB Row / OHP+DB Row / Squat alone / Bench+Pendlay Row.
- **GiantFit Phase 1 (2026-07-23):** the successor program's data model lands first —
  anchors become DL/OHP/Squat/**Bench**; the dips + pull-up anchors, the two-mode
  engine, and the 0.5 kg rounding increment are retired (deprecate, never delete —
  legacy rows/rendering stay); capacity config is relational (`capacity_config` +
  `capacity_settings`, app-side movement definitions with defaults merged on read)
  and capacity results log one-per-session (`capacity_logs`). Rotation/session
  types/deload/Trends migrate in later phases; Giant Run + Recovery are untouched
  throughout.
- **13-week macro (2026-07-15):** testing weeks removed from the schedule; the deload
  is the final week, athlete-extendable by one identical week (decided during the
  deload, never pre-planned); the 5k TT moved to the first deload Saturday. The
  engine is **weeks-driven** (reads `macros.weeks` + `deload_extended`): legacy
  15-week macros keep their lived testing weeks renderable — dormant, not deleted
  (components, `testing_results`, history all intact).
- Position is date-computed, never manual. Firm.
- **Working weights = a single Hard-top anchor per lift per cycle.** Medium (×0.95) / Light
  (×0.90) day tops, the uniform 85/90/95/100 Giant Block ladder, and 80% volume all compute off
  it (rounded 2.5 kg); only the anchor is stored. Supersedes the per-difficulty percentages (§2.4)
  and the hand-tuned independent H/M/L values. All four lifts — including dips — use the identical
  added-weight cascade (a dips-off-bodyweight path is deferred, with an engine seam left for it).
- Strict-date model: missed sessions stay missed; you rejoin at the calendar's position. No flexible "attach a late session to an earlier slot" logic — you just edit the scheduled slot in the calendar.
- Stored session `date` = the scheduled slot date, not the physical lift day.
- **Giant Block secondaries (finalized 2026-06-30):** DL = Reverse Lunge (8/leg), OHP = one-arm DB row
  (10/arm), Squat = B-stance DB RDL (8/leg), Dips = pull-ups (cluster, §4). Called "secondary," not
  "antagonist." All three weighted secondaries carry a **recorded** per-cycle weight (Setup, like
  carries); pull-ups are bodyweight. *(Superseded & removed across this + the prior revision: Sørensen
  hold, ring rows, Copenhagen plank, leg-raise core, and the power-clean block.)*
- **Carries reassigned — FINAL (2026-07-02):** DL = farmer 60/hand, OHP = overhead 2×20, Squat =
  sandbag bear hug 68, Dips = suitcase 50/hand. *(Supersedes the 2026-06-30 assignment.)* Stored per
  cycle keyed by day (`carry_<day>`), so the keys are stable; logged history untouched.
- **Giant-block completion (2026-06-30):** adherence logged as one categorical control (§2.10), driving
  deload signal S6. S4 (Set-1 > R7) retired.
- **Per-lift rounding + two-mode dips/pull-ups (2026-07-05):** derived loads round 2.5 kg (barbell) /
  0.5 kg (dips, pull-ups); the anchor is never rounded. Dips and pull-ups flip between bodyweight
  (cluster) and weighted (full cascade) purely on the cycle's anchor value (§3) — no toggle.
- **The Giant Run (2026-07-12, settled):** one run anchor per macro — the reference pace P,
  never rounded (derived paces round to 5 s/km); two-mode on the anchor like dips/pull-ups
  (null = talk-test, the mesocycle-1 state). Distance targets follow the accessory model
  (recorded per cycle, seeded forward — guidance, not prescription). The TT confirm updates
  the **current** macro's P and rolls forward with the macro (C3→C1 mechanism). Run deload
  signals pool with the lift signals under the unchanged weekly trigger; R3 (pace-at-HR)
  compares against the most recent prior same-type run (≥10 s/km slower at same-or-higher HR)
  and is skipped without HR data. Optional run days are never marked missed.
- Push press: rejected. Sandbag lunges: parked (maybe later, via carry-block rotation).
- GOWOD handles warm-up activation + cooldown; barbell build-up sets stay in-app.
- Carries are accessory/reward effort, ~RPE 6, never pushed.
- Reactive deload: advise-and-confirm, never auto-forced; revised signal rule (§5) supersedes the v7 book.
- Testing weights: recorded, not prescribed.
- Keep the navy/gold design identity.
- Backend is Supabase + RLS (replaced the original Google Sheets / Apps Script backend).

---

## 12. Recovery — Tendon Health

A separate tool (not part of the training program above), reached from the burger drawer (ordered
**first**). It is **macro-independent** — works with no active macro, owned directly by `user_id`.

- **Protocol:** pick a joint (wrist / elbow / shoulder / knee / ankle) + a start date → one **active**
  protocol. Only one active per user (DB partial unique index, §9). Closing it (confirm step) sets
  `status = completed`, `closed_early`, `end_date`, and re-opens the joint picker. No history UI in v1.
- **Phase (hybrid):** auto-suggested from local days-since-start — Acute (0–20) / Build (21–56) /
  Maintenance (57+) — shown in a segmented control. Tapping a non-suggested segment sets
  `phase_override`; tapping the suggested one clears it (back to auto). Only the **frequency** changes
  by phase (`PHASE_DOSE`); hold (30s) and set count (3) are fixed.
- **Content:** static in `engine/recovery-content.ts` — joints → tendons → one fixed exercise each,
  with an inline 64×64 SVG position diagram. Phase/day math is local-date (`engine/recovery.ts`),
  consistent with the date engine (§6).
- **Timer + logging:** each tendon has a 30s hold timer (countdown ring, manual set advance to 3/3,
  screen wake-lock while holding). Logging is deliberately light — one `recovery_tendon_logs` row per
  (tendon, day); the row's existence is the "done" signal (no set/rep detail). Completing 3/3 auto-logs
  done; the per-tendon checkbox also toggles it manually.

## 13. The Giant Run — companion running program

Three runs a week on the lift off-days, fully integrated (date engine, calendar,
logging, deload signals, data export). Engine: `src/engine/runs.ts`.

- **Schedule (strict-date, from the same macro anchor):** Tue = Easy · Thu = Quality
  (**Easy during mesocycle 1**) · Sat = Long easy. Deload week(s): Tue/Thu optional
  short easy; the **first deload Saturday = the 5k time trial** (prescribed — the
  macro's measurement); an extended second week's Saturday is optional easy. Legacy
  testing weeks (15-week macros) keep their old TT-Saturday rendering. Runs are
  computed via `corePosition` — never positioned manually.
- **One anchor per macro: the reference pace P** (stored `macros.ref_pace_s`,
  seconds/km; entered/edited in Setup as min:sec). **Two-mode**, same pattern as
  dips/pull-ups: no anchor → **talk-test mode** (type + distance only, no paces — the
  mesocycle-1 state); anchor set → **pace mode**: Easy = P + 75 s/km, Quality =
  P + 15…P + 40 s/km (a range), time trial = no prescribed pace. Derived paces round
  to 5 s/km; **P itself is never rounded**. Constants live in `engine/constants.ts`.
- **Distance targets = the accessory model** (guidance, not prescription):
  per-cycle editable km per weekday slot (`run_targets`), seeded forward from the
  previous cycle in Setup; the log records actual distance independently.
- **Logging:** distance (km) + duration (min:sec) → **pace always derived, never
  stored**; optional avg HR; categorical completion (Completed ✓ default / cut
  short – fatigue / cut short – schedule / felt heavy – talk test failed);
  **terrain toggle** (Road default / Trail); notes.
  One `runs` row per day, human-readable id `{date}-run-{E|Q|L|T}`, idempotent
  upsert, offline-queued like sessions. Editable/deletable retroactively from the
  Calendar's run modal.
- **Time trial → P:** after saving the TT, an **explicit confirm chip** offers "Set
  as new reference pace P" (never silent). It updates the **current** macro's P;
  "Start next macro" carries P forward (same mechanism as C3→C1 weights), and C3
  run targets seed the new C1.
- **Calendar (Option B):** each program-week block renders two rows — the Mon/Wed/Fri
  lift row and a Tue/Thu/Sat run row beneath it (block grows vertically). Same state
  colours; break days work identically; **optional run days (testing Tue/Thu, all of
  W15) are never marked missed** — deliberate rest isn't a miss.
- **Deload signals (pooled):** R1 run cut short (fatigue), R2 felt heavy / talk test
  failed, R3 pace-at-HR degraded on 2+ runs — R3 only when avg HR is logged
  (a run is *degraded* when ≥10 s/km slower than the most recent prior same-type run
  at same-or-higher HR; week-level occurrence like S5). Lifts and runs pool into one
  weekly count; the trigger, testing-week suppression, cap and exemptions are
  unchanged (§5). A reactive-deload week collapses the run prescription to
  short-easy-only in Today + Calendar.
- **Terrain awareness (Road/Trail):** trail pace varies with terrain, not fatigue, so
  trail runs never distort pace-based readouts — the Trends pace chart **excludes
  trail by default** (a chip overlays them as hollow markers), and **R3 evaluates
  road runs only, on both sides** (a trail run is never judged degraded and never
  serves as a baseline). Guidance wording (with the descriptions in
  `constants.ts`): quality days are flat/road only, the TT is always the same flat
  route, and selecting Trail on an easy/long day appends "ignore pace — talk test
  governs; hiking steep climbs at conversational effort counts as easy running."
  Copy-summaries mark trail runs (`… → 8:20/km · Trail`); road stays unmarked.
- **Bulletproof (post-run circuit):** every run session ends with a fixed 5–10 min
  injury-prevention block (the runner's carry block) — calf raises w/ slow
  eccentric, tibialis raises, single-leg balance, seated leg raises over obstacle,
  optional plantar rolling; RPE 5–6, never hard. Content is app-side
  (`constants.BULLETPROOF_ITEMS`); logging is one done-boolean per run
  (`runs.bulletproof`) — a habit tracker, not a training log. Shown on all run
  types incl. the TT; tagged optional on deload weeks.
- **Data:** runs appear in the Data list (marked `· RUN`) with their own copy-summary
  format (incl. `Bulletproof: ✓` when done), export as a third CSV (with `terrain`,
  `bulletproof`, and a derived `pace_s_per_km` column), and get a pace-over-time
  Trends view (per run type, up = faster).

## 14. Related documents

- **`The_Giant_Program_v7_Book`** (`.pdf` / `.docx`) — the authoritative *training program*. Read
  for full domain detail. Kept in the separate documentation folder (`The Giant Program/`), **not**
  in this code repo; it's maintained for its own purpose and updated to follow app changes, not the
  other way round.
- **`CONVENTIONS.md`** — how the code is built (structure, stack, patterns, design system, testing).
- **`specification.md`** — the dated change log of what's been built.
- Historical: the app began as a monolithic single-file `index.html` on a Google Sheets / Apps
  Script backend. That's been fully superseded by the modular Vite + React + Supabase rebuild
  (preserved in git history); no longer a reference for new work.

---

*End of brief. When in doubt, favour the simplest thing that serves "a searchable history +
honest deload markers," and preserve the date-engine logic that already works.*
