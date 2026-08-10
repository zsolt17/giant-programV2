-- 0028: hypertrophy_logs.rpe — RPE is a normal, optional per-set field on the
-- Hypertrophy Capability block, same as reps and load.
--
-- The 0027 Today-tab card redesign built this block's RPE column as a static
-- "–" (non-interactive) based on a misreading of the reference wireframe (the
-- dash meant "not filled in yet in the mockup", not "this field doesn't
-- exist"). Corrected here at the schema level, not just the UI — the column
-- genuinely didn't exist, so there was nowhere for a typed value to land.
--
-- Stored the same way every other RPE field in this app is (text, "R6".."R10"
-- via a dropdown — sessions.rpe/vol_rpe/carry_rpe) — deliberately NOT the
-- oly_logs.quality pattern, since Hypertrophy uses RPE, not a quality mark.
-- Additive only. Idempotent.

alter table hypertrophy_logs add column if not exists rpe text;
