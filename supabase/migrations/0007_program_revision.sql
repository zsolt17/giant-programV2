-- 0007: finalized program revision
--  (1) Secondary reassignment: B-stance RDL moves DL→Squat (rdl_deadlift → rdl_squat)
--      and Reverse Lunge is added (lunge_deadlift). Widen the accessory item CHECK.
--      Carry per-cycle weights are kept (keyed by day; the implement changes, not the key).
--  (2) Giant-block completion logging: a categorical adherence field on sessions.
-- Back up first (supabase/MIGRATIONS.md).

-- (1) accessory_weights: drop the now-orphaned RDL key (was empty), widen the CHECK.
delete from accessory_weights where item = 'rdl_deadlift';
alter table accessory_weights drop constraint if exists accessory_weights_item_check;
alter table accessory_weights add constraint accessory_weights_item_check
  check (item in ('lunge_deadlift','rdl_squat','row_ohp',
                  'carry_deadlift','carry_ohp','carry_squat','carry_dips'));

-- (2) sessions: giant-block completion (categorical; nullable — legacy rows null =
--     treated as completed by the app). Drives the deload S6 signal when ≠ completed.
alter table sessions add column if not exists block_completion text
  check (block_completion in
    ('completed','failed_heavy','stopped_fatigue','stopped_form','reduced_weight','cut_time'));
