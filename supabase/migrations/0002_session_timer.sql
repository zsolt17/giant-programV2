-- Session timer: optional start/end timestamps on a logged session.
-- Duration is always DERIVED from these two — there is no duration column.
-- Both nullable (a session may be logged without ever using the timer).
-- RLS is unchanged (inherited from the existing sessions policies).

alter table sessions
  add column if not exists started_at timestamptz,
  add column if not exists ended_at   timestamptz;
