begin;
-- ROLLBACK: supabase/down/20261025000012_arma_record_fractional_hp_down.sql.
-- A save was refused as 'shape:integer:hp' whenever the player's hp was fractional. 000007 assumed world coordinates were the only fractional numbers in a record
-- (and a number with no cap row must also be whole), but the game saves three more numbers in fractions:
--   hp                     damage and regeneration (+maxHP/60 per second): 142.25. Found by the client error beacon in the local real-client run; range 0..1000 unchanged.
--   flameFuel.fuelUnits    burn is unitsPerSecond * frame seconds (flame-fuel-state.js consume), so 987.35. Range 0..10000 unchanged.
--   locker.ammo.flame-fuel the one locker resource with integer:false (locker-state.js), 0..1000. Its own row, longer than 'locker.ammo.*' so it wins; every other
--                          locker.ammo.* stays whole.
-- Everything else keeps the whole-number rule: pistol/rifle/boss magazines and reserves, marked.carried/bank/bounty, progression attributes and proficiency
-- (each is validated by the game as an integer). Ranges are not touched, so an out-of-range value is still refused.
update public.arma_record_caps set integer_only = false where path_pattern in ('hp', 'flameFuel.fuelUnits');
insert into public.arma_record_caps (path_pattern, kind, min_value, max_value, integer_only) values ('locker.ammo.flame-fuel', 'num', 0, 1000, false);
commit;
