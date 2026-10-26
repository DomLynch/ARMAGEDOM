begin;
-- ROLLBACK: supabase/down/20261026000015_arma_character_cap_down.sql.
-- An account may own at most arma_config.max_characters characters (5). Without a cap one guest account could create characters in a loop and
-- save a record of up to 64 KB into each (abuse review, 26 Oct 2026): the free-tier database would fill in a day. The count is taken under a
-- per-account advisory lock so two parallel requests cannot both pass it. Past the cap the call raises O0010 and writes nothing.
insert into public.arma_config (key, value) values ('max_characters', '5'::jsonb) on conflict (key) do nothing;

create or replace function public.arma_create_character(p_account uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare cid text; cap int;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  perform pg_advisory_xact_lock(hashtextextended('arma_create_character:' || p_account::text, 0));
  select (value #>> '{}')::int into cap from public.arma_config where key = 'max_characters';
  if cap is not null and (select count(*) from public.arma_characters where account = p_account) >= cap then
    raise exception 'this account already has % characters', cap using errcode = 'O0010';
  end if;
  cid := 'pc:' || replace(gen_random_uuid()::text, '-', '');
  insert into public.arma_characters (id, account, name) values (cid, p_account, p_name);
  insert into public.arma_active_character (account, character) values (p_account, cid)
    on conflict (account) do update set character = excluded.character, set_at = now();
  return cid;
end $$;
commit;
