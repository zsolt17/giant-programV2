-- 0013: 13-week macro. Testing weeks leave the schedule (testing_results and all
-- historical data stay untouched — the engine renders them only for legacy
-- weeks=15 macros); the deload is the final week and the athlete can extend it
-- by one identical week, decided during the deload itself (deload_extended).
-- Additive only. Idempotent. Existing macros keep weeks = 15 (their testing
-- weeks were lived and stay renderable); new macros default to 13.
alter table macros add column if not exists deload_extended boolean default false;
alter table macros alter column weeks set default 13;
