# The Giant Program — App Architecture & Domain Reference

**Purpose of this document:** This is the **source of truth for the domain and the *why***
behind "The Giant Program" training-log web app — which today runs **Giant 2.0** (the name
and brand stay; the program inside evolved again). It captures the full program logic,
the data model, and every design decision that's been settled — everything a developer (or a
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

> **The app implements Giant 2.0** (since 2026-08-10; the six-phase migration history is in
> `specification.md`). **GiantFit is retired from the app** — its logged data is **read-only
> History**: nothing was migrated or deleted, every old session renders exactly as it was
> lived. GiantFit itself had already retired The Giant Program v7 the same way (2026-07-23);
> v7 continues on paper only.
>
> **The cutover is a single config date — `GIANT2_START_DATE` (2026-08-10, a Monday,
> `engine/constants.ts`).** The DATE decides the era, never a flag on the data — mirroring
> exactly how the GiantFit cutover (`GIANTFIT_START_DATE`, 2026-07-27) worked before it: days
> before it schedule and render with the earlier era's logic; days on/after it use Giant 2.0.
> There is deliberately **no macro-type selector** — see the REMOVED list (§2.14).
>
> **A real consequence of "the date decides, never the macro": an in-flight GiantFit macro
> does NOT keep running GiantFit past the cutover.** Its remaining sessions render under
> Giant 2.0 rules from that date on, using *that macro's own* week/meso clock — not a fresh
> C1 W1. A clean Giant 2.0 C1 W1 requires starting a **new macro** dated `GIANT2_START_DATE`
> in Setup. The engine has no "pause this macro at the cutover" concept, by design.
>
> **Untouched subsystems** (identical across both migrations): **Giant Run** (§13) — though
> see §2.13 for a real scheduling collision Giant 2.0 introduces with it — **Recovery /
> Tendon Health** (§12), and the **session timer** (`CONVENTIONS.md` §7).

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

## 2. The training program — Giant 2.0 (domain model)

**Giant 2.0 is the current program**; this section defines it. The retired GiantFit and
Giant v7 programs are documented in `specification.md`'s dated history and (for v7) its
paper book (`The_Giant_Program_v7_Book`, separate documentation folder — **not** part of the
code repo). GiantFit rules kept below, marked **LEGACY**, exist solely so the pre-cutover
History is understandable — read-only rendering rules, never scheduling.

### 2.1 Lifts — 4 primary, 2 anchored lanes REUSED from GiantFit (all 2.5 kg rounding)
**Primary:** Deadlift, Overhead Press (OHP), Back Squat, Bench Press — same four as GiantFit,
now on a **fixed weekday** each, never a rotation (§2.2).

