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
are retired — dips replaced bench, power cleans replaced rows.)

### 2.2 Strength day structure (ordered blocks)
```
Warm-Up → [Clean Block — dips day only] → Giant Block → Volume Block → Carry → Cooldown
```
- **Warm-Up:** GOWOD Activate flow (external app) + barbell build-up sets (8-5-3-2 @ ~40/55/70/85% of Giant Block Set 1).
- **Clean Block (dips day only, done first):** power cleans 5×3, fixed weight (~70kg start), bar-speed governed.
- **Giant Block:** 4-round circuit — main lift + antagonist + core + 30s cardio. 2 min rest between rounds.
- **Volume Block:** 2 sets at 80% of top set; reps by difficulty.
- **Carry:** loaded carry, ~10 min, treated as accessory/reward effort (RPE ~6, never pushed).
- **Cooldown:** GOWOD cooldown flow.

### 2.3 Antagonist / core by day
| Day | Antagonist | Core |
|-----|-----------|------|
| Deadlift | Sørensen Hold | Ab Rollout |
| OHP | Pull-ups | GHD Abs |
| Squat | Copenhagen Plank | Leg Raises (strict toes-to-bar) |
| Dips | Ring Rows | GHD Back Extension |

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

### 2.5 The 15-week macrocycle
- Weeks 1–12: three 4-week mesocycles (C1, C2, C3), H/M/L rotation.
- Weeks 13–14: testing block.
- Week 15: end-of-macro deload.

### 2.6 Lift rotation (weeks 1–4, repeats each mesocycle)
4 lifts across 3 weekly slots (Mon=Hard, Wed=Medium, Fri=Light):
| Week | Mon (Hard) | Wed (Medium) | Fri (Light) |
|------|-----------|--------------|-------------|
| W1 | Deadlift | OHP | Squat |
| W2 | Dips | Deadlift | OHP |
| W3 | Squat | Dips | Deadlift |
| W4 | OHP | Squat | Dips |

### 2.7 Testing weeks (13–14)
- **Mon & Fri = test sessions:** Warm-Up → Giant Block (hard rep scheme) → Volume Block (normal) → **no carry**.
- **Wed = optional light/recovery day** (blank placeholder; keep easy or skip).
- Test results are **recorded, not prescribed** — no pre-set target; discover the clean 2–3RM with 1 rep in reserve and log it.

### 2.8 End-of-macro deload (week 15)
- **Fixed layout: Mon = Deadlift, Wed = OHP, Fri = Dips** (NOT the normal rotation).
- Squat deliberately omitted (post-testing fatigue; avoid two heavy lower-body sessions).
- Each session: Giant Block only at 50–60%, hard rep scheme, no volume, no carries. Skill days kept.

### 2.9 Carry loads (per day, accessory effort)
Deadlift = Farmer's 60kg/hand · OHP = Suitcase 50kg/hand · Squat = Sandbag bear hug 68kg · Dips = Overhead 2×25kg. Progression: once per mesocycle, position before load, distance before weight. **Carries are reward/accessory work — kept around RPE 6, never pushed to a fourth hard effort.**

---

## 3. Working weights — PER CYCLE, from a single Hard anchor (critical data-model point)

Working weights progress across the macro, so each mesocycle (C1/C2/C3) has its own loads.
**Only one number is entered per lift per cycle: the Hard top set (the anchor).** Everything
else computes off it:
- **Day tops:** Hard = the anchor (100%), Medium = anchor × 0.95, Light = anchor × 0.90.
- **Giant Block sets:** 85 / 90 / 95 / 100% of that day's top (uniform ladder — §2.4).
- **Volume:** 80% of that day's top.
- All loads **rounded to the nearest 2.5 kg**.

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
- Cleans and carries: per-cycle, a single controllable weight each (not part of the anchor cascade).
- **Start-of-macro rule:** a new macro's C1 anchor = the previous macro's C3 anchor (not testing weights).

---

