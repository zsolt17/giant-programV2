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
The sections below describe the domain it encodes and the decisions behind it.

**Guiding principle** (mirrored from the training philosophy it serves): **resist scope creep,
build one solid piece at a time, don't stack changes before the last one is verified.**

> **This app runs one program: Giant 2.0.** There is no macro-type selector, no era branching,
> no parallel program to disambiguate against — every macro, every session, every screen
> speaks the same rules described below. Two earlier programs (Giant v7, then GiantFit) ran
> in this same app before it; both were fully retired on 2026-08-10 — their code, schema, and
> data are gone, not archived in a read-only mode. If you're curious about that history, it's
> in `specification.md`'s dated entries, not here.

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

### 2.1 Lifts — 4 primary, 2 anchored secondary lanes (all 2.5 kg rounding)
**Primary:** Deadlift, Overhead Press (OHP), Back Squat, Bench Press — each on a **fixed
weekday** (§2.2), never a rotation.

**Anchored secondary lanes:** the `db_row` lane (OHP day) holds **BB Row**; the `pendlay_row`
lane (bench day) holds **Pull-ups** (two-mode — see below and §4). These are lane keys, not
occupant names — the carry-key discipline (`carry_<day>` — "reassigning an implement doesn't
move the key," generalised by `engine/program.ts`) applies to the anchor lanes themselves, so
a lane's occupant can change without ever touching the schema or the stored anchor.

**Pull-ups are two-mode:** a zero/empty `pendlay_row` anchor for the cycle renders bodyweight
cluster targets (10/8/6 by difficulty, logged as e.g. "6+4" in `pullup_cluster`); any weight
renders the full ladder cascade (§4).

There is no per-lift rounding — every derived load rounds at 2.5 kg (§3).

### 2.2 Week & session structure — fixed days, no rotation
**Mon = Squat · Tue = Bench · Thu = Deadlift · Fri = OHP · Wed/Sat/Sun = rest.** The day → lift
mapping is fixed, not a rotating slot — difficulty is decided by a *separate* weekly rotation
per lift (§2.5).

Every lifting session runs, in order:
```
I. Primer → II. Giant Block → III. Volume Block → IV. Capability Block → V. Cooldown
```
- **Primer** (§2.3) — no load, no RPE: a bodyweight holds+circuit sequence (same for all four
  days), then day-typed band activation, then the barbell build-up into the Giant block
  (`WU_PCT`/`WU_REPS` 8-5-3-2 @ ~40/55/70/85%).
- **Giant Block** (§2.4) — 4 rounds: the main lift's ladder, the day's anchored secondary
  where it has one, the day's bodyweight accessory. Adherence logged once per session via
  the completion control (§2.11).
- **Volume Block** (§2.6) — genuinely independent difficulty from the Giant block's (§2.5) —
  2 sets, reps by ITS OWN difficulty, 80% of the day's top for that difficulty. Absent
  entirely on C3 week 4 (no Volume block that week) and on any deload (§2.9).
- **Capability Block** (§2.7) — content is a property of the CYCLE, not the week or
  session: Hypertrophy (C1), Oly (C2), Engine WOD (C3). Absent entirely on any deload.
- **Cooldown** (§2.13) — a fixed stretch sequence, same for all four days and every cycle,
  including deload weeks (unlike Volume/Capability, a cooldown routine applies regardless of
  what the session's lifting content was).

### 2.3 Primer block
- **Bodyweight holds + circuit — same sequence for all four days, no day-typing** (2026-08-10;
  previously a day-typed 1-2-3 ascending-rep ramp, replaced entirely except the band step):
  Deep Squat Hold (30–60s) → Downward Dog (30–60s) → then 2 rounds of: Cossack Squats
  (5/side) → 90/90 Switches (5/side) → Kneeling T-Spine Rotation (6/side) → Dolphin Press
  (6 reps) → Dead Bugs (6/side).
- **Band activation, day-typed** (unchanged, and the only part of the old Primer that stayed
  day-typed) **— runs AFTER the bodyweight section, before the barbell build-up:** Crossover
  Symmetry (Bench/OHP — "upper") · Hip Halo (Squat/Deadlift — "lower").
- Then the barbell build-up (+ the secondary's own build-up when it's weighted) — see §2.2.
- No RPE, no numeric log entries — checkbox-style completion only (every hold/circuit
  movement individually, the band item, one aggregate "barbell build-up done" checkbox, one
  more for the secondary's build-up when it applies). Which items are checked is local UI
  state, never persisted per-item; `sessions.primer_done` (a single boolean) is the one thing
  that's actually saved — set once every item is checked and the Today card is marked Done
  (§8). `GIANT2_PRIMER_HOLDS`/`GIANT2_PRIMER_CIRCUIT`/`GIANT2_PRIMER_BAND`, constants.ts.

### 2.4 Giant Block composition (per day)
| Day | Giant Block contents |
|-----|----------------------|
| Squat | Squat · Ab-Roll |
| Bench | Bench · **Pull-ups** (two-mode, §2.1) · Leg Raises |
| Deadlift | Deadlift · Ab-Roll |
| OHP | OHP · **BB Row** · Leg Raises |

Squat and Deadlift train alone (no secondary). **The secondary's reps are fixed by
difficulty — Hard 8 · Medium 9 · Light 10** (only the main lift's reps descend across the four
sets). Ab-Roll and Leg Raises are bodyweight, Setup-configurable rep targets
(`giant_accessory_config`, default 10 / 12).

**The main lift's 4-set ladder** — reps differentiate the days, the load ladder is uniform
(single-anchor model, §3): each set is 85 / 90 / 95 / 100% of that day's Giant-difficulty top
(§2.5).
| Difficulty | Set 1 | Set 2 | Set 3 | Set 4 |
|-----------|-------|-------|-------|-------|
| Hard | 8 @ 85% | 6 @ 90% | 4 @ 95% | 2 @ 100% |
| Medium | 9 @ 85% | 7 @ 90% | 5 @ 95% | 3 @ 100% |
| Light | 10 @ 85% | 8 @ 90% | 6 @ 95% | 4 @ 100% |

### 2.5 Two independent difficulties per session
**Giant difficulty — varies by lift AND week within the cycle** (`sessions.difficulty`).
Weeks 1–3 of every cycle repeat the SAME rotation:
| Week | Squat | Bench | Deadlift | OHP |
|------|-------|-------|----------|-----|
| W1 | Hard | Medium | Light | Hard |
| W2 | Medium | Light | Hard | Medium |
| W3 | Light | Hard | Medium | Light |

Each lift touches Hard/Medium/Light exactly once across the three weeks; one tier doubles up
each week. **This rotation is athlete-editable in Setup** (`giant2_giant_difficulty`,
capacity-config-style merge — the table above is the code-side *default*, merged under
whatever the athlete has stored). **Week 4 of every cycle collapses to ONE difficulty for all
four lifts, ignoring the table above and any Setup override** — Light in C1, Medium in C2,
Hard in C3 (`GIANT2_WEEK4_DIFFICULTY`, a pure function of the cycle, never stored).

**Volume difficulty — fixed for an entire cycle, independent of the Giant difficulty and of
week** (`sessions.volume_difficulty`): Light throughout C1, Medium throughout C2, Hard
throughout C3 — **except C3 week 4, where the Volume block doesn't run at all** (null, not
"unset" — a semi-peak week; Giant and Capability still run Hard that week).

### 2.6 Volume block
2 sets, reps by the Volume difficulty (§2.5) — `SCHEMES[volumeDifficulty].vol`, the exact
6/8/10 numbers the spec calls for — at 80% of the day's top **for that difficulty** (computed
off the same per-cycle cascade as the Giant block, just indexed by the other difficulty). The
secondary joins at the same rate off its own day top. Bodyweight-mode Pull-ups render
prescription-only in the Volume block (no separate cluster-log field from the Giant block's —
a deliberate trim).

Absent entirely (not rendered) on C3 week 4 (`volumeDifficulty` null) and on ANY deload,
reactive or scheduled — both the Volume and Capability blocks gate on `!isDeload` explicitly,
not just on the schedule being null, so a reactive mid-cycle deload suppresses them correctly
too.

### 2.7 Capability block — content by cycle
The block's *shape itself* varies by cycle — decided purely by `GIANT2_CAPABILITY_BY_CYCLE`
(cycle → program), never by week or session. `engine/capability-record.ts`
(`capabilityRecordFor`) is the single source of truth for "what the Capability block contains
today" — cycle-dispatched and, for Hypertrophy/Oly, joined against `hypertrophy_logs`/
`oly_logs`; both the live Capability card and `sessionSummary()` (Copy Session Summary) read
from it rather than each independently re-deciding the block's content (the two are still
separate consumers — the live card needs editable draft state this pure record doesn't carry,
so it calls `resolveItems`/`groupBySuperset` directly — but both are built on the same
resolver, `engine/movements.ts`, so there's one place that knows which exercises a day has):

**C1 — Hypertrophy.** Day-specific accessory list, 3 sets fixed regardless of week, logged
**per SET** (weight × reps × an OPTIONAL RPE per set, `hypertrophy_logs` — one row per
movement PER SET per session, `unique(session_id, movement_id, set_number)`; RPE is a normal
field like Giant/Volume/Carry's, just never required for the card's Done button). Certain
pairs are supersets (alternate between the two rather than straight sequential sets) per a generic,
nullable `movements.superset_group` column (not scoped to Hypertrophy — any future block can
reuse it); a movement can also be flagged `weight_optional` (a real boolean column, not the
free-text `note`) when only reps matter — Hip/Back Extension is the current example:
| Day | Exercises | Supersets |
|---|---|---|
| Squat | Walking Lunge · Lying Hamstring Curl · Hip/Back Extension (3×15, weight optional) · Standing Calf Raise (3×15) | Walking Lunge+Lying Hamstring Curl · Hip/Back Ext+Standing Calf Raise |
| Bench | Seated DB Press · One-Arm Row · Bicep Curl (3×15) · Skull Crusher (3×15) · Serratus Anterior Raise | Seated DB Press+One-Arm Row · Bicep Curl+Skull Crusher |
| Deadlift | Front-Foot-Elevated Split Squat · Hip Thrust (3×15) · Leg Extension (3×15) | Hip Thrust+Leg Extension |
| OHP | Flat DB Bench · Lat Pulldown (supinated) · Lateral Raise (3×15) · Rope Face Pull (seated, to top of head, 3×15) | Flat DB Bench+Lat Pulldown · Lateral Raise+Rope Face Pull |

**"Last logged" ghost placeholders** (2026-08-19, Hypertrophy only — Oly's quality mark and
Carries' flat RPE-6 don't have the same progression-reference use case): an empty Load field
shows the last logged weight for that EXACT exercise + set number (Set 1 never shows Set 2's
history) as native `placeholder` text, grey/italic via a global `::placeholder` rule — never
part of the field's real value, so it can't be saved or misread as filled. RPE (a controlled
`<select>`, no native placeholder concept) gets a non-interactive absolute-positioned overlay
showing the same ghost styling while its real bound value is still `''`; the select's actual
value is the single source of truth for "committed" — there's no separate flag, and no
inference from "does the shown number match the ghost" (a session that deliberately repeats
last time's RPE must still read as committed, not empty). `lastHypertrophySetLog`
(`capability-record.ts`) does the lookup, ranked by `updated_at` — reusing the SAME
macro-scoped `hypertrophyLogs` array already threaded through the block (a new
`hypertrophyHistory` prop carries the unfiltered-by-session view of it), never a second query.

**Superset display (a day can have 2+ pairs):** each pair renders in its own full bordered box
(rounded corners, not just a left-edge accent line — a boundary reads unambiguously at a glance,
a single line doesn't once two pairs sit back to back) with real vertical spacing between boxes.
The box border and the pair's inner vertical accent line always share one color, keyed by the
pair's index among that day's superset pairs specifically (`theme.ts`'s `supersetAccent`,
`SUPERSET_ACCENTS = [gold, purple]`, cycling if a day ever has a 3rd pair) — color is scanning
reinforcement on top of the box/spacing, never the only signal. Purple (`C.purple`, "chart alt
series" in the brand guide) is the deliberate non-semantic accent: green/red/blue are reserved
difficulty/state meanings elsewhere in the app, so reusing one here would misread as good/bad
next to workout numbers.

**C2 — Oly.** Technical work, loaded to a per-lane "technical ceiling found by feel" — **not**
a percentage of a tested max, and **not RPE** — logged with a **quality mark** instead
(`oly_logs.quality`: Q3 every rep identical / Q2 minor faults, self-corrected / Q1 position
broke). Two consecutive Q3 sessions in a lane steps the load up (2.5 kg snatch family, 5 kg
clean/jerk family); two consecutive Q1 steps it down — computed from history, not stored as
separate state. **Position wave:** weeks 1–2 of the cycle hang from the power position (above
the knee), weeks 3–4 from the knee.
| Day | Primer (3×5, unloaded) | Complex (4–5 × 2+1) | Third (4–5 × 3, upper only) |
|---|---|---|---|
| Squat | Snatch Balance + OHS | Hang Snatch + Full Snatch | — |
| Bench | Tall Clean | Hang Power Clean + Power Clean | Clean + Front Squat (1+2) |
| Deadlift | Muscle Snatch | Snatch High Pull + Hang Power Snatch | — |
| OHP | Tall Jerk | Push Press + Jerk | Split Jerk |

**C3 — Engine WOD** (2026-08-13, replaced isolated carry logging). 5 rounds of {carry segment,
machine segment, rest}, one `wod_logs` row per round (`unique(session_id, round_number)`, no
`movement_id` — the carry implement is resolved from `day_type` alone, same as before, not a
per-day exercise choice like Hypertrophy's). Two day-type templates (`GIANT2_DAY_TYPE`):
- **Carry segment** — the day's implement (§2.10) unchanged from the old carries block, `:45`
  continuous, guided at a flat **RPE 6** (`GIANT2_CARRY_RPE_GUIDANCE`) — copy/guidance only, not
  an enforced value; `wod_logs.carry_rpe` is optional, logged per round (the segment repeats
  each round, not once for the whole WOD). No distance/load field in this block — the old
  carry's distance-before-weight progression doesn't apply to a fixed-duration segment.
- **Machine segment** — Row or Ski Erg (lower day: Squat/Deadlift, athlete's choice) or Bike Erg
  (upper day: Bench/OHP, no choice). `:60`, pushed sustainably hard, not a max sprint.
  `wod_logs.machine_calories` is the required field — the round's whole point, and the sum
  across a session's rounds is the primary improvement marker (surfaced in Data/Trends and the
  session summary). `machine_type` is a per-round *column* for schema generality, but in
  practice one selector picks it for the whole session (equipment doesn't change mid-WOD) —
  UI is 5 rows of {round #, calories, optional carry RPE}, not a per-round machine choice.
- **Rest between rounds** — by week within C3, tapering weeks 1–3 then easing back on week 4
  (the collapsed-Hard week, `GIANT2_WEEK4_DIFFICULTY`) rather than stacking two hard variables:
  `GIANT2_WOD_REST_SEC_BY_WEEK = { 1: 75, 2: 65, 3: 55, 4: 75 }` seconds.

`sessions.wod_skipped`/`wod_skip_reason` (same shape as the old `carry_skipped`/
`carry_skip_reason` they replaced) gate the whole WOD as a unit, not per-round — drives deload
signal S3.

**Movement identity vs. resolver:** the movement library (`movements`) holds every
Primer/Hypertrophy/Oly/Giant-Block movement, and the program is seeded as **program version 2**
in the `program_versions`/`program_slots` system (§9) — but the session VIEWS still render off
hardcoded `GIANT2_*` constants, not `resolveProgram`. Wiring a live session view to the resolver
remains a possible future step, not something the build has done yet.

One narrower piece of this IS wired, deliberately scoped smaller than the resolver above:
`resolveItems` (`engine/movements.ts`) reads a Hypertrophy movement's **pairing
(`supersetGroup`) and `weightOptional`** off the athlete's own library row when one exists,
falling back to the code-side seed only for a key with no row yet — so those two fields are
DB-authoritative, not hardcoded. Everything else about a Capability exercise (its name, which
exercises exist on which day, rep targets, note copy) is still 100% code-driven; `Setup.tsx`'s
Movement Library form doesn't expose editing pairing/weight-optional yet, so today this only
matters if those columns are changed directly (e.g. a future Setup form field, or by hand).

### 2.8 The 13-week macrocycle
Three 4-week mesocycles (C1/C2/C3) + one deload week, extendable by the athlete to a 14-week
macro (`deload_extended`). 4 session days/week (Mon/Tue/Thu/Fri).

### 2.9 End-of-macro deload (the final week — week 13, or 13–14 when extended)
A real, loggable session (not a static card). Fixed day→lift still applies (Mon is always
Squat, deload or not): Giant block only, ~70% of the **last training cycle's (C3) Hard
anchor** (a dedicated reference-cycle lookup, since the deload week itself has no cycle of its
own — `cycle`/`week` are stored `null`), fixed **Hard** rep scheme (no H/M/L that week — `'hard'`
is stored purely as the scheme lookup). No Volume block, no Capability block (§2.6/§2.7's
`!isDeload` gates). Reactive mid-cycle deloads (§5) share the same ~70%/no-Volume/no-Capability
shape.

### 2.10 Carries (per day, the Engine WOD's carry segment)
**Squat → Sandbag Bear Hug · Bench → Suitcase · Deadlift → Farmers · OHP → Overhead.** Same
`carry_<day>` keys, Setup-configurable per-cycle weights, Suitcase 50 kg seed default. Only
consumed by the Engine WOD (§2.7), which only renders in C3.

### 2.11 Giant-block completion (adherence)
The top set keeps full RPE + bar-speed logging; the rest of the block is captured by a single
completion control (default "completed as prescribed," or a categorical reason),
`sessions.block_completion`, driving deload signal S7 (§5).

### 2.12 REMOVED — do not reintroduce
- **Lift rotation.** Day → lift is fixed (§2.2); there is no weekly-realigning slot table.
- **A single shared difficulty per session.** Two independent fields instead (§2.5).
- **A macro-type selector.** There is exactly one program; nothing branches on macro type,
  and nothing should.
- **A timed conditioning ("Capacity") block, testing weeks, a dips main lift, and the Giant Run
  companion program.** None of these have a code path, schema, or UI left anywhere in the app —
  see `specification.md`'s 2026-08-10 entry for what removed them and why.

### 2.13 Cooldown block (2026-08-10)
A fixed stretch sequence, no day-typing, runs after Capability — the fifth and last card in
the session sequence. Same content every day and every cycle, **including deload weeks**
(unlike Volume/Capability, which don't apply on deload — a cooldown routine is relevant
regardless of what the lifting content was that day):
1. 90° Leg Raise Laydown — 60s
2. Couch Stretch — 2 min/side
3. Pigeon Pose — 2 min/side
4. Child's Pose — 90s each: middle, left, right
5. Standing Fold — 60s

No RPE, no numeric log entries — checkbox-style completion only, the exact same shape as
Primer (§2.3): which items are checked is local UI state, never persisted per-item;
`sessions.cooldown_done` (a single boolean) is the one thing that's actually saved.
**Optional, not required** — nothing in the app treats "every card done" as a session-level
completion gate (session end is governed by the session timer alone, independent of card
completion), and Cooldown doesn't change that; a person can close the app after Capability
with no consequence. Not represented in `sessionSummary()` (Copy Session Summary) or anywhere
else outside the app, same as Primer — both are pure checklists with no loggable numeric data,
unlike Hypertrophy/Oly, which DO have real per-exercise data and are rendered in full (§2.7,
`engine/capability-record.ts` — the single source of truth `sessionSummary()` reads from for
the Capability section, rather than deciding it inline). `GIANT2_COOLDOWN`, constants.ts.

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
- **Six anchor lanes: Squat / Bench / Deadlift / OHP / `db_row` / `pendlay_row`**
  (`ANCHOR_LIFTS`) — `db_row` holds BB Row, `pendlay_row` holds Pull-ups (§2.1).

**Two-mode Pull-ups (`pendlay_row` lane):** decided purely by the cycle's anchor for that lane
(0/empty = bodyweight cluster mode with 10/8/6 targets and `pullup_cluster` logging; any
weight = the full 2.5 kg cascade).

A logged session reads its own **(macro, cycle)** anchor and recomputes — essential for correct
retroactive logging (the bug that motivated the original rebuild: a C1 session must not use
C3's heavier loads). The anchor is editable any time, up or down; the whole cascade recomputes
live everywhere, and **only the anchor is stored** (the computed grid is never persisted, so
nothing goes stale). Solved relationally — see §9.

- All six anchors use the **identical** cascade off their Hard anchor — build-up, Giant Block
  ladder, and Volume all derive from the movement's OWN anchor, never from the day's main lift.
- **Carries** (§2.10): per-cycle, a single recorded weight each — not part of the anchor
  cascade. The Giant Block's bodyweight accessories carry no load at all (§2.4).
- **Start-of-macro rule:** a new macro's C1 anchor = the previous macro's C3 anchor;
  "start next macro" carries the anchor lanes and carry items forward.

---

## 4. Pull-ups — two-mode lift

The bench-day secondary (`pendlay_row` lane, §2.1, §2.4):
- **Bodyweight mode:** progress is the **cluster shape on the final Giant Block round** —
  targets 10/8/6 reps by difficulty, logged like `6+4` → `8+2` → `10` (`pullup_cluster`).
- **Weighted mode:** any anchor > 0 for the cycle switches to the full standard 2.5 kg
  cascade — same ladder as any other anchored lift.
- The mode flips purely on the per-cycle anchor value (`liftMode`) — no separate flag.

There is no dips lift and no dips-day pairing anywhere in the app — deadlift and squat both
train alone (§2.4).

---

## 5. The reactive deload rule

An honest fatigue ego-check. Watches objective signals across a training week.

**Signals (auto-detected):**
- **S1** — any day, top set logged at **R9.5+** (past the intended ceiling on any difficulty).
- **S2** — volume block incomplete (cut reps / dropped set). Never evaluates a session with no
  Volume block at all (C3 week 4, `volumeDifficulty` null, or any deload) — an explicit domain
  rule in `deload-rule.ts` rather than left as an implicit consequence of which checkbox
  happens to render.
- **S3** — Engine WOD skipped due to **fatigue** (not schedule). `wodSkipped`/`wodSkipReason`
  are only ever set where the Engine WOD UI renders (C3), so the signal is already quiet outside
  C3 structurally.
- **S5** — bar speed ↓ on the top set in **2+ sessions** within the week (any lifts).
- **S7** — **giant block not completed as prescribed** (any non-"completed" state of the
  completion control, §2.11).

Signals are computed, never stored — the numbering has a gap (no S4, no S6) because two
earlier signals were retired along with the eras that produced them; the surviving five keep
their original ids rather than being renumbered.

**Trigger:** fires when there are **3+ total signal occurrences spanning at least 2 different
sessions** in the week. (Three occurrences = severity; two sessions = it's a pattern, not one
bad day. One catastrophic single day never fires it.)

**Behaviour:** the rule **advises, the athlete decides** — it recommends a deload via a confirm
prompt; the athlete taps Apply. Never auto-forced.

**Deload week (when applied):** Giant block only at ~70% off the last training cycle's Hard
anchor, hard scheme, no Volume block, no Capability block (§2.9) — whether the deload is
scheduled or reactive/mid-cycle, both blocks gate on the same `isDeload` flag.

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

**Anchor (example):** the live macro (M3) started **Monday 10 August 2026**. A macro is 13 weeks
(14 when the deload is extended). A new macro rolls forward by the completed macro's total
weeks and carries C3 weights into the new C1.

**Computation (verified correct; WEEKS-DRIVEN — every engine entry point takes the macro's
`{ weeks, deloadExtended }`):**
```
daysSinceStart = floor((today - mondayOf(startDate)) / 1 day)
weekIndex = floor(daysSinceStart / 7)        // 0-based internally; ALWAYS display 1-based
totalWeeks = weeks + (deloadExtended ? 1 : 0)
weekType:  weekIndex >= weeks-1 ? 'deload' : 'training'
meso (training only) = floor(weekIndex / 4) + 1   // 1..3
weekInMeso = (weekIndex % 4) + 1                   // 1..4

session days = Mon/Tue/Thu/Fri (GIANT2_SESSION_DAYS)
dayType = GIANT2_DAY_LIFT[weekday]                                    // fixed, no rotation
difficulty = weekInMeso===4 ? GIANT2_WEEK4_DIFFICULTY[meso]           // collapses per cycle
           : giant2GiantDifficultyFor(meso, weekInMeso, dayType, athleteConfig)
volumeDifficulty = (meso===3 && weekInMeso===4) ? null : GIANT2_VOLUME_DIFFICULTY_BY_CYCLE[meso]
```
- **The deload week still computes a `dayType`** (fixed day→lift applies deload or not) — only
  the H/M/L difficulty is absent that week (§2.9).
- Local date (Brașov, Romania timezone) — compute "today" locally, never UTC, to avoid
  date-boundary bugs.
- Non-session days show the next scheduled session ("Rest Day").
- Before start → "upcoming"; past the macro's total weeks → "macro complete, start next macro."

**Important implementation note:** an early version caused infinite recursion because
`computePosition` and `nextSessionFrom` called each other. The fix was to extract a `corePosition`
helper that never computes the next session, and have both callers use it. Preserve that
separation. (Lives in `src/engine/date-engine.ts`; a known-correct output is unit-tested: 10 Aug
2026 (a Monday macro start) → C1 W1, Mon = Squat Hard / Volume Light.)

---

## 7. The calendar view (Option A)

A **program-structured grid** (NOT a literal month calendar): one row per program week
(13; 14 when the deload is extended), each with **4 cells (Mon/Tue/Thu/Fri)**. The grid itself
is CSS `repeat(row.cells.length, 1fr)`, never a hardcoded column count. Each cell shows:
- The real calendar date (past, today, and future all dated).
- Lift + difficulty (or "Deload" — the deload week still shows a lift, §2.9).
- State by colour: logged / missed / today / upcoming / break.
- Top set once logged.

Tapping a cell opens a **full logging modal** (same fields as live logging) to log, edit, delete,
or **mark the day as a break** (day-level granularity — breaks can straddle weeks). Calendar
auto-scrolls to the current week on open. Break days are exempt from "missed" status and from
deload signals. Deload cells open a real session editor (Giant block only, ~70%).

---

## 8. Current state

The full rebuild is shipped and deployed to GitHub Pages
(https://zsolt17.github.io/giant-programV2/). Capabilities, in domain terms:

- **Today** — date-computed position; the session renders as five independent expandable
  `SessionCard`s (A. Primer / B. Giant / C. Volume / D. Capability / E. Cooldown, always this
  order — only D's label/content changes by cycle; E always renders, incl. on deload). Pre-start
  all five are expanded and locked; Start Session collapses them and auto-expands Primer; each
  card's Done button (disabled until that block's own required fields are filled,
  `engine/session-progress.ts` — Cooldown is optional, so nothing downstream gates on it)
  collapses it to a `✓ Done` summary and auto-expands the next card in sequence; a done card
  can be reopened to fix a mislogged entry without disturbing whichever card is currently
  active. The deload week is a real logger too (§2.9). Bodyweight accessory, Volume off its
  own independent difficulty, Capability dispatched by cycle — same content as before, just
  card-wrapped. Optional session timer unchanged.
- **Calendar** — the program-week × 4-column grid (§7); log/edit/delete any session; mark
  breaks. The session modal uses the same five cards in a simpler free-toggle mode (no lock,
  no sequence — every card starts expanded, headers freely open/close regardless of done state).
- **History** — latest top sets (all four lifts), recent-session feed, pull-up cluster trend.
- **Deload** — per-week fatigue signals + reactive-deload recommend/apply (§5).
- **Setup** — per-cycle (C1/C2/C3) Hard-top anchors for all six lanes (Squat/Bench/Deadlift/OHP
  + `db_row`/`pendlay_row`, labelled BB Row/Pull-ups) + Giant Block accessory rep targets (§2.4)
  + the weekly Giant-difficulty rotation (§2.5) + per-cycle carries (§2.10), macro anchor,
  macro picker, and "start next macro" archiving (C3→C1).
- **Per-cycle working weights** — the motivating fix; a session reads its own `(macro, cycle)` grid.
- **Multi-macro archiving** — roll into a new macro carrying C3 weights forward; prior macros stay viewable.
- **Trends** — Lifts (DL/OHP/Squat/Bench) · WOD (Engine WOD total calories, by day-type
  template) · Attendance (4-column grid) · Session views across a macro range. No Hypertrophy/Oly
  trend views yet (their CSV export exists, not a Trends visualization).
- **Data export / share** — four CSVs (sessions incl. `volume_difficulty`, Hypertrophy logs,
  Oly logs, Engine WOD logs) and per-session plain-text summaries.
- **Recovery → Tendon Health** (§12) — joint isometric-loading protocols with phase-based dosing,
  per-tendon hold timers, and light per-day "done" logging. Macro-independent.
- **Single-user auth** (Supabase + Row Level Security), installable PWA with offline logging.

---

## 9. Supabase schema (implemented)

Single-user app, but it uses Supabase Auth + Row Level Security so the data is private to the one
account. Canonical schema lives in `supabase/migrations/`. Migrations `0024_giant2_only_cleanup.sql`
and `0025_prune_empty_secondary_lanes.sql` (2026-08-10) retired everything specific to the app's
two earlier programs — dropped tables (`capacity_logs`, `capacity_config`, `capacity_settings`,
`runs`, `run_targets`, `testing_results`), dropped columns (`sessions.pair_weight`,
`macros.ref_pace_s`), narrowed several CHECK constraints to the surviving value sets, and pruned
retired `movements`/`program_slots` rows. `0026_movement_superset_group.sql` added
`movements.superset_group`; `0027_today_cards.sql` added `sessions.primer_done` and
`movements.weight_optional`, and moved `hypertrophy_logs` to one row per (session, movement,
SET) — all three land the Today-tab card redesign (§8); `0028_hypertrophy_rpe.sql` added
`hypertrophy_logs.rpe` (optional, correcting 0027's own misreading of the reference wireframe
— see `specification.md`); `0029_cooldown.sql` added `sessions.cooldown_done` for the fifth
card (§2.13). Earlier migrations (`0001`–`0025`) built up the schema this left
behind; see `specification.md` for that dated history. See `supabase/MIGRATIONS.md` for how
migrations are applied and the DB kept reproducible. Tables:

```sql
-- Macros: each macrocycle the athlete runs
macros (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  number        int not null,              -- M1, M2, M3...
  start_date    date not null,             -- anchored to a Monday
  weeks         int not null default 13,   -- 12 training + 1 deload
  status        text not null default 'active',  -- active | completed
  deload_extended boolean default false,   -- athlete added a second identical deload week (§2.8)
  created_at    timestamptz default now()
)

-- Per-cycle Hard top set (the ANCHOR) for the main lifts. Medium/Light day tops and
-- the within-day Giant Block ladder are COMPUTED in the engine (§3), never stored.
working_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,              -- 1, 2, 3
  lift          text not null,             -- deadlift | ohp | squat | bench | db_row | pendlay_row
                                           --   (db_row/pendlay_row hold BB Row/Pull-ups — same
                                           --   LANES, only the display resolves the occupant)
  hard          numeric,                   -- the Hard top set (anchor); everything cascades off it
  unique (macro_id, cycle, lift)
)

-- Per-cycle single-value recorded loads: the carries
accessory_weights (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid references macros not null,
  cycle         int not null,
  item          text not null,             -- carry_deadlift | carry_ohp | carry_squat | carry_bench
  weight        numeric,                    -- recorded per-cycle weight; not engine-cascaded
  unique (macro_id, cycle, item)
)

-- Every logged session (training or deload)
sessions (
  id            text primary key,          -- "{date}-{lift}", e.g. "2026-08-10-squat"
                                           --   (day->lift is fixed, no rotation, so date+lift is unique)
  macro_id      uuid references macros not null,
  date          date not null,             -- the SCHEDULED slot date (not necessarily the physical day)
  cycle         int,                       -- null for deload weeks
  week          int,                       -- week within meso (1..4), null for deload
  week_type     text not null,             -- training | deload
  day_type      text,                      -- deadlift | ohp | squat | bench
  difficulty    text,                      -- hard | medium | light — the GIANT block's difficulty
  volume_difficulty text,                  -- the VOLUME block's own, independent difficulty;
                                           --   null on any session with no Volume block (C3 week 4, deload)
  -- top set
  top_reps      int,
  top_weight    numeric,
  rpe           text,                      -- "R6".."R10"
  bar_speed     text,                      -- up | normal | down
  -- Giant Block per-round cardio calories, ordered [R1..R4]
  cardio_cals   int[],
  -- Giant Block adherence (categorical): completed | failed_heavy | stopped_fatigue |
  -- stopped_form | reduced_weight | cut_time. Null = treated as completed.
  block_completion text,
  -- volume
  vol_done      boolean default true,
  vol_rpe       text,
  vol_speed     text,
  -- bodyweight-mode Pull-ups final-round cluster (bench day), e.g. "6+4"
  pullup_cluster text,
  -- Today's Primer card: the checklist itself is UI-only local state (never
  -- persisted per-item); this single flag is what the card's Done saves.
  primer_done   boolean not null default false,
  -- Engine WOD (C3, §2.7) skip — gates the whole 5-round WOD as a unit, not
  -- per-round (per-round detail lives in wod_logs below). Same shape as the
  -- old carry_skipped/carry_skip_reason it replaced (2026-08-13).
  wod_skipped   boolean not null default false,
  wod_skip_reason text,                    -- fatigue | schedule
  -- Today's Cooldown card (§2.13) — same shape as primer_done above.
  cooldown_done boolean not null default false,
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
  week_key      text not null,             -- "M3C1W2"
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

-- Recovery > Tendon Health: one isometric-loading protocol per joint.
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

-- Giant Block bodyweight-accessory rep targets. The movements + default reps are
-- app content, only the athlete's edited target is stored, defaults are merged
-- on read, and unknown/retired keys are ignored. Prescription config — NOT a
-- per-session log.
giant_accessory_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  movement_key  text not null,             -- ab_rollout | leg_raises
  rep_target    int,                       -- null = the movement's app default
  unique (user_id, movement_key)
)

-- The athlete's Setup override for the weekly Giant-difficulty rotation (§2.5) —
-- the code default merges under whatever's stored here. Week 4's collapse is
-- NEVER stored (a pure function of the cycle).
giant2_giant_difficulty (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  week_in_cycle int not null,              -- 1 | 2 | 3
  lift          text not null,             -- deadlift | ohp | squat | bench
  difficulty    text not null,             -- hard | medium | light
  unique (user_id, week_in_cycle, lift)
)

-- Capability block — C1 Hypertrophy. One row PER MOVEMENT PER SET per session
-- (GIANT2_HYPERTROPHY_SETS, currently 3). RPE is a normal, OPTIONAL per-set
-- field (text, "R6".."R10" — same scale as sessions.rpe/vol_rpe/wod_logs.carry_rpe)
-- — never part of the Done-readiness check (engine/session-progress.ts).
hypertrophy_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    text references sessions on delete cascade not null,
  movement_id   uuid references movements not null,
  set_number    int not null default 1,       -- 1..GIANT2_HYPERTROPHY_SETS, check (set_number > 0)
  weight        numeric,
  reps_done     int,
  rpe           text,                         -- "R6".."R10" | null (unset) — optional
  notes         text,
  updated_at    timestamptz default now(),
  unique (session_id, movement_id, set_number)
)

-- Capability block — C2 Oly. Same per-movement shape as hypertrophy_logs, but
-- logs a QUALITY MARK (Q1/Q2/Q3), never RPE.
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

-- Capability block — C3 Engine WOD (2026-08-13, replaced isolated carry
-- logging). One row PER ROUND (1..GIANT2_WOD_ROUNDS, currently 5) per
-- session — no movement_id, the carry implement is resolved from the
-- session's day_type alone (DAY_META), never a per-day choice.
-- machine_calories is the required field; carry_rpe is optional, same scale
-- as every other RPE field. machine_type is stored per round for schema
-- generality, but in practice one UI selector picks it for the whole
-- session (Row/Ski on lower days, always Bike on upper — no real choice).
wod_logs (
  id                uuid primary key default gen_random_uuid(),
  session_id        text references sessions on delete cascade not null,
  round_number      int not null,             -- 1..GIANT2_WOD_ROUNDS, check (round_number between 1 and 5)
  machine_type      text not null,            -- row | ski | bike
  machine_calories  numeric,
  carry_rpe         text,                     -- "R6".."R10" | null (unset) — optional
  updated_at        timestamptz default now(),
  unique (session_id, round_number)
)

-- The movement library: which exercise occupies which slot, and its defaults.
-- Slot REGISTRY + contracts are code (engine/program.ts); only the occupants
-- are data (program_slots rows pointing at movements, versioned by
-- program_versions). Still unwired from any live session view (§2.7).
movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  key           text not null,             -- stable slug; immutable after create
  name          text not null,
  load_type     text not null,             -- anchored | recorded | bodyweight | none
  count_type    text not null,             -- reps | reps_per_side | time_seconds | calories | distance
  default_reps  numeric,
  rep_unit      text,
  note          text,
  archived      boolean not null default false,
  -- Pairs two movements as a superset (alternate between them) when both
  -- share a non-null value on the same day. Generic — not tied to any one
  -- block/cycle, so a future revision can reuse it without a new migration.
  superset_group text,
  -- True = a required-field check may skip this movement's weight (reps are
  -- still required) — e.g. Hip/Back Extension.
  weight_optional boolean not null default false,
  created_at    timestamptz default now(),
  unique (user_id, key)
)

program_versions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null default auth.uid(),
  number          int not null,             -- 2 = Giant 2.0 (the only live version)
  effective_from  date not null,
  note            text,
  created_at      timestamptz default now(),
  unique (user_id, number),
  unique (user_id, effective_from)
)

program_slots (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid references program_versions on delete cascade not null,
  slot_key      text not null,             -- from SLOT_CONTRACTS (code-owned)
  order_index   int not null default 0,
  movement_id   uuid references movements, -- null = the lane is deliberately empty
  reps          numeric,
  rounds        int,
  optional      boolean not null default false,
  unique (version_id, slot_key, order_index)
)
```

Notes:
- `working_weights` + `accessory_weights` solve the per-cycle problem relationally — a session
  reads weights for its own `(macro, cycle)`.
- The data layer stays behind one module so the UI never talks to Supabase directly (see
  `CONVENTIONS.md` §1, §3).

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

- **The 2026-08-10 cleanup** retired both earlier programs (Giant v7, then GiantFit) entirely —
  code, schema, and logged data. Nothing from either era is reachable in the app any more,
  including Giant Run (removed outright, not relocated — a full-removal decision made and
  approved during that cleanup, rather than the narrower "just move its nav entry" plan floated
  beforehand). A full schema+data dump was taken before the deletion ran. For the phase-by-phase
  record, see `specification.md`'s 2026-08-10 entry; the two migrations are `0024`/`0025`
  (§9). This doc describes only what survived.
- **Working weights = a single Hard-top anchor per lift per cycle.** Medium (×0.95) / Light
  (×0.90) day tops, the uniform 85/90/95/100 Giant Block ladder, and 80% volume all compute off
  it (rounded 2.5 kg); only the anchor is stored.
- Position is date-computed, never manual. Firm.
- Strict-date model: missed sessions stay missed; you rejoin at the calendar's position. No
  flexible "attach a late session to an earlier slot" logic — you just edit the scheduled slot
  in the calendar.
- Stored session `date` = the scheduled slot date, not the physical lift day.
- **Carries:** DL = farmer 60/hand, OHP = overhead 2×20, Squat = sandbag bear hug 68, Bench =
  suitcase 50/hand. Stored per cycle keyed by day (`carry_<day>`), so the keys are stable;
  logged history untouched by any reassignment.
- **Giant-block completion:** adherence logged as one categorical control (§2.11), driving
  deload signal S7.
- **Pull-ups (bench-day secondary) are two-mode**, flipping between bodyweight (cluster) and
  weighted (full cascade) purely on the cycle's anchor value (§3, §4) — no toggle.
- Carries (now the Engine WOD's carry segment) are accessory/reward effort, ~RPE 6, never pushed.
- Reactive deload: advise-and-confirm, never auto-forced.
- Keep the navy/gold design identity.
- Backend is Supabase + RLS.

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

---

## 13. Related documents

- **`The_Giant_Program_v7_Book`** (`.pdf` / `.docx`) — the original Giant Program's book, kept in
  a separate documentation folder (`The Giant Program/`), **not** in this code repo. Historical
  only — the app implements none of it any more; see `specification.md` if you need the lineage.
- **`CONVENTIONS.md`** — how the code is built (structure, stack, patterns, design system, testing).
- **`specification.md`** — the dated change log of what's been built, including the full
  Giant v7 → GiantFit → Giant 2.0 → single-program-cleanup history.

---

*End of brief. When in doubt, favour the simplest thing that serves "a searchable history +
honest deload markers," and preserve the date-engine logic that already works.*
