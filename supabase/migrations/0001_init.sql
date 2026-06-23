-- ============================================================================
-- The Giant Program — initial schema + Row Level Security (single-user)
-- Migration 0001. Run this in the Supabase SQL editor (or via the CLI).
-- Mirrors ARCHITECTURE.md §9. Per-cycle weights are the motivating fix:
-- working_weights / accessory_weights are keyed by (macro_id, cycle).
--
-- Note on text fields: enumerated *structural* columns (week_type, day_type,
-- difficulty, lift, cycle, item, status) carry CHECK constraints. Loosely-typed
-- log fields (rpe, bar_speed, *_speed, carry_skip_reason, carry_rpe) are left
-- unconstrained on purpose — the current app writes "" for unset selects, and
-- the step-2 mappers will normalize "" -> NULL. Don't add CHECKs there yet.
-- ============================================================================

-- ---- MACROS ---------------------------------------------------------------
create table if not exists macros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  number      int  not null,                 -- M1, M2, M3...
  start_date  date not null,                 -- anchored to a Monday
  weeks       int  not null default 15,
  status      text not null default 'active' check (status in ('active','completed')),
  created_at  timestamptz default now(),
  unique (user_id, number)
);

-- ---- WORKING_WEIGHTS (per-cycle H/M/L grid for the 4 main lifts) ----------
create table if not exists working_weights (
  id          uuid primary key default gen_random_uuid(),
  macro_id    uuid references macros on delete cascade not null,
  cycle       int  not null check (cycle in (1,2,3)),
  lift        text not null check (lift in ('deadlift','ohp','squat','dips')),
  hard        numeric,
  medium      numeric,
  light       numeric,
  unique (macro_id, cycle, lift)
);

-- ---- ACCESSORY_WEIGHTS (per-cycle single value: clean + each carry) -------
create table if not exists accessory_weights (
  id          uuid primary key default gen_random_uuid(),
  macro_id    uuid references macros on delete cascade not null,
  cycle       int  not null check (cycle in (1,2,3)),
  item        text not null check (item in
                ('clean','carry_deadlift','carry_ohp','carry_squat','carry_dips')),
  weight      numeric,
  unique (macro_id, cycle, item)
);

-- ---- TESTING_RESULTS (recorded after the fact, not prescribed) ------------
create table if not exists testing_results (
  id          uuid primary key default gen_random_uuid(),
  macro_id    uuid references macros on delete cascade not null,
  lift        text not null,
  weight      numeric,
  reps        int,
  notes       text,
  tested_on   date
);

-- ---- SESSIONS (training / testing / deload) ------------------------------
-- id stays human-readable "date-lift-difficulty" (e.g. 2026-06-22-squat-H)
-- so logging is idempotent (upsert on id).
create table if not exists sessions (
  id            text primary key,
  macro_id      uuid references macros on delete cascade not null,
  date          date not null,                -- the SCHEDULED slot date
  cycle         int,                          -- null for testing/deload
  week          int,                          -- week within meso (1..4)
  week_type     text not null check (week_type in ('training','testing','deload')),
  day_type      text check (day_type in ('deadlift','ohp','squat','dips')),
  difficulty    text check (difficulty in ('hard','medium','light')),
  -- top set
  top_reps      int,
  top_weight    numeric,
  rpe           text,                          -- "R7".."R10"
  bar_speed     text,                          -- up | normal | down
  -- clean block (dips day)
  clean_load    numeric,
  clean_speed   text,
  -- volume
  vol_done      boolean default true,
  vol_rpe       text,
  vol_speed     text,
  -- pull-up cluster (OHP day, phase 1) e.g. "6+4"
  pullup_cluster text,
  -- carry
  carry_skipped boolean default false,
  carry_skip_reason text,                      -- fatigue | schedule
  carry_rpe     text,
  -- meta
  notes         text,
  updated_at    timestamptz default now()
);

-- keep updated_at fresh on every write
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_set_updated_at on sessions;
create trigger sessions_set_updated_at
  before update on sessions
  for each row execute function set_updated_at();

-- ---- DELOADS (one row per week a deload was applied) ---------------------
create table if not exists deloads (
  id          uuid primary key default gen_random_uuid(),
  macro_id    uuid references macros on delete cascade not null,
  week_key    text not null,                  -- "M2C3W4"
  applied_at  timestamptz default now(),
  unique (macro_id, week_key)
);

-- ---- BREAK_DAYS (day-level, exempt from missed + deload signals) ---------
create table if not exists break_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null default auth.uid(),
  date        date not null,
  unique (user_id, date)
);

-- ============================================================================
-- ROW LEVEL SECURITY — data is private to the one authenticated account.
-- macros + break_days are owned directly via user_id; everything else is
-- owned transitively through its macro.
-- ============================================================================
alter table macros            enable row level security;
alter table working_weights   enable row level security;
alter table accessory_weights enable row level security;
alter table testing_results   enable row level security;
alter table sessions          enable row level security;
alter table deloads           enable row level security;
alter table break_days        enable row level security;

create policy "own macros" on macros
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own break_days" on break_days
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own working_weights" on working_weights
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));

create policy "own accessory_weights" on accessory_weights
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));

create policy "own testing_results" on testing_results
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));

create policy "own sessions" on sessions
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));

create policy "own deloads" on deloads
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));
