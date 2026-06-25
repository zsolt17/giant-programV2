-- ============================================================================
-- The Giant Program — schema hardening
-- Migration 0003. Now that the app has matured and the mappers normalize unset
-- selects to NULL (the reason 0001 deferred these CHECKs no longer holds), this
-- tightens integrity on the loose log fields, makes testing_results idempotent,
-- and adds the foreign-key / lookup indexes Postgres does NOT create on its own.
--
-- Safe to run more than once: every statement is idempotent (DROP ... IF EXISTS
-- before ADD; CREATE INDEX IF NOT EXISTS). CHECKs are added NOT VALID so a stray
-- legacy value can never fail the migration — they still enforce on every new
-- write. Once you've confirmed existing rows are clean you may VALIDATE them
-- (commented block at the bottom).
-- ============================================================================

-- ---- 1. Normalize any legacy empty strings to NULL -------------------------
-- Pre-mapper rows may hold '' instead of NULL on the loose log fields. Clean
-- them first so the (NULL-tolerant) CHECKs below have nothing to trip over.
update sessions set bar_speed        = null where bar_speed        = '';
update sessions set clean_speed      = null where clean_speed      = '';
update sessions set vol_speed        = null where vol_speed        = '';
update sessions set rpe              = null where rpe              = '';
update sessions set vol_rpe          = null where vol_rpe          = '';
update sessions set carry_rpe        = null where carry_rpe        = '';
update sessions set carry_skip_reason = null where carry_skip_reason = '';

-- ---- 2. CHECK constraints on the log enums --------------------------------
-- NULL passes every CHECK automatically (an unset field stays unset). Values
-- mirror the UI: SpeedPick -> up|normal|down, LogRpe -> R6..R10, skip reason
-- -> fatigue|schedule. Bump these lists here if the UI options ever change.

-- bar / clean / volume speed
alter table sessions drop constraint if exists sessions_bar_speed_check;
alter table sessions add  constraint sessions_bar_speed_check
  check (bar_speed in ('up','normal','down')) not valid;

alter table sessions drop constraint if exists sessions_clean_speed_check;
alter table sessions add  constraint sessions_clean_speed_check
  check (clean_speed in ('up','normal','down')) not valid;

alter table sessions drop constraint if exists sessions_vol_speed_check;
alter table sessions add  constraint sessions_vol_speed_check
  check (vol_speed in ('up','normal','down')) not valid;

-- RPE fields (top set, volume, carry) — same R6..R10 scale
alter table sessions drop constraint if exists sessions_rpe_check;
alter table sessions add  constraint sessions_rpe_check
  check (rpe in ('R6','R7','R8','R8.5','R9','R9.5','R10')) not valid;

alter table sessions drop constraint if exists sessions_vol_rpe_check;
alter table sessions add  constraint sessions_vol_rpe_check
  check (vol_rpe in ('R6','R7','R8','R8.5','R9','R9.5','R10')) not valid;

alter table sessions drop constraint if exists sessions_carry_rpe_check;
alter table sessions add  constraint sessions_carry_rpe_check
  check (carry_rpe in ('R6','R7','R8','R8.5','R9','R9.5','R10')) not valid;

-- carry skip reason
alter table sessions drop constraint if exists sessions_carry_skip_reason_check;
alter table sessions add  constraint sessions_carry_skip_reason_check
  check (carry_skip_reason in ('fatigue','schedule')) not valid;

-- ---- 3. Make testing_results idempotent -----------------------------------
-- 0001 gave testing_results no natural key, so a double-submit inserts a
-- duplicate. One macro can test a lift at most once per day, so (macro_id,
-- lift, tested_on) is the grain. NULLS NOT DISTINCT (PG15+) means two
-- date-less rows for the same lift also collide, so a missing date can't
-- sneak a duplicate through. NOTE: this blocks dupes at the DB; to have a
-- re-save gracefully UPDATE instead of erroring, switch saveTestingResult to
-- upsert(onConflict: 'macro_id,lift,tested_on') in repository.ts (follow-up).
create unique index if not exists testing_results_macro_lift_day_uq
  on testing_results (macro_id, lift, tested_on) nulls not distinct;

-- ---- 4. Foreign-key & lookup indexes --------------------------------------
-- Postgres does not auto-index FK columns; every macro-scoped read filters on
-- macro_id, and sessions are ordered/queried by date. Cheap hygiene — harmless
-- even at single-user scale, correct as data grows across macros/years.
create index if not exists working_weights_macro_id_idx   on working_weights   (macro_id);
create index if not exists accessory_weights_macro_id_idx on accessory_weights (macro_id);
create index if not exists testing_results_macro_id_idx   on testing_results   (macro_id);
create index if not exists sessions_macro_id_idx          on sessions          (macro_id);
create index if not exists deloads_macro_id_idx           on deloads           (macro_id);
create index if not exists sessions_date_idx              on sessions          (date);

-- ---- 5. (Optional) promote the CHECKs to VALID ----------------------------
-- After confirming no existing row violates the sets above, run this once to
-- have Postgres mark them fully validated (NOT VALID only skips the historical
-- scan; new writes are already enforced either way). Safe to leave commented.
-- alter table sessions validate constraint sessions_bar_speed_check;
-- alter table sessions validate constraint sessions_clean_speed_check;
-- alter table sessions validate constraint sessions_vol_speed_check;
-- alter table sessions validate constraint sessions_rpe_check;
-- alter table sessions validate constraint sessions_vol_rpe_check;
-- alter table sessions validate constraint sessions_carry_rpe_check;
-- alter table sessions validate constraint sessions_carry_skip_reason_check;
