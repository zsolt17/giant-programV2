-- 0026: a generic superset-group attribute on movements.
--
-- The source sheet groups certain Capability-block accessories as supersets
-- (alternate between the two rather than straight sequential sets). Nothing in
-- the schema could represent that pairing — this adds one nullable column,
-- deliberately NOT scoped to Hypertrophy/C1: any future program content that
-- wants to pair movements reuses the same column, no new migration needed.
--
-- Values are free text (not CHECK-constrained) so a future revision isn't
-- boxed into exactly 'A'/'B' — the app only needs "same non-null value on the
-- same day pairs these two", nothing enforces the letter scheme itself.
-- NULL = standalone (every movement's existing behaviour, unchanged).
--
-- syncSeedMovements only inserts movements a user doesn't have yet by key — it
-- never overwrites an existing row — so the current user's already-seeded
-- Hypertrophy rows need a one-time backfill here to pick up the pairing later
-- added to engine/movements.ts's code-side seed. Matched by key, not scoped to
-- a user_id, since the grouping is a property of the movement itself.

alter table movements add column if not exists superset_group text;

update movements set superset_group = case key
  when 'walking_lunge' then 'A'
  when 'lying_hamstring_curl' then 'A'
  when 'hip_back_extension' then 'B'
  when 'standing_calf_raise' then 'B'
  when 'seated_db_press' then 'A'
  when 'one_arm_row' then 'A'
  when 'bicep_curl' then 'B'
  when 'skull_crusher' then 'B'
  when 'hip_thrust' then 'A'
  when 'leg_extension' then 'A'
  when 'flat_db_bench' then 'A'
  when 'lat_pulldown_sup' then 'A'
  when 'lateral_raise' then 'B'
  when 'rope_face_pull' then 'B'
  else superset_group
end
where key in (
  'walking_lunge', 'lying_hamstring_curl', 'hip_back_extension', 'standing_calf_raise',
  'seated_db_press', 'one_arm_row', 'bicep_curl', 'skull_crusher',
  'hip_thrust', 'leg_extension',
  'flat_db_bench', 'lat_pulldown_sup', 'lateral_raise', 'rope_face_pull'
);
