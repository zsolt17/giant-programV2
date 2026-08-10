-- 0025: prune the two dormant secondary_deadlift/secondary_squat program_slots
-- rows, discovered by the smoke test after 0024 removed the concept from
-- ANCHORED_LANES/SLOT_CONTRACTS (engine/program.ts). These were always
-- empty placeholder lanes (added in 0019, never populated, never used by any
-- era) — deleting them is the data-side half of the same "prune it" decision
-- 0024 already applied to the code and the working_weights CHECK constraint.
delete from program_slots where slot_key in ('secondary_deadlift', 'secondary_squat');
