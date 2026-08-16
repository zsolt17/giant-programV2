-- 0031: C3's Capability block becomes "Engine WOD" — a structured 5-round
-- conditioning piece (carry + machine + rest), replacing isolated carry
-- logging. Same shape as hypertrophy_logs/oly_logs: one row per LOG UNIT per
-- session, here per round (1..5), not per movement — the carry implement is
-- resolved from day_type alone (DAY_META), so no movement_id is needed.
--
-- sessions.wod_skipped/wod_skip_reason replace carry_skipped/carry_skip_reason
-- (same shape, same purpose — drives deload signal S3). The old carry_*
-- columns are dropped: verified zero real logged data first (all 4 live
-- session rows had carry_distance/carry_rpe/carry_skipped null/false — the
-- app has never reached a real C3 week yet). Additive+destructive; the
-- destructive half is safe per that verification, not because drops are
-- generally safe.

create table if not exists wod_logs (
  id               uuid primary key default gen_random_uuid(),
  session_id       text references sessions(id) on delete cascade not null,
  round_number     int not null,
  machine_type     text not null,
  machine_calories numeric,
  carry_rpe        text,
  updated_at       timestamptz default now(),
  unique (session_id, round_number)
);

alter table wod_logs drop constraint if exists wod_logs_round_number_check;
alter table wod_logs add constraint wod_logs_round_number_check
  check (round_number between 1 and 5);

alter table wod_logs drop constraint if exists wod_logs_machine_type_check;
alter table wod_logs add constraint wod_logs_machine_type_check
  check (machine_type in ('row', 'ski', 'bike'));

drop trigger if exists wod_logs_set_updated_at on wod_logs;
create trigger wod_logs_set_updated_at
  before update on wod_logs
  for each row execute function set_updated_at();

create index if not exists wod_logs_session_id_idx on wod_logs (session_id);

alter table wod_logs enable row level security;

drop policy if exists "own wod_logs" on wod_logs;
create policy "own wod_logs" on wod_logs
  for all using (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())))
  with check (session_id in (select id from sessions where macro_id in (select id from macros where user_id = auth.uid())));

alter table sessions add column if not exists wod_skipped boolean not null default false;
alter table sessions add column if not exists wod_skip_reason text;

alter table sessions drop column if exists carry_skipped;
alter table sessions drop column if exists carry_skip_reason;
alter table sessions drop column if exists carry_rounds;
alter table sessions drop column if exists carry_distance;
alter table sessions drop column if exists carry_rpe;
