begin;
-- Removes exactly the rows 20261024000006_arma_weapon_rules_seed.sql inserts (the table was empty before it).
delete from public.arma_weapon_rules where weapon in ('knife', 'bone-saw', 'pistol', 'rifle', 'shotgun', 'grenade', 'rocket', 'railgun', 'flamethrower');
commit;