**Anchored secondary lanes — same two LANES as GiantFit, new occupants:** the `db_row` lane
(OHP day) now holds **BB Row** instead of DB Row; the `pendlay_row` lane (bench day) now
holds **Pull-ups** instead of Pendlay Row (two-mode — see below). This is a deliberate
application of the carry-key discipline (`carry_<day>` — "reassigning an implement doesn't
move the key," generalised by `engine/program.ts`) to the anchor lanes themselves: **no
migration was needed** to make this change (specification.md, Phase 1, 2026-08-09) — the
`working_weights.lift` CHECK constraint already permitted `db_row`/`pendlay_row`, and only
the *display* (what the athlete sees in Setup and the session view) changes, resolved by era.

**Pull-ups are two-mode, reactivated for real use** (not just legacy rendering): a zero/empty
`pendlay_row` anchor for the cycle renders bodyweight cluster targets (10/8/6 by difficulty,
logged as e.g. "6+4" in `pullup_cluster`); any weight renders the full ladder cascade. This is
the exact mechanism GiantFit retired to a read-only path (§4) — Giant 2.0 turns it back
on as a live, writable Setup anchor.

There is no per-lift rounding — every derived load rounds at 2.5 kg (§3).

### 2.2 Week & session structure — FIXED days, no rotation
**Mon = Squat · Tue = Bench · Thu = Deadlift · Fri = OHP · Wed/Sat/Sun = rest.** This is the
headline structural break from every prior era: **the day → lift mapping is fixed**, not a
rotating slot (GiantFit's Mon=Hard/Wed=Medium/Fri=Light slot table has no Giant 2.0 equivalent
— difficulty is now decided by a *separate* weekly rotation per lift, §2.5). Giant Run's Tue/Thu/Sat schedule
is **not wired into Giant 2.0** and is suppressed on Giant2-era dates (§2.13) rather than
colliding with the new Tue/Thu lift days.

Every lifting session runs, in order:
```
I. Primer → II. Giant Block → III. Volume Block → IV. Capability Block
```
- **Primer** (§2.3) — day-typed warm-up, no load, no RPE: rope flow, band activation, a
  bodyweight ramp, then the barbell build-up into the Giant block (the anchor-lift build-up
  pattern carries over unchanged from every prior era, `WU_PCT`/`WU_REPS` 8-5-3-2 @
  ~40/55/70/85%). No GOWOD anywhere (that was Giant-era; GiantFit already dropped it).
- **Giant Block** (§2.4) — 4 rounds: the main lift's ladder, the day's anchored secondary
  where it has one, the day's bodyweight accessory. Adherence logged once per session via
  the completion control (§2.11, reused verbatim from GiantFit).
- **Volume Block** (§2.6) — genuinely independent difficulty from the Giant block's (§2.5) —
  2 sets, reps by ITS OWN difficulty, 80% of the day's top for that difficulty. Absent
  entirely on C3 week 4 (no Volume block that week) and on any deload (§2.9).
- **Capability Block** (§2.7) — content is a property of the CYCLE, not the week or
  session: Hypertrophy (C1), Oly (C2), Carries (C3). Absent entirely on any deload.

**No Capacity block** (§2.12 — retired, no Giant 2.0 equivalent).

### 2.3 Primer block
- **Rope flow** — shared across both day types, no load.
- **Band activation, day-typed:** Crossover Symmetry (Bench/OHP — "upper") · Hip Halo
  (Squat/Deadlift — "lower").
- **Bodyweight ramp, day-typed, 1-2-3 ascending reps across 3 rounds** (tempo not tracked —
  confirmed 2026-08-09, spec originally called for a 3-second-down/3-second-up tempo but the
  build tracks rep scheme only):
  | Upper (Bench/OHP) | Lower (Squat/Deadlift) |
  |---|---|
  | Inverted Row | Good Morning |
  | Push-ups | Reverse Lunges |
  | Dead Bug | Bird Dogs |
  | Support Scap-Dip | Shallow Lateral Lunge |
- Then the barbell build-up (+ the secondary's own build-up when it's weighted) — see §2.2.
- No RPE, no completion control — tracked as prescription only, same treatment GiantFit's own
  Warm-Up block always had.

### 2.4 Giant Block composition (per day)
| Day | Giant Block contents |
|-----|----------------------|
| Squat | Squat · Ab-Roll |
| Bench | Bench · **Pull-ups** (two-mode, §2.1) · Leg Raises |
| Deadlift | Deadlift · Ab-Roll |
| OHP | OHP · **BB Row** · Leg Raises |

Squat and Deadlift train alone (no secondary), same as GiantFit. **The secondary's reps are
fixed by difficulty — Hard 8 · Medium 9 · Light 10 — reusing `GIANTFIT_ROW_REPS` verbatim**
(only the main lift's reps descend across the four sets). Ab-Roll reuses the existing
`ab_rollout` movement (identical exercise to GiantFit's); Leg Raises is new, bodyweight,
default 12 reps, Setup-configurable (shares `giant_accessory_config` with GiantFit's four —
one table, one merge, both eras' keys known).

**The main lift's 4-set ladder is unchanged from GiantFit (`SCHEMES`/`SET_LADDER`) — reps
differentiate the days, the load ladder is uniform (single-anchor model, §3): each set is
85 / 90 / 95 / 100% of that day's Giant-difficulty top (§2.5).**
| Difficulty | Set 1 | Set 2 | Set 3 | Set 4 |
|-----------|-------|-------|-------|-------|
| Hard | 8 @ 85% | 6 @ 90% | 4 @ 95% | 2 @ 100% |
| Medium | 9 @ 85% | 7 @ 90% | 5 @ 95% | 3 @ 100% |
| Light | 10 @ 85% | 8 @ 90% | 6 @ 95% | 4 @ 100% |

### 2.5 Two INDEPENDENT difficulties per session — the key schema break from GiantFit
GiantFit stored one `difficulty` covering both its Giant and Volume blocks. Giant 2.0 needs
two, because they move on entirely different clocks:

**Giant difficulty — varies by lift AND week within the cycle** (`sessions.difficulty`,
unchanged column, new meaning). Weeks 1–3 of every cycle repeat the SAME rotation (confirmed
against the athlete's 13-week calendar, 2026-08-09):
| Week | Squat | Bench | Deadlift | OHP |
|------|-------|-------|----------|-----|
| W1 | Hard | Medium | Light | Hard |
| W2 | Medium | Light | Hard | Medium |
| W3 | Light | Hard | Medium | Light |

Each lift touches Hard/Medium/Light exactly once across the three weeks; one tier doubles up
each week. **This rotation is athlete-editable in Setup** (`giant2_giant_difficulty`,
capacity-config pattern — the table above is the code-side *default*, merged under whatever
the athlete has stored). **Week 4 of every cycle collapses to ONE difficulty for all four
lifts, ignoring the table above and any Setup override** — Light in C1, Medium in C2, Hard in
C3 (`GIANT2_WEEK4_DIFFICULTY`, a pure function of the cycle, never stored).

**Volume difficulty — fixed for an entire cycle, independent of the Giant difficulty and of
week** (`sessions.volume_difficulty`, new column): Light throughout C1, Medium throughout C2,
Hard throughout C3 — **except C3 week 4, where the Volume block doesn't run at all** (null,
not "unset" — a semi-peak week; Giant and Capability still run Hard that week).

### 2.6 Volume block
2 sets, reps by the Volume difficulty (§2.5) — `SCHEMES[volumeDifficulty].vol`, the exact
same 6/8/10 numbers the spec calls for, no separate constant needed — at 80% of the day's top
**for that difficulty** (computed off the same per-cycle cascade as the Giant block, just
indexed by the other difficulty). The secondary joins at the same rate off its own day top.
Bodyweight-mode Pull-ups render prescription-only in the Volume block (no separate cluster-log
field from the Giant block's — a deliberate, documented trim, 2026-08-09).

Absent entirely (not rendered) on C3 week 4 (`volumeDifficulty` null) and on ANY deload,
reactive or scheduled — mirrors GiantFit's own `!isDeload` gate on its Volume block exactly
(a gap caught and fixed during Phase 5, 2026-08-09: the Giant 2.0 Volume/Capability blocks
were initially gated only on the schedule, which happened to already be null on the
*scheduled* deload but not on a *reactive* mid-cycle one).

### 2.7 Capability block — content by CYCLE, the "one level further" modularity
GiantFit's Move 1 modularity made *which exercises* occupy a fixed block into data. Giant 2.0
needs the block's *shape itself* to vary — a genuinely different concept, decided purely by
`GIANT2_CAPABILITY_BY_CYCLE` (cycle → program), never by week or session:

**C1 — Hypertrophy.** Day-specific accessory list, 3 sets fixed regardless of week, logged
per-exercise (weight × reps, `hypertrophy_logs` — one row per movement per session, unlike
`capacity_logs`' one row per session):
| Day | Exercises |
|---|---|
| Squat | Walking Lunge · Lying Hamstring Curl · Hip/Back Extension (3×15) · Standing Calf Raise (3×15) |
| Bench | Seated DB Press · One-Arm Row · Bicep Curl (3×15) · Skull Crusher (3×15) · Serratus Anterior Raise |
| Deadlift | Front-Foot-Elevated Split Squat · Hip Thrust (3×15) · Leg Extension (3×15) |
| OHP | Flat DB Bench · Lat Pulldown (supinated) · Lateral Raise (3×15) · Rope Face Pull (seated, to top of head, 3×15) |

**C2 — Oly.** Technical work, loaded to a per-lane "technical ceiling found by feel" — **not**
a percentage of a tested max, and **not RPE** — logged with a **quality mark** instead
(`oly_logs.quality`: Q3 every rep identical / Q2 minor faults, self-corrected / Q1 position
broke — a genuinely new field type, deliberately not reusing the RPE input or column). Two
consecutive Q3 sessions in a lane steps the load up (2.5 kg snatch family, 5 kg clean/jerk
family); two consecutive Q1 steps it down — computed from history, not stored as separate
state. **Position wave:** weeks 1–2 of the cycle hang from the power position (above the
knee), weeks 3–4 from the knee.
| Day | Primer (3×5, unloaded) | Complex (4–5 × 2+1) | Third (4–5 × 3, upper only) |
|---|---|---|---|
| Squat | Snatch Balance + OHS | Hang Snatch + Full Snatch | — |
| Bench | Tall Clean | Hang Power Clean + Power Clean | Clean + Front Squat (1+2) |
| Deadlift | Muscle Snatch | Snatch High Pull + Hang Power Snatch | — |
| OHP | Tall Jerk | Push Press + Jerk | Split Jerk |

**C3 — Carries.** Reuses the GiantFit day→implement mapping **unchanged** (§2.10) — the exact
same `accessory_weights`/`sessions.carry_*` fields, just gated to render only in C3 instead of
being an always-present 5th block. Always guided at a flat **RPE 6** — this is copy/guidance
only, not an enforced value; the athlete's own `carry_rpe` input is unchanged (confirmed
2026-08-09). Progression: position before load, distance before weight (inherited unchanged).

**Movement identity vs. resolver:** the movement library (`movements`, Move 1) was extended
with every new Primer/Hypertrophy/Oly movement, and Giant 2.0 was seeded as **program version
2** in the previously-dormant `program_versions`/`program_slots` system (§9) — but the actual
session VIEWS still render off hardcoded `GIANT2_*` constants, matching GiantFit's own
established practice, not `resolveProgram`. Wiring a live session view to the resolver remains
a possible future step, not something either era has done yet.

### 2.8 The 13-week macrocycle
Structurally identical in shape to GiantFit's macrocycle — three 4-week
mesocycles (C1/C2/C3) + one deload week, extendable by the athlete to a 14-week macro
(`deload_extended`, unchanged) — but now **4 session days/week** (Mon/Tue/Thu/Fri) instead of
3, so the Calendar grid renders 3 or 4 columns per week depending on which era a given week
falls in (`enumerateMacro`, decided per-week off that week's own Monday — §6).

### 2.9 End-of-macro deload (the final week — week 13, or 13–14 when extended)
**Unlike GiantFit's, this IS a real, loggable session** (GiantFit's deload has never had one —
static card only). Fixed day→lift still applies (Mon is always Squat, deload or not — confirmed
against the calendar): Giant block only, ~70% of the **last training cycle's (C3) Hard
anchor** (a dedicated reference-cycle lookup, since the deload week itself has no cycle of its
own — `cycle`/`week` are stored `null`, matching the schedule's own values), fixed **Hard** rep
scheme (no H/M/L that week — `'hard'` is stored purely as the scheme lookup). No Volume block,
no Capability block (§2.6/§2.7's `!isDeload` gates). Reactive mid-cycle deloads (§5) share the
same ~70%/no-Volume/no-Capability shape.

### 2.10 Carries (per day, accessory effort) — unchanged from GiantFit
**Squat → Sandbag Bear Hug · Bench → Suitcase · Deadlift → Farmers · OHP → Overhead.** Same
implements, same `carry_<day>` keys, same Setup-configurable per-cycle weights, same Suitcase
50 kg seed default — identical to GiantFit's mapping, just now
gated to render only in C3 (§2.7) instead of appearing every session.

### 2.11 Giant-block completion (adherence) — unchanged from GiantFit
The top set keeps full RPE + bar-speed logging; the rest of the block is captured by the same
single completion control (default "completed as prescribed," or a categorical reason),
`sessions.block_completion`, driving the same deload signal (§5, S7).

### 2.12 The Capacity block — RETIRED, no Giant 2.0 equivalent
GiantFit's timed-circuit conditioning block (variant A/B, stopwatch, `capacity_logs`) has
**no place in Giant 2.0** — there is no replacement block and no replacement deload signal
(§5, S6). It stays fully live for GiantFit history and any still-active GiantFit macro; it
simply never renders for a Giant2-era date (`capacityVariant` is explicitly forced null there,
even on weekdays — Monday/Friday — that overlap GiantFit's own Mon/Wed/Fri capacity-slot
pattern, guarding against the two unrelated mechanisms ever cross-talking).

### 2.13 Giant Run scheduling collision — flagged, not solved
Giant Run's fixed Tue/Thu/Sat schedule predates Giant 2.0 and was never touched by this
migration (explicitly out of scope) — but Giant 2.0 moves lift days onto Tuesday (Bench) and
Thursday (Deadlift), the exact two weekdays Giant Run assumed were free. Rather than let the
two collide, **Giant Run is suppressed outright on any Giant2-era date** (`Today.tsx`'s
run-slot check, `Calendar.tsx`'s run row) — it stays fully intact for GiantFit-era macros. If
Giant Run is ever meant to run alongside Giant 2.0, this needs a real design decision (a
different weekly slot, or accepting double-booked days) — not attempted here.

### 2.14 REMOVED — do not reintroduce
Retired with the Giant 2.0 migration (in addition to everything already retired with GiantFit
— see the historical version of this section in git/specification.md for that list):
- **The Capacity block** (§2.12) and its A/B variant alternation, stopwatch logging, and
  `capacity_config`/`capacity_settings` Setup UI — GiantFit-only now.
- **Lift rotation** — day → lift is fixed (§2.2); there is no weekly-realigning slot table to
  peek across, and the Today tab's difficulty-preview toggle is hidden on Giant2-era dates
  accordingly (it has nothing meaningful to preview).
- **A single shared difficulty per session** — replaced by two independent fields (§2.5).
- **A macro-type selector** — the era is decided per DATE by `GIANT2_START_DATE`, never per
  macro and never by a stored flag (same discipline as the GiantFit cutover before it).

---

## 3. Working weights — PER CYCLE, from a single Hard anchor (critical data-model point)

Working weights progress across the macro, so each mesocycle (C1/C2/C3) has its own loads.
**Only one number is entered per lift per cycle: the Hard top set (the anchor).** Everything
else computes off it:
- **Day tops (Giant block):** Hard = the anchor (100%), Medium = anchor × 0.95, Light = anchor
  × 0.90 — indexed by the Giant difficulty (§2.5) for the main lift and secondary alike.
- **Giant Block sets:** 85 / 90 / 95 / 100% of that day's top (§2.4).
- **Volume:** 80% of that day's top — but the day top used here is indexed by the VOLUME
  difficulty (§2.5), an independent lookup off the same cascade, never the Giant difficulty's.
- Derived loads round at the uniform **2.5 kg** (`DEFAULT_INCREMENT`). The **anchor itself is
  never rounded** — user input stays exactly as entered.
- **Six anchor lanes, unchanged since GiantFit's 2026-07-30 revision: Squat / Bench / Deadlift
  / OHP / `db_row` / `pendlay_row`** (`ANCHOR_LIFTS`). **Giant 2.0 reuses the SAME two
  secondary lanes with new occupants** (§2.1) — `db_row` now holds BB Row, `pendlay_row` now
  holds Pull-ups — the lane persists, only the display resolves differently by era; no schema
  change was needed. Legacy `dips`/`pullup` anchor ROWS (not lanes) still load so old sessions
  render, but are never written by the current Setup UI, which shows exactly these six lanes
  under whichever era's labels apply to the macro being edited.

**Two-mode Pull-ups — REACTIVATED for real use (Giant 2.0, `pendlay_row` lane):** decided
purely by the cycle's anchor for that lane (0/empty = bodyweight cluster mode with 10/8/6
targets and `pullup_cluster` logging; any weight = the full 2.5 kg cascade). This is the exact
mechanism GiantFit retired to a legacy-only render path (`liftMode`) — Giant 2.0 turns it back
on as a live, writable anchor, not just history rendering.

A logged session reads its own **(macro, cycle)** anchor and recomputes — essential for correct
retroactive logging (the bug that motivated the original rebuild: a C1 session must not use
C3's heavier loads). The anchor is editable any time, up or down; the whole cascade recomputes
live everywhere, and **only the anchor is stored** (the computed grid is never persisted, so
nothing goes stale). Solved relationally — see §9.

- All six anchors use the **identical** cascade off their Hard anchor — build-up, Giant Block
  ladder, and Volume all derive from the movement's OWN anchor, never from the day's main lift.
- **Carries** (§2.10): per-cycle, a single recorded weight each — not part of the anchor
  cascade. The Giant Block's bodyweight accessories carry no load at all (§2.4).
- **Start-of-macro rule, unchanged:** a new macro's C1 anchor = the previous macro's C3
  anchor; "start next macro" carries the anchor lanes and carry items forward.

---

## 4. Pull-ups — two-mode lift, REACTIVATED by Giant 2.0

**Giant-era origin, retired to legacy-only by GiantFit, reactivated for real use by Giant 2.0**
(§2.1, §2.4 — the bench day secondary, `pendlay_row` lane). The mechanism is unchanged across
all three eras:
- **Bodyweight mode:** progress is the **cluster shape on the final Giant Block round** —
  targets 10/8/6 reps by difficulty, logged like `6+4` → `8+2` → `10` (`pullup_cluster`).
- **Weighted mode:** any anchor > 0 for the cycle switches to the full standard 2.5 kg
  cascade — same ladder as any other anchored lift.
- The mode flips purely on the per-cycle anchor value (`liftMode`) — no separate flag.

The Giant-era **dips** lift (`dips_cluster`, the two-mode dips/pull-up pairing) stays retired —
GiantFit dropped dips as a main lift entirely, and Giant 2.0 never
reintroduced it. Only pull-ups came back, as a secondary, not a main lift.

---

## 5. The reactive deload rule (current, revised version)

An honest fatigue ego-check. Watches objective signals across a training week. **This revised
rule supersedes the version in the v7 program book**, and carries into Giant 2.0 with one
signal retired and one small gate added — see the Giant 2.0 callout below.

**Signals (auto-detected):**
- **S1** — any day, top set logged at **R9.5+** (past the intended ceiling on any difficulty).
- **S2** — volume block incomplete (cut reps / dropped set). **Giant 2.0 exception:** never
  evaluates a session with no Volume block at all (C3 week 4, `volumeDifficulty` null) — added
  as an explicit domain rule in `deload-rule.ts` rather than left as an implicit consequence of
  which checkbox happens to render (2026-08-09).
- **S3** — carry skipped due to **fatigue** (not schedule). Needs no Giant-2.0-specific
  handling: `carrySkipped`/`carrySkipReason` are only ever set where the Carry UI renders (C3),
  so it already goes quiet outside C3 structurally.
- **S5** — bar speed ↓ on the top set in **2+ sessions** within the week (any lifts).
- **S6 — "Capacity not completed as prescribed (fatigue)" (2026-07-31):** **one occurrence
  per capacity log in the week whose `completion` is a `*_fatigue` value** —
  `cut_short_fatigue` (stopped rounds early) or `scaled_fatigue` (reduced reps / scaled a
  movement down). No streak rule, no cold start, no baseline: a single session counts once,
  exactly like S2 and S3. `cut_short_time` and `scaled_other` are deliberate non-fatigue
  attributions and fire nothing; a null (pre-2026-07-31) log reads as `completed` and is
  inert. The rule lives in the **value names** — any `*_fatigue` value fires — mirroring
  `carry_skip_reason`'s fatigue-vs-schedule split: attribution is the athlete's, captured at
  log time, never inferred. *(Supersedes the capacity TIME trend that held S6 from
  2026-07-23 — see the decisions log for why it was retired.)* **Retired for Giant 2.0, not
  replaced (2026-08-09):** no Capacity block means no `capacity_logs` row ever exists for a
  Giant2 session, so S6 needs no code change to go quiet there — it stays fully live for
  GiantFit. No new signal was invented for the Oly block's quality-mark data either, per
  explicit instruction — that idea is parked, not built.
- **S7** — **giant block not completed as prescribed** (any non-"completed" state of the
  completion control, §2.11). *Numbered S6 in the Giant era — renumbered when GiantFit claimed
  S6 for the capacity trend; signals are computed, never stored, so history re-renders under
  the new number with identical facts.* Reused verbatim by Giant 2.0.
- *(S4 — Set 1 > R7 — retired; the logger captures only the top set, and S7 covers in-block breakdown categorically.)*

**Trigger:** fires when there are **3+ total signal occurrences spanning at least 2 different
sessions** in the week. (Three occurrences = severity; two sessions = it's a pattern, not one
bad day. One catastrophic single day never fires it.) **Unchanged for Giant 2.0** despite its
4th weekly session (Mon/Tue/Thu/Fri vs GiantFit's Mon/Wed/Fri) — reused verbatim, not rescaled.

**Testing weeks (W13–14, legacy only):** signals from test sessions are captured and shown in
the Deload tab (as `W13/W14 · Testing` buckets), but the reactive recommendation **never
fires** there — the scheduled deload is already next. This is structural: the recommendation
only renders on training-week session days, and test rows (null cycle/week) can't enter its
week filter. Giant 2.0 macros never compute a testing week at all (§2.8/§6).

**Behaviour:** the rule **advises, the athlete decides** — it recommends a deload via a confirm
prompt; the athlete taps Apply. Never auto-forced.

**Deload week (when applied):** GiantFit — Giant Block only at ~70%, hard scheme, no volume,
light/no carries, no capacity block. Giant 2.0 — the same shape (§2.9): Giant block only
at ~70% off the last training cycle's Hard anchor, hard scheme, no Volume block, no
Capability block. Both eras gate their Volume block (and, for Giant 2.0, the Capability block
too) on the SAME `isDeload` flag whether the deload is scheduled or reactive/mid-cycle — a
gap in the initial Giant 2.0 build (Volume/Capability were only schedule-gated, which happened
to already be null on the scheduled deload but not a reactive one) was caught and fixed in
Phase 5, 2026-08-09.

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

// GiantFit (and legacy Giant): a ROTATING slot table.
session days = Mon (hard), Wed (medium), Fri (light)
dayType = ROTATION[weekInMeso-1][difficulty]

// Giant 2.0: FIXED day->lift, difficulty resolved separately (two independent lookups).
session days = Mon/Tue/Thu/Fri (GIANT2_SESSION_DAYS)
dayType = GIANT2_DAY_LIFT[weekday]                                    // no rotation at all
difficulty = weekInMeso===4 ? GIANT2_WEEK4_DIFFICULTY[meso]           // collapses per cycle
           : giant2GiantDifficultyFor(meso, weekInMeso, dayType, athleteConfig)
volumeDifficulty = (meso===3 && weekInMeso===4) ? null : GIANT2_VOLUME_DIFFICULTY_BY_CYCLE[meso]
```
- **GiantFit cutover (per DATE, not per macro):** days on/after `GIANTFIT_START_DATE`
  (2026-07-27) use `GIANTFIT_ROTATION`, apply the C1W1D1 Medium-deadlift override, and stamp
  `giantfit: true` + `capacityVariant` (A/B by scheduled-slot index since the cutover) on the
  Position; earlier days use the legacy `ROTATION` untouched.
- **Giant 2.0 cutover (per DATE, same discipline — `isGiant2Date`, checked FIRST since it's
  chronologically the more specific era — `giantfit` stays true for Giant2 dates too):** days
  on/after `GIANT2_START_DATE` (2026-08-10) stamp `giant2: true`, compute `dayType` from the
  fixed map (no rotation lookup at all), resolve the Giant difficulty from the athlete's Setup
  config merged under the code default (§2.5), resolve the Volume difficulty independently, and
  force `capacityVariant` null regardless of weekday overlap with GiantFit's own Mon/Wed/Fri
  capacity-slot pattern. **Giant 2.0's deload week (unlike GiantFit's) still computes a
  `dayType`** (fixed day->lift applies deload or not) — only the H/M/L difficulty is absent
  that week (§2.9). No stored rows are migrated for either cutover — rendering old dates always
  reproduces the lived schedule, and **a macro straddling a cutover renders correctly on both
  sides of it** (verified by test) — the date decides, never the macro (see the top-of-doc note).
- Legacy testing weeks: Mon/Fri = test, Wed = optional light (`testRole` field distinguishes) —
  reachable only via weeks=15 macros (all pre-cutover); GiantFit and Giant 2.0 macros never
  compute one.
- Local date (Brașov, Romania timezone) — compute "today" locally, never UTC, to avoid date-boundary bugs.
- Non-session days show the next scheduled session ("Skill day / Rest" pre-GiantFit; plain
  "Rest Day" GiantFit and Giant 2.0 alike — neither has skill days).
- Before start → "upcoming"; past the macro's total weeks → "macro complete, start next macro."

**Important implementation note:** an early version caused infinite recursion because
`computePosition` and `nextSessionFrom` called each other. The fix was to extract a `corePosition`
helper that never computes the next session, and have both callers use it. Preserve that
separation. (Lives in `src/engine/date-engine.ts`; known-correct outputs are unit-tested —
13 Apr 2026 → M2 C1 W1 DL Hard; 22 Jun 2026 → M2 C3 W3 Squat Hard; GiantFit: 27 Jul 2026 →
M3 C1 W1 DL **Medium** variant A, 3 Aug 2026 → Bench Hard variant B; Giant 2.0: 10 Aug 2026 →
Squat Hard / Volume Light, C1 W1.)

---

## 7. The calendar view (Option A)

A **program-structured grid** (NOT a literal month calendar): one row per program week
(13; 14 when the deload is extended; legacy macros 15), each with **3 cells (Mon/Wed/Fri)
pre-Giant-2.0 or 4 cells (Mon/Tue/Thu/Fri) from `GIANT2_START_DATE`** — decided PER WEEK off
that week's own Monday (`enumerateMacro`), so a macro that happens to straddle the cutover
renders 3 columns on one side and 4 on the other correctly. The grid itself is CSS
`repeat(row.cells.length, 1fr)`, never a hardcoded column count. Each cell shows:
- The real calendar date (past, today, and future all dated).
- Lift + difficulty (or "Deload"; legacy testing cells show "Test" / "Light optional"). Giant
  2.0's deload cells still show a lift (fixed day->lift applies deload or not, §2.9) — GiantFit's
  never have (its deload week has no day-lift concept at all).
- State by colour: logged / missed / today / upcoming / break.
- Top set once logged.

Tapping a cell opens a **full logging modal** (same fields as live logging) to log, edit, delete,
or **mark the day as a break** (day-level granularity — breaks can straddle weeks). Calendar
auto-scrolls to the current week on open. Break days are exempt from "missed" status and from
deload signals. Giant 2.0's deload cells open a REAL session editor (Giant block only, ~70%);
GiantFit's deload cells still show only a static summary card — it has never had a loggable
deload session.

**The Giant Run row (Tue/Thu/Sat) is suppressed on Giant2-era week rows** — Tue/Thu are now
Bench/Deadlift lift days under Giant 2.0, and Giant Run was never wired into it (§2.13); the
row still renders normally under any GiantFit-era week.

---

## 8. Current state

The full rebuild is shipped and deployed to GitHub Pages
(https://zsolt17.github.io/giant-programV2/). Everything that was once "planned" is now built;
see `specification.md` for the dated build history and `CONVENTIONS.md` for how it's structured.
Capabilities, in domain terms:

- **Today** — date-computed position; the full Giant 2.0 session (Primer, Giant Block +
  secondary + bodyweight accessory, Volume off its own independent difficulty, Capability
  dispatched by cycle) + logging, with an optional session timer. Giant 2.0's deload week is a
  real logger too (§2.9) — GiantFit's stays a static card. Pre-Giant-2.0 dates render their
  lived GiantFit or legacy Giant session shape unchanged.
- **Calendar** — the program-week × (3 or 4 columns, era-dependent) grid + Tue/Thu/Sat run row,
  suppressed on Giant2-era weeks (§7); log/edit/delete any session; mark breaks. Pre-cutover
  cells render their lived earlier era.
- **History** — latest top sets (all four current lifts; dips kept for legacy), recent-session
  feed, pull-up cluster trend (reactivated by Giant 2.0, §4), legacy testing results.
- **Deload** — per-week fatigue signals (lifts + runs + capacity pooled) + reactive-deload
  recommend/apply (§5). Giant 2.0 sessions feed the same signals with S2's one exception and
  S6 naturally inert (no Capacity block).
- **Setup** — per-cycle (C1/C2/C3) Hard-top anchors for all six lanes (Squat/Bench/Deadlift/OHP
  + the two secondary lanes, labelled BB Row/Pull-ups or DB Row/Pendlay Row depending on which
  era the macro being edited belongs to, §2.1) + Giant Block accessory rep targets (§2.4) +
  the Giant 2.0 weekly Giant-difficulty rotation (§2.5, new) + capacity config (GiantFit-only,
  §2.12) + per-cycle carries (§2.10), macro anchor, macro picker, and "start next macro"
  archiving (C3→C1).
- **Per-cycle working weights** — the motivating fix; a session reads its own `(macro, cycle)` grid.
- **Multi-macro archiving** — roll into a new macro carrying C3 weights forward; prior macros stay viewable.
- **Trends** — Lifts (DL/OHP/Squat/Bench, all eras) · Runs · Capacity (GiantFit-only: per-round
  time per variant, Bike calories) · Carries (same implement mapping across GiantFit and
  Giant 2.0) · Attendance (3- or 4-column grid, era-dependent, §7) · Session views across a
  macro range; legacy macros render with the remaining views only. No Hypertrophy/Oly trend
  views yet (Phase 6 added their CSV export, not a Trends visualization).
- **Data export / share** — six CSVs (sessions incl. `volume_difficulty`, capacity, Hypertrophy,
  Oly, runs, legacy testing — a union of every era), and per-session plain-text summaries in
  each era's format (Giant 2.0's flags rather than includes its Hypertrophy/Oly content, since
  that's logged in separate per-movement tables the summary function doesn't read).
- **Recovery → Tendon Health** (§12) — joint isometric-loading protocols with phase-based dosing,
  per-tendon hold timers, and light per-day "done" logging. Macro-independent, untouched by
  either migration.
- **The Giant Run** (§13) — Tue/Thu/Sat companion running program: date-computed schedule,
  two-mode pace engine off a per-macro reference pace, per-cycle distance targets, run
  logging (Today + Calendar run row), pooled deload signals, Data/CSV/Trends coverage. Untouched
  by the Giant 2.0 migration, but suppressed on Giant2-era dates (§2.13) — a real scheduling
  collision, not a design decision either program made deliberately.
- **Single-user auth** (Supabase + Row Level Security), installable PWA with offline logging.

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
GiantFit capacity tables below; `0015_giantfit_phase2.sql` adds `bench` to the
`sessions.day_type` CHECK; `0016_giantfit_phase3.sql` adds `sessions.pair_weight` and
`carry_bench` to the accessory item CHECK; `0017_row_anchors.sql` adds `db_row`/`pendlay_row`
to the `working_weights` lift CHECK — the rows become anchors, §2.1;
`0018_giant_accessory_config.sql` adds the `giant_accessory_config` table for the Giant Block
accessory rep targets, §2.4; `0019_movements.sql` adds the `movements` library + the two empty
secondary anchor lanes; `0020_program_versions.sql` adds `program_versions`/`program_slots`;
`0021_capacity_completion.sql` adds `capacity_logs.completion` — the S6 input, §5. **The
2026-07-30 GiantFit revision needed no other schema change and dropped nothing:**
`sessions.pair_weight` is kept (pre-revision row weights stay readable), and the retired
capacity movements needed no migration at all. `0022_giant2_phase1.sql` adds
`sessions.volume_difficulty` (§2.5) and the `giant2_giant_difficulty` config table (§2.5) —
**no anchor-lane CHECK change**, since Giant 2.0's BB Row/Pull-ups reuse the existing
`db_row`/`pendlay_row` lanes (§2.1); `0023_giant2_phase4.sql` adds `hypertrophy_logs` and
`oly_logs` — one row PER MOVEMENT per session (unlike `capacity_logs`' one row per session),
§2.7.
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
  lift          text not null,             -- deadlift | ohp | squat | bench | db_row | pendlay_row
                                           --   (db_row/pendlay_row now hold Giant 2.0's BB Row/Pull-ups —
                                           --   same LANES since GiantFit 0017, occupant changed, no CHECK change)
                                           --   | dips | pullup (dips DEPRECATED Giant-era; pullup REACTIVATED by Giant 2.0, §4)
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
  id            text primary key,          -- pre-Giant-2.0: "2026-06-22-squat-H" (date+lift+difficulty)
                                           --   Giant 2.0: "2026-08-10-squat" (date+lift only — day->lift
                                           --   is fixed, no rotation, and difficulty is no longer singular)
  macro_id      uuid references macros not null,
  date          date not null,             -- the SCHEDULED slot date (not necessarily the physical day)
  cycle         int,                       -- null for testing/deload weeks
  week          int,                       -- week within meso (1..4), null for special weeks
  week_type     text not null,             -- training | testing | deload
  day_type      text,                      -- deadlift | ohp | squat | bench | dips (null for testing/light)
  difficulty    text,                      -- hard | medium | light — the GIANT block's difficulty
  -- Giant 2.0 only (0022): the VOLUME block's own, independent difficulty — null on
  -- GiantFit/legacy rows and on any Giant-2.0 session with no Volume block (C3 week 4, §2.5)
  volume_difficulty text,
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
  -- DEPRECATED 2026-07-30 (never dropped): the paired row's free per-session weight
  -- (0016), from the era when the rows were unanchored. The rows are anchored lifts
  -- now (§2.3) so nothing writes this again; logged values still render as history.
  pair_weight   numeric,
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
  movement_key  text not null,             -- e.g. db_snatch, hang_bb_snatch (app-defined);
                                           -- rows for retired movements are ignored on read
  rep_target    int,                       -- null = the movement's app default
  weight        numeric,                   -- kg; loaded movements only
  unique (user_id, variant, movement_key)
)

-- Giant Block bodyweight-accessory rep targets (0018). Same pattern as
-- capacity_config: the movements + default reps are app content
-- (GIANTFIT_GB_ACCESSORY), only the athlete's edited target is stored, defaults
-- are merged on read, and unknown/retired keys are ignored. Prescription config —
-- NOT a per-session log.
giant_accessory_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  movement_key  text not null,             -- ab_rollout | toes_to_bar | ghd_abs | ghd_back_ext
  rep_target    int,                       -- null = the movement's app default
  unique (user_id, movement_key)
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
  -- Adherence (0021), categorical, the S6 input: completed | cut_short_fatigue |
  -- cut_short_time | scaled_fatigue | scaled_other. NULL on legacy rows = treated
  -- as completed (never backfilled). Any *_fatigue value fires S6.
  completion          text,
  notes               text,
  updated_at          timestamptz default now(),
  unique (session_id)
)

-- Giant 2.0 (0022): the athlete's Setup override for the weekly Giant-difficulty
-- rotation (§2.5) — capacity-config pattern, the code default merges under whatever's
-- stored here. Week 4's collapse is NEVER stored (a pure function of the cycle).
giant2_giant_difficulty (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  week_in_cycle int not null,              -- 1 | 2 | 3
  lift          text not null,             -- deadlift | ohp | squat | bench
  difficulty    text not null,             -- hard | medium | light
  unique (user_id, week_in_cycle, lift)
)

-- Giant 2.0 Capability block (0023, §2.7) — C1 Hypertrophy. One row PER MOVEMENT
-- per session (unlike capacity_logs' one row per session). RLS transitive via
-- session -> macro, same pattern as capacity_logs.
hypertrophy_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    text references sessions on delete cascade not null,
  movement_id   uuid references movements not null,
  weight        numeric,
  reps_done     int,
  notes         text,
  updated_at    timestamptz default now(),
  unique (session_id, movement_id)
)

-- Giant 2.0 Capability block (0023, §2.7) — C2 Oly. Same per-movement shape as
-- hypertrophy_logs, but logs a QUALITY MARK (Q1/Q2/Q3), never RPE — a genuinely
-- new field type, deliberately not reusing the rpe column pattern.
oly_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    text references sessions on delete cascade not null,
  movement_id   uuid references movements not null,
  weight        numeric,
  quality       text,                      -- Q1 | Q2 | Q3
  notes         text,
  updated_at    timestamptz default now(),
  unique (session_id, movement_id)
)
```

Notes:
- The `sessions.id` scheme changed with Giant 2.0 (`date-lift-difficulty` → `date-lift`) — see
  the `sessions` table comment above. Both schemes are stable and idempotent (upsert on log);
  history keeps whichever scheme was live when a row was written.
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

- **Giant 2.0 migration (2026-08-09, six phases — mirrors the GiantFit revision's own
  shipping style).** GiantFit is retired the same way Giant v7 was: a single cutover date
  (`GIANT2_START_DATE`), no macro-type selector, the date decides everything. Key calls made
  along the way:
  - **The date decides the era, never the macro — verified as a real, non-theoretical
    consequence, not just a slogan.** An in-flight GiantFit macro does NOT keep running
    GiantFit past the cutover; its remaining sessions render under Giant 2.0 rules using that
    macro's own week/meso clock. A fresh macro dated `GIANT2_START_DATE` is required for a
    clean C1 W1. Documented with a dedicated test (`date-engine.test.js`) rather than left
    implicit, precisely because it's the kind of consequence that's easy to miss.
  - **BB Row and Pull-ups reuse the existing `db_row`/`pendlay_row` anchor LANES rather than
    getting new ones** — a direct application of the carry-key discipline
    (`carry_<day>` — "reassigning an implement doesn't move the key") to the anchor system,
    saving a migration entirely. Pull-ups' two-mode engine (`liftMode`), dormant since
    GiantFit retired it to a legacy-only render path, was turned back on as a live Setup
    anchor — the mechanism needed zero code changes, only a decision to point a real lane at it.
  - **Two independent difficulty fields, not one** (`sessions.difficulty` for the Giant block,
    new `sessions.volume_difficulty` for the Volume block) — GiantFit's single shared
    difficulty couldn't represent Giant 2.0's schema, where the two move on entirely different
    clocks (§2.5).
  - **The Capability block's content-by-cycle dispatch stays entirely in CODE**
    (`GIANT2_CAPABILITY_BY_CYCLE`, a pure function of the cycle number) — **not** Setup-editable,
    unlike the Giant-difficulty rotation, which explicitly is. The modular
    `movements`/`program_versions`/`program_slots` system (dormant since GiantFit's own Move
    1/2) was extended and seeded for Giant 2.0 (a new program version 2), but the actual
    session VIEWS still render off hardcoded `GIANT2_*` constants, matching what GiantFit's
    session views have always done — **wiring a live session view to the resolver remains a
    future step neither era has taken**, not an oversight of this migration.
  - **S6 retired, deliberately NOT replaced** — no Capacity block, no equivalent signal, and
    explicitly no new signal invented for the Oly block's quality-mark data, per instruction.
    S1/S3/S5/S7 needed no code change (structurally inert where Giant 2.0 doesn't apply); S2
    got one explicit domain-rule gate for C3 week 4 (§5).
  - **A real gap caught and fixed, not designed in from the start:** the Volume and
    Capability blocks were initially gated only on the SCHEDULE (`volumeDifficulty`/`cycle`),
    which happens to already be null on the scheduled end-of-macro deload but does NOT go
    null on a reactive mid-cycle deload — so a reactive deload mid-Oly-cycle would have left
    the Volume and Oly blocks rendering at full content. Fixed by also gating both blocks on
    `!isDeload`, matching GiantFit's own long-standing precedent exactly. Caught during Phase
    5 while verifying deload-signal correctness, not during the original Phase 3/4 build —
    a reminder that "mirrors an existing pattern" needs to be checked against ALL of that
    pattern's behavior, not just the parts a first pass happens to exercise.
  - **`ensureSeedMovements`'s "only seeds an empty library" guard silently meant an existing
    account would never receive new seed content added later** — the athlete's real library
    predated Phase 1's ~35 new Giant 2.0 movements, so without a fix, every Hypertrophy/Oly
    log would have had no real movement `id` to reference. New `syncSeedMovements` (additive
    diff by key, not empty-library-only) replaced the boot-time call; `ensureSeedMovements`
    itself is untouched for whatever still calls it directly. A reminder that "seed on first
    boot" and "backfill new content into an existing account" are different operations and
    need different functions, even when they share almost all their logic.
  - **Giant Run is suppressed outright on Giant2-era dates, not redesigned.** Giant 2.0 moves
    lift days onto Tuesday and Thursday — exactly the weekdays Giant Run assumed were free.
    Out of scope to fix properly (Giant Run itself was never touched); flagged in both
    `specification.md` and here (§2.13) as a real, live collision that needs an actual design
    decision if the two are ever meant to coexist.

- **S6 stopped measuring the clock (2026-07-31).** The capacity TIME trend (per-round time
  vs a rolling same-variant average ×1.15, 3-session cold start) was retired as a deload
  trigger for two reasons. **Noise floor:** per-round time in a 7-movement circuit with no
  time cap is dominated by transitions and equipment availability, so a 15% swing sits
  inside normal variation — it measured the gym, not the athlete. **Unattainable baseline:**
  variants alternate weekly, so a variant accrues ~1 session a week; three weeks to a first
  evaluation, minus deload weeks and missed sessions, and reset by any edit to the circuit's
  reps or movements. Meanwhile the capacity block — a full weekly training block — had **no
  completion signal at all**, while the rest of the rule treats "couldn't complete the
  prescribed work" as its core fatigue currency (S2, S7, S3). So the number stayed and the
  metric changed: S6 is now capacity adherence, attributed by the athlete at log time
  (`capacity_logs.completion`, migration `0021`). Signals are computed and never stored, so
  history re-rendered under the new definition with **no migration of existing logs and no
  data loss** — the same reasoning that justified the earlier S6→S7 renumber. **The
  per-round chart in Trends stays**: good enough to look at, not good enough to fire a
  trigger. Do not reinstate a time-derived signal.

- **GiantFit revision — rows anchored, Giant Block recomposed, capacity trimmed
  (2026-07-30):** the paired rows became **full anchors** (`db_row` per hand, `pendlay_row`;
  migration `0017`) rather than free per-session weights — one loading engine, no
  special-casing, so a row gets its own build-up, its own 85/90/95/100 ladder at fixed reps
  (H8/M9/L10), and its own 80% Volume line, all off its own per-cycle anchor. The Giant
  Block's second slot is now **row + one bodyweight accessory per day** (§2.3); the accessory
  is **prescription config, not a per-session log** — its rep target lives in Setup
  (`giant_accessory_config`, migration `0018`, default 10) exactly like capacity movement
  reps, so no session columns were added. Volume keeps ONE completion checkbox + RPE for the
  whole block (lift and row together), leaving the S2 signal semantics untouched. Capacity
  dropped to 7 movements per variant (§2.12) with **no migration** — retired movement keys
  are ignored on read and `capacity_logs` never referenced them. **Nothing was dropped or
  rewritten:** `pair_weight` and every retired config row remain, and pre-revision sessions
  render what they logged, marked as such.
- **GiantFit Phase 5 (2026-07-23):** two-era data stays uncontaminated by construction —
  trend series are drawn only where their era has data (Bench post-cutover, Dips frozen at
  the cutover with no empty tail), capacity charts split by variant (A and B are different
  circuits — never averaged together), CSV exports are a **union** of both eras' columns
  (legacy rows keep their original cells, never rewritten), and copy-summaries render each
  session in its own era's format. The capacity chart and the S6 signal read the SAME
  per-round series (`engine/capacity.ts`) — one derivation, two consumers.
- **GiantFit Phase 4 (2026-07-23):** capacity feeds the reactive deload rule as **S6**
  ("Capacity time ↑" — per-round time vs rolling same-variant average ×1.15, 2+ consecutive
  slow sessions = one occurrence, cold start at 3 sessions/variant); the Giant-era
  block-completion signal was **renumbered S6→S7** to free the id (computed, never stored —
  a display-only renumber, behavior identical). Deload weeks have **no capacity block** and
  are excluded from the S6 series on both sides. Trigger/cap/break/CONFIRM semantics
  unchanged; Giant Run deload behavior untouched.
- **GiantFit Phase 3 (2026-07-23):** post-cutover session structure = Warm-Up → Giant →
  Volume → Capacity → Carry (no core circuit, no per-round cardio, no clean/skill/testing
  surfaces). Paired rows are **unanchored, logged per session** (`sessions.pair_weight`,
  free entry, no ladder — not a Setup-recorded weight); the capacity block saves **one
  result per session** through its own stopwatch/save flow (count-UP, timestamp-based,
  never a countdown ring), auto-upserting the session first so the FK always holds.
  GiantFit carries: DL Farmers / OHP Overhead / Squat Bearhug / Bench Suitcase, per-cycle
  in Setup, starting loads blank. The era branch lives in the ONE shared `SessionForm`
  (`isGiantFitDate(draft.date)`) so Today and the Calendar modal can't drift.
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
- **Giant-block completion (2026-06-30):** adherence logged as one categorical control (§2.11),
  driving a deload signal — numbered S6 then, **S7** since GiantFit (§5). S4 (Set-1 > R7) retired.
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
- GOWOD handled warm-up activation + cooldown in the Giant era; **GiantFit replaced it
  (2026-07-24)** with the fixed in-app activation list (§2.2) — no GOWOD reference in
  GiantFit sessions. Barbell build-up sets stay in-app, unchanged.
- **Pairings corrected 2026-07-24:** deadlift trains ALONE (it briefly shipped paired with
  a DB Row); the set is DL alone · OHP + DB Row · Squat alone · Bench + Pendlay Row. Any
  pair weights logged on DL days during the brief window stay renderable — History shows
  what was logged. *(Still the day↔row assignment; the rows became anchored on 2026-07-30 —
  see the top of this log and §2.3.)*
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

- **`The_Giant_Program_v7_Book`** (`.pdf` / `.docx`) — the **retired Giant program's** book,
  kept in the separate documentation folder (`The Giant Program/`), **not** in this code repo.
  The Giant Program continues on paper only; for the app it is read-only History. **GiantFit
  is defined by this document (§2) plus the athlete's Setup config** — there is no GiantFit
  book the app follows.
- **`CONVENTIONS.md`** — how the code is built (structure, stack, patterns, design system, testing).
- **`specification.md`** — the dated change log of what's been built.
- Historical: the app began as a monolithic single-file `index.html` on a Google Sheets / Apps
  Script backend. That's been fully superseded by the modular Vite + React + Supabase rebuild
  (preserved in git history); no longer a reference for new work.

---

*End of brief. When in doubt, favour the simplest thing that serves "a searchable history +
honest deload markers," and preserve the date-engine logic that already works.*
