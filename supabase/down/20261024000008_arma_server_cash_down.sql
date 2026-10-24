begin;
-- Restores arma_save_run as 20261024000007_arma_save_envelope.sql made it (no cash check) and removes what 000008 added. Cash tallies are discarded.
drop trigger arma_events_grant_cash on public.arma_events;
create or replace function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int, p_seq int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int; why text; h text; answer jsonb; existed boolean;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then raise exception 'not this account''s character' using errcode = 'O0007'; end if;
  if p_seq is null or p_seq < 1 then return jsonb_build_object('refused', 'seq'); end if;
  h := encode(sha256(convert_to(p_era::text || ':' || p_expected_revision::text || ':' || coalesce(p_record::text, ''), 'UTF8')), 'hex');
  select * into r from public.arma_runs where character = p_character for update;
  existed := found; -- FOUND is reset by every later SELECT INTO
  if existed then
    if p_seq = r.last_seq then
      if r.last_hash = h then return r.last_result || jsonb_build_object('replayed', true); end if;
      return jsonb_build_object('refused', 'seq-conflict', 'lastSeq', r.last_seq);
    end if;
    if p_seq < r.last_seq then return jsonb_build_object('refused', 'stale-seq', 'lastSeq', r.last_seq); end if;
  end if;
  select (value #>> '{}')::int into lo from public.arma_config where key = 'oldest_era';
  select (value #>> '{}')::int into hi from public.arma_config where key = 'current_era';
  if p_era < lo or p_era > hi then return jsonb_build_object('refused', 'era', 'currentEra', hi); end if;
  if jsonb_typeof(p_record) <> 'object' or (p_record ->> 'version') is distinct from p_era::text then return jsonb_build_object('refused', 'shape'); end if;
  if not existed then
    if p_expected_revision <> 0 then return jsonb_build_object('refused', 'stale', 'revision', 0); end if;
  elsif p_expected_revision <> r.revision then
    return jsonb_build_object('refused', 'stale', 'revision', r.revision);
  end if;
  why := public.arma_check_record(p_record);
  if why is not null then return jsonb_build_object('refused', split_part(why, ':', 1), 'reason', why); end if;
  if not existed then
    begin
      insert into public.arma_runs (character, era, record) values (p_character, p_era, p_record) returning * into r;
    exception when unique_violation then
      -- A concurrent first save won the race: this phone is stale, not broken.
      return jsonb_build_object('refused', 'stale', 'revision', 1);
    end;
  else
    update public.arma_runs set era = p_era, record = p_record, revision = r.revision + 1, saved_at = now() where character = p_character returning * into r;
  end if;
  answer := jsonb_build_object('revision', r.revision, 'savedAt', r.saved_at);
  update public.arma_runs set last_seq = p_seq, last_hash = h, last_result = answer where character = p_character;
  return answer;
end $$;
drop function public.arma_grant_kill_cash();
drop function public.arma_cash_ceiling(text);
drop table public.arma_cash;
drop table public.arma_payout_rules;
delete from public.arma_config where key in ('start_cash_total', 'enforce_cash');
commit;
