-- 0012: Bulletproof — post-run injury-prevention circuit. One boolean per run
-- (habit tracker, no per-exercise logging; the circuit content is app-side).
-- Additive only. Idempotent. Null on legacy rows = not done.
alter table runs add column if not exists bulletproof boolean default false;
