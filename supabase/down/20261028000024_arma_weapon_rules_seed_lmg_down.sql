begin;
-- Puts the railgun row back as migration 20261026000013 seeded it (the Thundercoil Arc Gun: 45 damage, 1.25 hits a second).
update public.arma_weapon_rules set max_damage_per_hit = 45, max_hits_per_s = 1.25 where weapon = 'railgun';
commit;
