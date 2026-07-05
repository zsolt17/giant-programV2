-- 0009: two-mode dips & pull-ups
--  (1) Pull-ups join the per-cycle anchor storage (working_weights) so a weighted
--      pull-up anchor drives the standard cascade; widen the lift CHECK.
--  (2) Dips bodyweight-mode cluster logging needs its own column — pullup_cluster
--      already belongs to pull-ups on the same dips-day session row.
-- Additive only (no data change). Idempotent.

alter table working_weights drop constraint if exists working_weights_lift_check;
alter table working_weights add constraint working_weights_lift_check
  check (lift in ('deadlift','ohp','squat','dips','pullup'));

alter table sessions add column if not exists dips_cluster text;
