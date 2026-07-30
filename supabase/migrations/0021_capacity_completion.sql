-- 0021: capacity gains a COMPLETION state — S6 stops measuring the clock and
-- starts measuring the athlete.
--
-- (Numbered 0021, not 0019: the modular-program-content migrations 0019/0020
-- were already applied. Migrations are forward-only and immutable — renumbering
-- an applied file would mean rewriting the remote history.)
--
-- Why: per-round time in a 7-movement circuit with no time cap is dominated by
-- transitions and equipment availability, so a 15% swing sat inside the noise
-- floor; and because variants alternate weekly, a variant needed ~3 weeks to
-- earn a baseline that any circuit edit then reset. Meanwhile the capacity block
-- — a full weekly training block — had NO completion signal, while the rest of
-- the rule treats "couldn't complete the prescribed work" as its core fatigue
-- currency (S2 volume, S7 giant block, S3 carry).
--
-- The firing rule is encoded in the VALUE NAMES: any *_fatigue value fires the
-- signal, nothing else does. That mirrors carry_skip_reason's fatigue-vs-schedule
-- discrimination — attribution is captured by the athlete at log time, never
-- inferred from the numbers.
--
-- NO BACKFILL: null reads as 'completed', exactly as sessions.block_completion
-- already does for legacy rows. Signals are computed and never stored, so
-- history re-renders under the new definition with no data change.
-- Additive only. Idempotent.

alter table capacity_logs add column if not exists completion text;

alter table capacity_logs drop constraint if exists capacity_logs_completion_check;
alter table capacity_logs add constraint capacity_logs_completion_check
  check (completion in ('completed','cut_short_fatigue','cut_short_time','scaled_fatigue','scaled_other'));
