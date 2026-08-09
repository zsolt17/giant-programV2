-- 0023: Giant 2.0 — Phase 4 data model (Capability block: Hypertrophy + Oly).
--
-- Carries (C3) need NO new table — they reuse accessory_weights (carry_<day>)
-- and sessions.carry_rounds/carry_distance/carry_rpe/carry_skipped/
-- carry_skip_reason unchanged, gated to render only in C3 (session-view logic,
-- not schema). Hypertrophy (C1) and Oly (C2) are genuinely new shapes: one
-- row PER MOVEMENT per session (unlike capacity_logs' one row per session),
-- so both are keyed (session_id, movement_id). RLS is transitive via
-- session_id -> sessions -> macros, same as capacity_logs (0014).
--
-- Oly logs a QUALITY MARK (Q1/Q2/Q3), not RPE — a new field type, deliberately
-- not reusing the rpe column pattern (see ARCHITECTURE.md / specification.md
-- 2026-08-09 Phase 1 for why). Weight on both tables is a per-lane "found by
-- feel" value the athlete enters directly — no anchor cascade.
-- Additive only. Idempotent.

create table if not exists hypertrophy_logs (
  id          uuid primary key default gen_random_uuid(),
  session_id  text references sessions(id) on delete cascade not null,
  movement_id uuid references movements(id) not null,
  weight      numeric,
  reps_done   int,
  notes       text,
  updated_at  timestamptz default now(),
  unique (session_id, movement_id)
);

create table if not exists oly_logs (
  id          uuid primary key default gen_random_uuid(),
  session_id  text references sessions(id) on delete cascade not null,
  movement_id uuid references movements(id) not null,
  weight      numeric,
  quality     text,
  notes       text,
  updated_at  timestamptz default now(),
  unique (session_id, movement_id)
);

alter table oly_logs drop constraint if exists oly_logs_quality_check;
alter table oly_logs add constraint oly_logs_quality_check
  check (quality in ('Q1','Q2','Q3') or quality is null);

drop trigger if exists hypertrophy_logs_set_updated_at on hypertrophy_logs;
create trigger hypertrophy_logs_set_updated_at
  before update on hypertrophy_logs
  for each row execute function set_updated_at();

drop trigger if exists oly_logs_set_updated_at on oly_logs;
create trigger oly_logs_set_updated_at
  before update on oly_logs
  for each row execute function set_updated_at();

create index if not exists hypertrophy_logs_session_id_idx on hypertrophy_logs (session_id);
create index if not exists oly_logs_session_id_idx on oly_logs (session_id);

alter table hypertrophy_logs enable row level security;
alter table oly_logs         enable row level security;

drop policy if exists "own hypertrophy_logs" on hypertrophy_logs;
create policy "own hypertrophy_logs" on hypertrophy_logs
  for all using (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())))
  with check (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())));

drop policy if exists "own oly_logs" on oly_logs;
create policy "own oly_logs" on oly_logs
  for all using (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())))
  with check (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())));
