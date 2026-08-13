-- 0030: drop sessions.dips_cluster — an orphaned column from Giant v7's dips
-- day (added 0009_dips_pullup_modes.sql). The 0024 Giant-2.0-only cleanup
-- dropped its sibling GiantFit/Giant-Run-era columns (pair_weight,
-- ref_pace_s) but missed this one. No code reads or writes it (Giant 2.0
-- has no dips day; the current two-mode secondary is pullup_cluster, a
-- different column, unaffected). Zero rows use it — the dips day it served
-- was retired with macro M2, deleted in 0024 step 1. Additive-safe to leave
-- if this ever needs reverting: a future migration can re-add the column.

alter table sessions drop column if exists dips_cluster;
