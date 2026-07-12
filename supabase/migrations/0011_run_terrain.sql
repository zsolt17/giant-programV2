-- 0011: Giant Run terrain awareness. Road (default) vs trail — trail pace varies
-- with terrain, not fatigue, so pace-based readouts (trend chart, R3 signal)
-- treat the two differently. Additive only. Idempotent. Null on legacy rows =
-- road (mapper default).
alter table runs add column if not exists terrain text default 'road'
  check (terrain in ('road','trail'));
