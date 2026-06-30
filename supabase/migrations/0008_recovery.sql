-- 0008: Recovery > Tendon Health — joint isometric-loading protocols + per-tendon
-- daily logs. Matches the house style (user_id default auth.uid(); RLS owned via
-- user_id on protocols, transitively via protocol_id on logs).

create table if not exists recovery_protocols (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null default auth.uid(),
  joint          text not null check (joint in ('wrist','elbow','shoulder','knee','ankle')),
  start_date     date not null default current_date,
  phase_override text check (phase_override in ('acute','build','maintenance')),
  status         text not null default 'active' check (status in ('active','completed')),
  closed_early   boolean not null default false,
  end_date       date,
  created_at     timestamptz not null default now()
);

-- Only one active protocol per user (enforced at the DB, not just the UI).
create unique index if not exists one_active_protocol_per_user
  on recovery_protocols (user_id) where status = 'active';

create table if not exists recovery_tendon_logs (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid references recovery_protocols(id) on delete cascade not null,
  tendon_key   text not null,
  log_date     date not null default current_date,
  created_at   timestamptz not null default now(),
  unique (protocol_id, tendon_key, log_date)
);

alter table recovery_protocols   enable row level security;
alter table recovery_tendon_logs enable row level security;

create policy "own recovery_protocols" on recovery_protocols
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own recovery_tendon_logs" on recovery_tendon_logs
  for all using (protocol_id in (select id from recovery_protocols where user_id = auth.uid()))
  with check (protocol_id in (select id from recovery_protocols where user_id = auth.uid()));
