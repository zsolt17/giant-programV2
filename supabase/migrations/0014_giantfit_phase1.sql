-- 0014: GiantFit migration — Phase 1 (data model & Setup).
-- The app is migrating from The Giant Program v7 to GiantFit (same single-anchor
-- loading engine; lifts become DL/OHP/Squat/Bench). Old Giant data stays readable
-- forever: existing columns/values are DEPRECATED, never dropped.
--  (1) working_weights gains 'bench' as an anchor lift. 'dips' and 'pullup' stay
--      valid so legacy anchor rows keep loading (History/Calendar rendering) —
--      Setup no longer writes them.
--  (2) capacity_config — per-user editable rep target + weight per movement of
--      the two GiantFit capacity variants (A/B). The movement definitions
--      (names, order, which are loaded) are static app content
--      (engine/capacity.ts); only the numbers live here. Accessory-weights
--      pattern: recorded values, upserted on a natural key, defaults app-side.
--  (3) capacity_settings — one row per user for the shared capacity settings
--      (rounds: 3 or 4, default 3).
--  (4) capacity_logs — one capacity-block result per session (no UI until
--      Phase 3; the table + typed client land now). RLS transitive via
--      session_id -> sessions -> macros (recovery_tendon_logs pattern).
-- Additive only (no data change). Idempotent.

-- (1) bench joins the anchor lifts; dips/pullup kept for legacy rows
alter table working_weights drop constraint if exists working_weights_lift_check;
alter table working_weights add constraint working_weights_lift_check
  check (lift in ('deadlift','ohp','squat','bench','dips','pullup'));

-- (2) per-movement capacity config (user-scoped; movement_key is defined app-side)
create table if not exists capacity_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  variant       text not null check (variant in ('A','B')),
  movement_key  text not null,
  rep_target    int,              -- null = app default for the movement
  weight        numeric,          -- kg; only meaningful for loaded movements
  unique (user_id, variant, movement_key)
);

-- (3) shared capacity settings (one row per user)
create table if not exists capacity_settings (
  user_id  uuid primary key references auth.users default auth.uid(),
  rounds   int not null default 3 check (rounds in (3,4))
);

-- (4) capacity-block log — one per session (upsert on session_id)
create table if not exists capacity_logs (
  id                  uuid primary key default gen_random_uuid(),
  session_id          text references sessions(id) on delete cascade not null,
  variant             text not null check (variant in ('A','B')),
  rounds_completed    int,
  total_time_seconds  int,
  calories            int,        -- nullable; from the Bike movement (variant B)
  rpe                 text check (rpe in ('R6','R7','R8','R8.5','R9','R9.5','R10')),
  notes               text,
  updated_at          timestamptz default now(),
  unique (session_id)
);

drop trigger if exists capacity_logs_set_updated_at on capacity_logs;
create trigger capacity_logs_set_updated_at
  before update on capacity_logs
  for each row execute function set_updated_at();

create index if not exists capacity_logs_session_id_idx on capacity_logs (session_id);

alter table capacity_config   enable row level security;
alter table capacity_settings enable row level security;
alter table capacity_logs     enable row level security;

create policy "own capacity_config" on capacity_config
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own capacity_settings" on capacity_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own capacity_logs" on capacity_logs
  for all using (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())))
  with check (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())));
