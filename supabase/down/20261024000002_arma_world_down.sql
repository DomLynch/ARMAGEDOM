begin;
-- Drops exactly what supabase/migrations/20261024000002_arma_world.sql creates.
drop function if exists public.arma_spawn_hit_batch(jsonb);
drop function if exists public.arma_spawn_hit(uuid, text, text, numeric, int, int);
drop function if exists public.arma_spawn_engage(uuid, text, text, text, text, text, numeric);
drop function if exists public.arma_spawn_state(text[]);
drop function if exists public.arma_spawn_view(public.arma_spawns);
drop table if exists public.arma_loot, public.arma_spawn_damage, public.arma_spawn_engages, public.arma_spawns, public.arma_loot_rules, public.arma_weapon_rules, public.arma_world_config;
commit;
