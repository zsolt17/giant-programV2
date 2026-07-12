-- 0010: The Giant Run — companion running program.
--  (1) Reference pace P per macro (seconds/km; NULL = talk-test mode, the C1 state).
--  (2) runs — one row per logged run, mirroring sessions (human-readable id,
--      upsert-idempotent, macro-scoped RLS, updated_at trigger).
--  (3) run_targets — per-cycle editable distance guidance per run slot
--      (accessory-weights pattern: recorded, seeded forward, never computed).
-- Additive only (no data change). Idempotent.

alter table macros add column if not exists ref_pace_s int;

create table if not exists runs (
  id           text primary key,             -- "2026-07-14-run-E" (date + run-type letter)
  macro_id     uuid references macros on delete cascade not null,
  date         date not null,                -- the SCHEDULED slot date (strict-date model)
  cycle        int,                          -- null for testing/deload weeks
  week         int,                          -- week within meso (1..4), null for special weeks
  week_type    text not null check (week_type in ('training','testing','deload')),
  run_type     text not null check (run_type in ('easy','quality','long','tt')),
  -- log (actuals; pace is always DERIVED duration/distance, never stored)
  distance_km  numeric,
  duration_s   int,
  avg_hr       int,
  -- categorical completion (null on legacy rows = completed, like block_completion)
  completion   text check (completion in
                 ('completed','cut_fatigue','cut_schedule','felt_heavy')),
  notes        text,
  updated_at   timestamptz default now()
);

drop trigger if exists runs_set_updated_at on runs;
create trigger runs_set_updated_at
  before update on runs
  for each row execute function set_updated_at();

create index if not exists runs_macro_id_idx on runs (macro_id);
create index if not exists runs_date_idx on runs (date);

create table if not exists run_targets (
  id        uuid primary key default gen_random_uuid(),
  macro_id  uuid references macros on delete cascade not null,
  cycle     int not null check (cycle in (1,2,3)),
  run_type  text not null check (run_type in ('easy','quality','long')),
  km        numeric,
  unique (macro_id, cycle, run_type)
);

alter table runs        enable row level security;
alter table run_targets enable row level security;

create policy "own runs" on runs
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));

create policy "own run_targets" on run_targets
  for all using (macro_id in (select id from macros where user_id = auth.uid()))
  with check (macro_id in (select id from macros where user_id = auth.uid()));
