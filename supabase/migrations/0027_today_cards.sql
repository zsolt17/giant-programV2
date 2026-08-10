-- 0027: schema support for the Today-tab card redesign.
--
-- Three independent additions:
--
-- 1. sessions.primer_done — the Primer card has no other loggable state (it's
--    a checklist, not numeric log entries); this single flag is what "the
--    card is Done" persists as. No per-item granularity is stored — the
--    checklist itself is UI-only local state, reset on reopen.
--
-- 2. movements.weight_optional — a real boolean flag (not the free-text
--    `note` column) so the Hypertrophy card's required-field check can tell
--    "Hip/Back Extension doesn't need a load" from "every other movement
--    does" without parsing display copy. `note` keeps carrying its own
--    arbitrary text (unrelated movements use it for other things); this is a
--    separate, purpose-built field.
--
-- 3. hypertrophy_logs moves from one row per (session, movement) to one row
--    per (session, movement, SET) — the Hypertrophy card now logs reps+load
--    per set (GIANT2_HYPERTROPHY_SETS, currently 3), not one aggregate pair
--    per movement. No existing rows to migrate (table is empty in prod as of
--    this migration) — straight add-column + constraint swap.
--
-- Additive only except the one constraint swap in #3. Idempotent.

alter table sessions add column if not exists primer_done boolean not null default false;

alter table movements add column if not exists weight_optional boolean not null default false;
update movements set weight_optional = true where key = 'hip_back_extension';

alter table hypertrophy_logs add column if not exists set_number int not null default 1;
alter table hypertrophy_logs add constraint hypertrophy_logs_set_number_check check (set_number > 0);

alter table hypertrophy_logs drop constraint if exists hypertrophy_logs_session_id_movement_id_key;
alter table hypertrophy_logs add constraint hypertrophy_logs_session_id_movement_id_set_number_key
  unique (session_id, movement_id, set_number);
