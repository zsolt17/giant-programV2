-- 0022: Giant 2.0 — Phase 1 data model.
--
-- Giant 2.0 replaces GiantFit as the program (cutover GIANT2_START_DATE =
-- 2026-08-10, a Monday). Per the lane/occupant discipline the modular program
-- system already established ("reassigning an implement doesn't move the
-- key" — the carry_<day> rule, generalised by engine/program.ts), OHP's
-- secondary lane (db_row) and Bench's secondary lane (pendlay_row) are REUSED
-- for Giant 2.0's BB Row and Pull-ups: the occupant changes in program_slots,
-- the lane doesn't, so no anchor CHECK change is needed for either. The
-- pullup anchor lane already exists (0009) and is simply written again —
-- Setup shows it once more (see ARCHITECTURE.md for why pull-ups are
-- anchor-adjacent, not a plain accessory).
--
-- What's genuinely new:
--   1. The Volume block runs its OWN difficulty, independent of the Giant
--      block's — unlike GiantFit, where sessions.difficulty covered both.
--      volume_difficulty is nullable: C3 week 4 drops the Volume block
--      entirely (semi-peak week), so null there is a real "skip", not an
--      unset legacy row (legacy/pre-Giant2 rows are also null, but those
--      never render a Volume-difficulty control at all).
--   2. The week 1-3 Giant-difficulty rotation (which lift is Hard/Medium/
--      Light each week, within a cycle) is athlete-editable, not hardcoded —
--      the app-side default (constants.ts GIANT2_GIANT_DEFAULT_ROTATION)
--      merges under whatever's stored here, capacity-config pattern. Week 4
--      collapses to one difficulty for the whole cycle and is computed in
--      code (GIANT2_WEEK4_DIFFICULTY), never stored.
-- Additive only. Idempotent.

alter table sessions add column if not exists volume_difficulty text;
alter table sessions drop constraint if exists sessions_volume_difficulty_check;
alter table sessions add constraint sessions_volume_difficulty_check
  check (volume_difficulty in ('hard','medium','light') or volume_difficulty is null);

create table if not exists giant2_giant_difficulty (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null default auth.uid(),
  week_in_cycle int not null,             -- 1 | 2 | 3 (week 4 is a code-computed collapse, never stored)
  lift          text not null,            -- deadlift | ohp | squat | bench
  difficulty    text not null,
  unique (user_id, week_in_cycle, lift)
);

alter table giant2_giant_difficulty drop constraint if exists giant2_giant_difficulty_week_check;
alter table giant2_giant_difficulty add constraint giant2_giant_difficulty_week_check
  check (week_in_cycle in (1,2,3));

alter table giant2_giant_difficulty drop constraint if exists giant2_giant_difficulty_lift_check;
alter table giant2_giant_difficulty add constraint giant2_giant_difficulty_lift_check
  check (lift in ('deadlift','ohp','squat','bench'));

alter table giant2_giant_difficulty drop constraint if exists giant2_giant_difficulty_difficulty_check;
alter table giant2_giant_difficulty add constraint giant2_giant_difficulty_difficulty_check
  check (difficulty in ('hard','medium','light'));

alter table giant2_giant_difficulty enable row level security;
drop policy if exists "own giant2 difficulty" on giant2_giant_difficulty;
create policy "own giant2 difficulty" on giant2_giant_difficulty
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
