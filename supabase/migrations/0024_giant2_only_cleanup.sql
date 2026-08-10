-- 0024: retire Giant v7 and GiantFit entirely; retire Giant Run (to be rebuilt
-- from scratch later, per explicit decision — its schema/data are dropped now,
-- not deferred). The app becomes Giant-2.0-only. See ARCHITECTURE.md / the
-- 2026-08-10 cleanup entry in specification.md for the full reasoning.
--
-- DESTRUCTIVE. A full schema+data dump was taken before this ran
-- (giant_data_2026-08-09.sql / giant_schema_2026-08-09.sql, outside the repo).
-- Row counts verified before/after export matched exactly.
--
-- Ordering matters: macro M2 (fully Giant v7, cascade-deletes its own
-- working_weights/accessory_weights/sessions/testing_results) before the
-- GiantFit-window session delete; program_versions #1 (cascades its
-- program_slots) before pruning the now-unreferenced GiantFit-only movements;
-- table drops last, after their rows are gone.

-- ---- 1. Giant v7 macro (M2) — entirely pre-GiantFit, nothing reused --------
-- Cascades: working_weights, accessory_weights, sessions (+ their
-- capacity_logs/hypertrophy_logs/oly_logs), testing_results, deloads — all
-- scoped to this one macro, all Giant-v7-only.
delete from macros where number = 2 and start_date = '2026-04-13';

-- ---- 2. GiantFit-window sessions on the surviving macro (M3) ---------------
-- M3's start_date was reset to GIANT2_START_DATE, so it continues as the
-- live Giant 2.0 macro — only its GiantFit-era session logs go, not the
-- macro itself, and not its working_weights/accessory_weights (the six
-- anchor lanes + carries Giant 2.0 keeps using unchanged).
delete from sessions where date >= '2026-07-27' and date < '2026-08-10';

-- ---- 3. Orphaned GiantFit-era deload record ---------------------------------
-- Recorded under M3's OLD (GiantFit) date anchor before the athlete reset
-- the macro's start_date to GIANT2_START_DATE. Left in place, "M3C1W2" would
-- now collide with a REAL future Giant 2.0 C1W2 week under the reset clock
-- and incorrectly read as already-deloaded. There is no general rule for
-- this (deload week-keys aren't otherwise touched by this migration) — it's
-- deleted because the specific macro-start-date edit made it factually wrong,
-- not because it's old.
delete from deloads where week_key = 'M3C1W2';

-- ---- 4. GiantFit-only Giant Block accessory config -------------------------
-- ab_rollout and leg_raises survive (Giant 2.0 reuses/has its own).
delete from giant_accessory_config where movement_key in ('ghd_abs', 'ghd_back_ext', 'toes_to_bar');

-- ---- 5. GiantFit's seeded program version -----------------------------------
-- Cascades program_slots. Version 2 (Giant 2.0) is untouched.
delete from program_versions where number = 1;

-- ---- 6. GiantFit-only + Giant-Run-only + orphaned-duplicate movements ------
-- Computed as: every movement key NOT referenced by program version 2's
-- slots (the live Giant 2.0 content) after step 5 ran. Breaks down as:
--   GiantFit warm-up activation:  band_pull_aparts, face_pulls, hip_airplanes,
--                                 deep_squat_hold, thoracic_rotations
--   GiantFit capacity block:      bb_curl, bike, box_over_burpees, chinups,
--                                 db_snatch, goblet_curl, hang_bb_snatch,
--                                 double_unders
--   GiantFit Giant Block accessory: ghd_abs, ghd_back_ext, toes_to_bar
--   GiantFit row-anchor content:  db_row, pendlay_row (the MOVEMENT LIBRARY
--                                 entries "DB Row"/"Pendlay Row" — NOT the
--                                 working_weights anchor LANE keys of the same
--                                 name, which are untouched and keep their
--                                 stored values; Giant 2.0's own content uses
--                                 the 'bb_row'/'pullup' movement keys instead)
--   Giant v7 main lift:           dips
--   Giant Run Bulletproof circuit (dropped with Giant Run, decision below):
--                                 calf_raises, single_leg_balance,
--                                 tibialis_raises, plantar_rolling
--   Orphaned seed-script duplicates (superseded by the correctly-keyed
--   entries Giant 2.0 actually references — referenced by neither program
--   version): pullups, pushups, reverse_lunges, walking_lunges,
--             seated_leg_raises
delete from movements where key in (
  'band_pull_aparts', 'face_pulls', 'hip_airplanes', 'deep_squat_hold', 'thoracic_rotations',
  'bb_curl', 'bike', 'box_over_burpees', 'chinups', 'db_snatch', 'goblet_curl', 'hang_bb_snatch', 'double_unders',
  'ghd_abs', 'ghd_back_ext', 'toes_to_bar',
  'db_row', 'pendlay_row',
  'dips',
  'calf_raises', 'single_leg_balance', 'tibialis_raises', 'plantar_rolling',
  'pullups', 'pushups', 'reverse_lunges', 'walking_lunges', 'seated_leg_raises'
);

-- ---- 7. GiantFit Capacity block — tables ------------------------------------
drop table if exists capacity_logs;
drop table if exists capacity_config;
drop table if exists capacity_settings;

-- ---- 8. Giant Run — tables (full teardown, rebuilt from scratch later) -----
drop table if exists runs;
drop table if exists run_targets;

-- ---- 9. Legacy testing-week results — table (Giant v7 only) ---------------
drop table if exists testing_results;

-- ---- 10. Columns retired with their era --------------------------------
-- pair_weight: GiantFit's short-lived free per-session row weight
-- (2026-06-24..2026-07-30), superseded by the row-anchor revision; its
-- logged values were deleted with the GiantFit sessions in step 2.
alter table sessions drop column if exists pair_weight;
-- ref_pace_s: Giant Run's per-macro reference-pace anchor.
alter table macros drop column if exists ref_pace_s;

-- ---- 11. Narrow CHECK constraints to the surviving value sets --------------
alter table working_weights drop constraint if exists working_weights_lift_check;
alter table working_weights add constraint working_weights_lift_check
  check (lift = any (array['deadlift', 'ohp', 'squat', 'bench', 'db_row', 'pendlay_row']));
-- (drops 'dips', 'pullup' — Giant v7 legacy anchors — and 'secondary_deadlift',
-- 'secondary_squat' — dormant lane keys added in 0019, never populated, never
-- used by any era; zero rows of either kind remain.)

alter table sessions drop constraint if exists sessions_day_type_check;
alter table sessions add constraint sessions_day_type_check
  check (day_type = any (array['deadlift', 'ohp', 'squat', 'bench']));
-- (drops 'dips' — Giant v7's main-lift day.)

alter table sessions drop constraint if exists sessions_week_type_check;
alter table sessions add constraint sessions_week_type_check
  check (week_type = any (array['training', 'deload']));
-- (drops 'testing' — legacy 15-week-macro testing weeks; no macro will ever
-- compute one again.)

alter table accessory_weights drop constraint if exists accessory_weights_item_check;
alter table accessory_weights add constraint accessory_weights_item_check
  check (item = any (array['carry_deadlift', 'carry_ohp', 'carry_squat', 'carry_bench']));
-- (drops 'lunge_deadlift', 'rdl_squat', 'row_ohp' — pre-row-anchor secondary
-- weights — and 'carry_dips' — Giant v7's dips-day carry key; all zero rows
-- after step 1's cascade.)
