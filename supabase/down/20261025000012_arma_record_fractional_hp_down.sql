begin;
-- Restores the whole-number rule on every path 20261025000012 loosened, and removes the row it added.
update public.arma_record_caps set integer_only = true where path_pattern in ('hp', 'flameFuel.fuelUnits');
delete from public.arma_record_caps where path_pattern = 'locker.ammo.flame-fuel';
commit;
