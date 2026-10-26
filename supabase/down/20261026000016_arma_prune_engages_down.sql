begin;
-- Removes the prune function and its config row. Engages already deleted stay deleted.
drop function if exists public.arma_prune_engages();
delete from public.arma_config where key = 'engage_keep_s';
commit;