## 4. Pull-ups — a two-phase lift

Pull-ups don't fit the weights model in their first phase.
- **Phase 1 (bodyweight, chasing unbroken):** progress measured by the **cluster shape on the final Giant Block round**, not load. Target reps per round: Hard 10, Medium 8, Light 6. Log the final-round cluster, e.g. `6+4` → `7+3` → `8+2` → `10`, tracked as a trend tightening toward unbroken. (Log final-set cluster only, not all four rounds.)
- **Phase 2 (weighted):** once consistently unbroken at the target, pull-ups become a normal weighted lift and join the per-cycle weights grid; reps fix at 6/8/10.

**Status:** phase-1 cluster logging + trend are built (OHP day). Phase-2 weighted switchover is
deferred until the athlete is consistently unbroken.

---

## 5. The reactive deload rule (current, revised version)

An honest fatigue ego-check. Watches objective signals across a training week. **This revised
rule supersedes the version in the v7 program book.**

**Signals (auto-detected):**
- **S1** — any day, top set logged at **R9.5+** (past the intended ceiling on any difficulty).
- **S2** — volume block incomplete (cut reps / dropped set).
- **S3** — carry skipped due to **fatigue** (not schedule).
- **S5** — bar speed ↓ on the top set in **2+ sessions** within the week (any lifts).
- *(S4 — Set 1 > R7 — is a notebook-only principle, NOT auto-counted, because the logger captures only the top set.)*

**Trigger:** fires when there are **3+ total signal occurrences spanning at least 2 different
sessions** in the week. (Three occurrences = severity; two sessions = it's a pattern, not one
bad day. One catastrophic single day never fires it.)

**Behaviour:** the rule **advises, the athlete decides** — it recommends a deload via a confirm
prompt; the athlete taps Apply. Never auto-forced.

**Deload week (when applied):** Giant Block only at ~70%, hard scheme; no volume; light/no
carries; clean block skipped/light; skill days kept.

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

**Anchor:** Macro 2 started **Monday 13 April 2026**. Macro = 15 weeks. A new macro rolls forward
15 weeks and carries C3 weights into the new C1.

**Computation (verified correct):**
```
daysSinceStart = floor((today - mondayOf(startDate)) / 1 day)
weekIndex = floor(daysSinceStart / 7)        // 0-based internally; ALWAYS display 1-based
weekType: weeks 0-11 = training, 12-13 = testing, 14 = deload
meso (training only) = floor(weekIndex / 4) + 1   // 1..3
weekInMeso = (weekIndex % 4) + 1                   // 1..4
session days = Mon (hard), Wed (medium), Fri (light)
dayType = ROTATION[weekInMeso-1][difficulty]
```
- Testing weeks: Mon/Fri = test, Wed = optional light (`testRole` field distinguishes).
- Local date (Brașov, Romania timezone) — compute "today" locally, never UTC, to avoid date-boundary bugs.
- Non-session days (Tue/Thu/Sat/Sun) show "Skill day / Rest" + the next scheduled session.
- Before start → "upcoming"; past week 15 → "macro complete, start next macro."

**Important implementation note:** an early version caused infinite recursion because
`computePosition` and `nextSessionFrom` called each other. The fix was to extract a `corePosition`
helper that never computes the next session, and have both callers use it. Preserve that
separation. (Lives in `src/engine/date-engine.ts`; known-correct outputs are unit-tested —
13 Apr 2026 → M2 C1 W1 DL Hard; 22 Jun 2026 → M2 C3 W3 Squat Hard.)

---

## 7. The calendar view (Option A)

A **program-structured grid** (NOT a literal month calendar): 15 rows (one per program week), each
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

- **Today** — date-computed position; full session prescription (warm-up, clean block on dips
  day, Giant Block, volume, carry) + logging, with an optional session timer.
