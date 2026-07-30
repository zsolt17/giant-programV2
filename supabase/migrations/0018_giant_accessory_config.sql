-- 0018: GiantFit revision — Giant Block bodyweight-accessory rep targets.
-- The Giant Block gains a per-day bodyweight accessory (DL Ab Rollout · OHP
-- Toes-to-Bar · Squat GHD Abs · Bench GHD Back Extension) — rep-only, no load.
-- Movement definitions + default reps are static app content
-- (GIANTFIT_GB_ACCESSORY, engine/constants.ts); only the athlete's editable rep
-- target lives here (capacity_config pattern: user-scoped, natural-key upsert,
-- defaults merged app-side on read).
-- Additive only (no data change). Idempotent.

create table if not exists giant_accessory_config (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  movement_key  text not null,     -- app-defined: ab_rollout / toes_to_bar / ghd_abs / ghd_back_ext
  rep_target    int,               -- null = app default for the movement
  unique (user_id, movement_key)
);

alter table giant_accessory_config enable row level security;

drop policy if exists "own giant_accessory_config" on giant_accessory_config;
create policy "own giant_accessory_config" on giant_accessory_config
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
