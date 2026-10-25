begin;
-- ROLLBACK: supabase/down/20261024000011_arma_world_status_down.sql.
-- The one cheap read the client (and presence) makes before anything else: is the world on, is it open to everyone, and (given an account) may THIS account in.
--   enabled = arma_config.arma_enabled (the kill switch), open = arma_config.arma_open_access, allowed = arma_allowed(account) (only when an account is given).
-- Raw flags only: nothing about accounts, characters or counts. Called by the writer (GET /arma/status, POST /internal/status); no client role may call it.
create function public.arma_world_status(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'enabled', coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_enabled'), false),
           'open', coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_open_access'), false))
         || case when p_account is null then '{}'::jsonb else jsonb_build_object('allowed', public.arma_allowed(p_account)) end
$$;
revoke all on function public.arma_world_status(uuid) from public, anon, authenticated;
grant execute on function public.arma_world_status(uuid) to arma_writer;
commit;
