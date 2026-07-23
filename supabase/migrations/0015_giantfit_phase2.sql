-- 0015: GiantFit migration — Phase 2 (position engine & rotation).
-- The GiantFit rotation puts Bench Press in the weekly slots (replacing the
-- retired dips), so logged sessions need 'bench' as a valid day_type. 'dips'
-- stays valid — legacy Giant sessions are deprecated, never deleted.
-- Additive only (no data change). Idempotent.

alter table sessions drop constraint if exists sessions_day_type_check;
alter table sessions add constraint sessions_day_type_check
  check (day_type in ('deadlift','ohp','squat','dips','bench'));