- **Calendar** — the 15-week × Mon/Wed/Fri grid (§7); log/edit/delete any session; mark breaks.
- **History** — latest top sets, recent-session feed, pull-up cluster trend, testing results.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (§5).
- **Setup** — per-cycle (C1/C2/C3) working-weights grid + cleans/carries (§3), macro anchor,
  macro picker, and "start next macro" archiving (carries C3→C1).
- **Per-cycle working weights** — the motivating fix; a session reads its own `(macro, cycle)` grid.
- **Pull-up cluster logging** (§4, phase 1) + trend.
- **Testing-session logger** (§2.7) — record 2–3RM results per lift, editable like other sessions.
- **Multi-macro archiving** — roll into a new macro carrying C3 weights forward; prior macros stay viewable.
- **Data export / share** — download all sessions (every macro) as CSV, and copy a plain-text
  per-session summary to the clipboard for pasting into a coaching conversation.
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
`working_weights.medium`/`light` for the single-anchor model — §3).
See `supabase/MIGRATIONS.md` for how migrations are applied and the DB kept reproducible.
Tables:

```sql
-- Macros: each macrocycle the athlete runs
macros (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  number        int not null,              -- M1, M2, M3...
  start_date    date not null,             -- anchored to a Monday
  weeks         int not null default 15,
  status        text not null default 'active',  -- active | completed
  created_at    timestamptz default now()
)

-- Per-cycle Hard top set (the ANCHOR) for the main lifts. Medium/Light day tops and
-- the within-day Giant Block ladder are COMPUTED in the engine (§3), never stored.
-- (0005 dropped the old medium/light columns.)
working_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,              -- 1, 2, 3
  lift          text not null,             -- deadlift | ohp | squat | dips
  hard          numeric,                   -- the Hard top set (anchor); everything cascades off it
  unique (macro_id, cycle, lift)
)

-- Per-cycle single-value loads for cleans and each carry
accessory_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,
  item          text not null,             -- clean | carry_deadlift | carry_ohp | carry_squat | carry_dips
  weight        numeric,
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
  -- clean block (dips day)
  clean_load    numeric,
  clean_rounds  int,                       -- rounds completed (UI default 5)
  clean_speed   text,
  -- Giant Block per-round cardio calories, ordered [R1..R4] (e.g. {15,14,15,15})
  cardio_cals   int[],
  -- volume
  vol_done      boolean default true,
  vol_rpe       text,
  vol_speed     text,
  -- pull-up cluster (OHP day, phase 1) e.g. "6+4"
  pullup_cluster text,
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

- Position is date-computed, never manual. Firm.
- **Working weights = a single Hard-top anchor per lift per cycle.** Medium (×0.95) / Light
  (×0.90) day tops, the uniform 85/90/95/100 Giant Block ladder, and 80% volume all compute off
  it (rounded 2.5 kg); only the anchor is stored. Supersedes the per-difficulty percentages (§2.4)
  and the hand-tuned independent H/M/L values. All four lifts — including dips — use the identical
  added-weight cascade (a dips-off-bodyweight path is deferred, with an engine seam left for it).
- Strict-date model: missed sessions stay missed; you rejoin at the calendar's position. No flexible "attach a late session to an earlier slot" logic — you just edit the scheduled slot in the calendar.
- Stored session `date` = the scheduled slot date, not the physical lift day.
- Cleans = power cleans (not squat cleans), 5×3, fixed weight, bar-speed governed, first on dips day.
- Ring rows are the dips-day antagonist (sub-maximal, scale by body angle).
- Push press: rejected. Sandbag lunges: parked (maybe later, via carry-block rotation).
- GOWOD handles warm-up activation + cooldown; barbell build-up sets stay in-app.
- Carries are accessory/reward effort, ~RPE 6, never pushed.
- Reactive deload: advise-and-confirm, never auto-forced; revised signal rule (§5) supersedes the v7 book.
- Testing weights: recorded, not prescribed.
- Keep the navy/gold design identity.
- Backend is Supabase + RLS (replaced the original Google Sheets / Apps Script backend).

---

## 12. Related documents

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
