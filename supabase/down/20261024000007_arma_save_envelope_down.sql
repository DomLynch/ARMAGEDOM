begin;
-- Restores arma_save_run as 20261024000001_arma_core.sql created it (no sequence number, no record check) and removes what 000007 added.
drop function public.arma_save_run(uuid, text, int, jsonb, int, int);
drop function public.arma_check_record(jsonb);
drop table public.arma_record_caps;
drop table public.arma_record_keys;
delete from public.arma_config where key in ('record_max_bytes', 'record_max_nodes', 'record_max_depth', 'record_default_number', 'record_default_string');
alter table public.arma_runs drop column last_seq, drop column last_hash, drop column last_result;

create function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then raise exception 'not this account''s character' using errcode = 'O0007'; end if;
  select (value #>> '{}')::int into lo from public.arma_config where key = 'oldest_era';
  select (value #>> '{}')::int into hi from public.arma_config where key = 'current_era';
  if p_era < lo or p_era > hi then return jsonb_build_object('refused', 'era', 'currentEra', hi); end if;
  if jsonb_typeof(p_record) <> 'object' or (p_record ->> 'version') is distinct from p_era::text then return jsonb_build_object('refused', 'shape'); end if;
  select * into r from public.arma_runs where character = p_character for update;
  if not found then
    if p_expected_revision <> 0 then return jsonb_build_object('refused', 'stale', 'revision', 0); end if;
    insert into public.arma_runs (character, era, record) values (p_character, p_era, p_record) returning * into r;
  else
    if p_expected_revision <> r.revision then return jsonb_build_object('refused', 'stale', 'revision', r.revision); end if;
    update public.arma_runs set era = p_era, record = p_record, revision = r.revision + 1, saved_at = now() where character = p_character returning * into r;
  end if;
  return jsonb_build_object('revision', r.revision, 'savedAt', r.saved_at);
end $$;
revoke all on function public.arma_save_run(uuid, text, int, jsonb, int) from public, anon, authenticated;
grant execute on function public.arma_save_run(uuid, text, int, jsonb, int) to arma_writer;
commit;
