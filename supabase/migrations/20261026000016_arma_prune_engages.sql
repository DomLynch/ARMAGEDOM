begin;
-- ROLLBACK: supabase/down/20261026000016_arma_prune_engages_down.sql.
-- arma_spawn_engages gets a row per engage and nothing deleted any (abuse review, 26 Oct 2026): an account can open max_open engages per engage_ttl_s for ever.
-- arma_prune_engages() deletes the engages that can no longer be used, once they are older than arma_config.engage_keep_s (a day): ones that were used or
-- closed (used_at) and ones that expired unused (expires_at). An open engage that has not expired is never touched. The writer calls it on a timer
-- (server/data/rate-limits.json, maintenance.pruneEngagesEveryMs). Returns the number of rows deleted. Nothing references the table, so deletes cascade nowhere.
insert into public.arma_config (key, value) values ('engage_keep_s', '86400'::jsonb) on conflict (key) do nothing;

create function public.arma_prune_engages() returns int language plpgsql security definer set search_path = '' as $$
declare keep int; n int;
begin
  select (value #>> '{}')::int into keep from public.arma_config where key = 'engage_keep_s';
  if keep is null or keep < 3600 then return 0; end if; -- no row, or a keep window under an hour: delete nothing
  delete from public.arma_spawn_engages
   where coalesce(used_at, expires_at) < now() - make_interval(secs => keep) and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.arma_prune_engages() from public, anon, authenticated;
grant execute on function public.arma_prune_engages() to arma_writer;
commit;
