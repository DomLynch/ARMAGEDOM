begin;
-- Puts arma_create_character back as migration 000001 made it (no cap) and removes the cap row. Characters already created stay.
create or replace function public.arma_create_character(p_account uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare cid text;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  cid := 'pc:' || replace(gen_random_uuid()::text, '-', '');
  insert into public.arma_characters (id, account, name) values (cid, p_account, p_name);
  insert into public.arma_active_character (account, character) values (p_account, cid)
    on conflict (account) do update set character = excluded.character, set_at = now();
  return cid;
end $$;
delete from public.arma_config where key = 'max_characters';
commit;
