-- 0006: exercise-selection overhaul
--  (1) Remove the power-clean block (dips day): drop its session log columns and
--      the per-cycle 'clean' accessory rows.
--  (2) Retire 'clean' from accessory_weights.item and allow the two new recorded
--      antagonist accessories — B-stance DB RDL (DL day) and one-arm DB row (OHP day).
-- Back up first (supabase/MIGRATIONS.md). Destructive: clean log history is dropped.

-- (1) sessions: drop the clean-block columns
alter table sessions
  drop column if exists clean_load,
  drop column if exists clean_rounds,
  drop column if exists clean_speed;

-- (2) accessory_weights: delete clean rows, then widen the item CHECK
--     (must delete 'clean' rows before adding a CHECK that disallows them).
delete from accessory_weights where item = 'clean';
alter table accessory_weights drop constraint if exists accessory_weights_item_check;
alter table accessory_weights add constraint accessory_weights_item_check
  check (item in ('rdl_deadlift','row_ohp','carry_deadlift','carry_ohp','carry_squat','carry_dips'));
