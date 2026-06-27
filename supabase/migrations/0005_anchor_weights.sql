-- 0005: single-anchor loading model for working_weights
--   Only the Hard top set per (macro, cycle, lift) is stored from now on. The
--   Medium/Light day tops (×0.95 / ×0.90) and the within-day Giant Block ladder
--   are computed live in the engine (src/engine/loading.ts), never persisted.
--   The existing `hard` column already holds the anchor — no data move is needed
--   to "seed" it. The manually-entered medium/light values are dropped; the engine
--   regenerates them. (Back up first: see supabase/MIGRATIONS.md pg_dump routine.)
-- Idempotent.

alter table working_weights
  drop column if exists medium,
  drop column if exists light;
