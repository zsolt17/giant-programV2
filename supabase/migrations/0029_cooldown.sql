-- 0029: sessions.cooldown_done — the new fifth Today-tab card (Cooldown, runs
-- after Capability). Same shape as sessions.primer_done (0027): the checklist
-- itself is a checkbox-style block with no numeric log entries, so a single
-- flag is the whole persisted signal — which items were individually checked
-- is local UI state, never stored per-item.
--
-- Optional, not required: nothing in the app treats "every card done" as a
-- session-level completion gate (session end is governed by the timer
-- alone) — Cooldown doesn't change that. Additive only. Idempotent.

alter table sessions add column if not exists cooldown_done boolean not null default false;
