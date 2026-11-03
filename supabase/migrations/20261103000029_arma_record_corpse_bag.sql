begin;
-- ROLLBACK: supabase/down/20261103000029_arma_record_corpse_bag_down.sql.
-- The death body bag (Web/src/engine/corpse-run.js) is saved in the run record, in the same write as the cash and the weapon it took, so a
-- reload no longer loses it. The record gets one new top-level key, `corpseBag`: null, or
--   { areaId, position: {x, z}, cash, gearId, gearName, remaining }
-- `remaining` is the play seconds left before scavengers take the cash. Every number is capped: cash like the other money fields, the position by
-- the existing '*position.x' and '*position.z' rows (so it stays fractional), remaining 0..3600 (the game's own limit is 240) and fractional.
-- The strings (areaId, gearId, gearName) fall under the default string length. The cash cap on carried + bank is unchanged: the bag holds cash
-- that already left `marked.carried`, and taking it back is a transfer, never new money.
insert into public.arma_record_keys (key) values ('corpseBag');
insert into public.arma_record_caps (path_pattern, kind, min_value, max_value, integer_only) values
  ('corpseBag.cash', 'num', 0, 1000000000, true),
  ('corpseBag.remaining', 'num', 0, 3600, false);
commit;
