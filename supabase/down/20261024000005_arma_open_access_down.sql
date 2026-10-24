begin;
-- Restores arma_allowed as 20261024000001_arma_core.sql created it (the access list only) and removes the flag.
create or replace function public.arma_allowed(p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_enabled'), false)
     and exists (select 1 from public.arma_access where account = p_account)
$$;
delete from public.arma_config where key = 'arma_open_access';
commit;
