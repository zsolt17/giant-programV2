-- 0016: GiantFit migration — Phase 3 (session views, capacity block, carries).
--  (1) sessions.pair_weight — the weight used for the session's paired row
--      (DL/OHP + DB Row, Bench + Pendlay Row; squat trains alone). Free
--      per-session entry, unanchored — no ladder, no cascade.
--  (2) accessory_weights gains 'carry_bench' (GiantFit carry mapping:
--      DL→Farmers, OHP→Overhead, Squat→Bearhug, Bench→Suitcase — the first
--      three keep their existing day keys; bench day is new). Legacy items
--      stay valid so pre-cutover history keeps its recorded weights.
-- Additive only (no data change). Idempotent.

alter table sessions add column if not exists pair_weight numeric;

alter table accessory_weights drop constraint if exists accessory_weights_item_check;
alter table accessory_weights add constraint accessory_weights_item_check
  check (item in ('lunge_deadlift','rdl_squat','row_ohp',
                  'carry_deadlift','carry_ohp','carry_squat','carry_dips','carry_bench'));
