-- 0017: GiantFit revision — the paired rows become ANCHORED lifts.
--  working_weights gains 'db_row' (OHP day; anchor entered as kg PER HAND) and
--  'pendlay_row' (bench day). Both cascade identically to the other anchors
--  (100/95/90 day spread, 85/90/95/100 ladder, 80% volume, 2.5 kg rounding —
--  all computed in the engine; only the Hard anchor is stored).
--  Legacy values ('dips','pullup') stay valid so pre-cutover history renders.
-- Additive only (no data change). Idempotent.

alter table working_weights drop constraint if exists working_weights_lift_check;
alter table working_weights add constraint working_weights_lift_check
  check (lift in ('deadlift','ohp','squat','bench','db_row','pendlay_row','dips','pullup'));
