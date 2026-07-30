-- 0019: the movement library — program content becomes DATA.
-- Today every movement (which exercise sits in which slot, and its default reps)
-- is hardcoded in engine/constants.ts + engine/capacity.ts. This table is the
-- per-user library those slots will draw from (the slot registry itself stays
-- CODE — see engine/program.ts in the next phase; only the OCCUPANTS are data).
--
-- Capabilities, not categories: a movement declares how it is LOADED and how it
-- is COUNTED, and a slot's contract accepts or rejects it on that basis.
--   load_type  anchored   — carries a per-cycle Hard anchor (working_weights)
--              recorded   — a single recorded weight (accessory_weights pattern)
--              bodyweight — no external load
--              none       — no load concept at all (activation / bulletproof)
--   count_type reps | reps_per_side | time_seconds | calories | distance
--
-- The library is SEEDED PER USER from a code-side list (engine/movements.ts) on
-- first load — never from SQL content — so a second account bootstraps itself
-- with no migration. Movements are archived, never deleted, so a slot that once
-- referenced one keeps resolving (the deprecate-never-delete rule).
--
-- Also here: two new anchor LANE keys in the working_weights CHECK
-- (secondary_deadlift / secondary_squat) — the DL and Squat secondary lanes,
-- which exist in the grid but are deliberately empty today. The CHECK is
-- widened, never dropped: the full set of lane keys is known in code.
-- Additive only (no data change). Idempotent.

create table if not exists movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  key           text not null,          -- stable slug; the identity, immutable after create
  name          text not null,          -- display label; freely editable
  load_type     text not null,
  count_type    text not null,
  default_reps  numeric,                -- null = no numeric default (free-text dose in note)
  rep_unit      text,                   -- '/side' | '/leg' | 'sec' | null — '/'-prefixed joins tight
  note          text,                   -- 'per hand', or the verbatim dose for none-load items
  archived      boolean not null default false,
  created_at    timestamptz default now(),
  unique (user_id, key)
);

alter table movements drop constraint if exists movements_load_type_check;
alter table movements add constraint movements_load_type_check
  check (load_type in ('anchored','recorded','bodyweight','none'));

alter table movements drop constraint if exists movements_count_type_check;
alter table movements add constraint movements_count_type_check
  check (count_type in ('reps','reps_per_side','time_seconds','calories','distance'));

create index if not exists movements_user_archived_idx on movements (user_id, archived);

alter table movements enable row level security;

drop policy if exists "own movements" on movements;
create policy "own movements" on movements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The two empty secondary lanes join the anchor lane keys. Every existing value
-- stays valid, including the legacy Giant-era dips/pullup anchors.
alter table working_weights drop constraint if exists working_weights_lift_check;
alter table working_weights add constraint working_weights_lift_check
  check (lift in ('deadlift','ohp','squat','bench','db_row','pendlay_row',
                  'secondary_deadlift','secondary_squat','dips','pullup'));
