-- 0004: extra per-block logging fields on sessions
--   clean_rounds   — rounds completed in the dips-day clean block (UI default 5)
--   cardio_cals    — per-round Giant Block cardio calories, ordered [R1..R4]
--   carry_rounds   — carry rounds completed (default 3)
--   carry_distance — metres per carry round (supports "distance before weight")
-- All nullable; RLS inherited from the existing sessions policies. Idempotent.

alter table sessions
  add column if not exists clean_rounds   int,
  add column if not exists cardio_cals    int[],
  add column if not exists carry_rounds   int default 3,
  add column if not exists carry_distance numeric;
