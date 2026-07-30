-- 0020: versioned slot assignment — which movement occupies which slot, by date.
--
-- The slot REGISTRY and its contracts are code (engine/program.ts); only the
-- OCCUPANTS live here. A slot is keyed by its position (`slot_key`), never by
-- its occupant, so swapping a movement never moves an anchor or a logged row.
--
-- EDITING IS EFFECTIVE-DATED, NEVER RETROACTIVE: a session resolves the version
-- whose effective_from is the greatest one <= its date, so history renders as it
-- was lived. Version 1 is seeded at GIANTFIT_START_DATE (2026-07-27), which is
-- why every already-logged GiantFit session keeps resolving to exactly what it
-- lived; pre-cutover dates resolve to NO version and keep the legacy path.
--
-- Nothing reads these tables for prescription in this phase — the data-driven
-- path is built alongside the hardcoded one and proven identical first.
-- Additive only (no data change). Idempotent.

create table if not exists program_versions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null default auth.uid(),
  number          int not null,
  effective_from  date not null,          -- live from this day on
  note            text,
  created_at      timestamptz default now(),
  unique (user_id, number),
  unique (user_id, effective_from)        -- one version per changeover date
);

create table if not exists program_slots (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid references program_versions on delete cascade not null,
  slot_key      text not null,            -- from SLOT_CONTRACTS (code-owned)
  order_index   int not null default 0,   -- position within a variable-count group
  movement_id   uuid references movements, -- null = the lane is deliberately empty
  reps          numeric,                  -- null = fall back to the movement default
  rounds        int,                      -- capacity only; null elsewhere
  -- The one per-slot flag today: the Bulletproof circuit's optional tail. Kept on
  -- the slot (not the movement) because it is a property of the prescription,
  -- not of the exercise.
  optional      boolean not null default false,
  unique (version_id, slot_key, order_index)
);

create index if not exists program_versions_user_effective_idx
  on program_versions (user_id, effective_from desc);
create index if not exists program_slots_version_idx on program_slots (version_id);

alter table program_versions enable row level security;
alter table program_slots    enable row level security;

drop policy if exists "own program_versions" on program_versions;
create policy "own program_versions" on program_versions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Slots are reached transitively through their version (the capacity_logs /
-- recovery_tendon_logs pattern).
drop policy if exists "own program_slots" on program_slots;
create policy "own program_slots" on program_slots
  for all using (version_id in (select id from program_versions where user_id = auth.uid()))
  with check (version_id in (select id from program_versions where user_id = auth.uid()));
