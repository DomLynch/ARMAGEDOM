begin;
-- Open access under a flag (Dom's ruling: anyone with the link plays, guests included). arma_allowed stays the one gate every function and
-- policy already calls. With arma_enabled = true:
--   arma_open_access = false (the default): only accounts with an arma_access row, exactly as before (the closed alpha list);
--   arma_open_access = true: any account that exists in auth.users, which includes a guest's anonymous Supabase session.
-- There is no per-account grant to write, so nothing can fail to be granted; turning the flag off closes the world to everyone not on the list.
-- arma_enabled = false still refuses everyone, whatever else is set (the kill switch).
insert into public.arma_config (key, value) values ('arma_open_access', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.arma_allowed(p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_enabled'), false)
     and (
       exists (select 1 from public.arma_access where account = p_account)
       or (coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_open_access'), false)
           and exists (select 1 from auth.users where id = p_account))
     )
$$;
-- create or replace keeps the existing grants (none to clients: they reach it only through arma_me_allowed).
commit;
