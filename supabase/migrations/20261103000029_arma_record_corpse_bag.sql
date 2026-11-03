begin;
-- ROLLBACK: supabase/down/20261103000029_arma_record_corpse_bag_down.sql.
-- The death body bag (Web/src/engine/corpse-run.js) is saved in the run record, in the same write as the cash and the weapon it took, so a
-- reload no longer loses it. The record gets one new top-level key, `corpseBag`: absent, or
--   { areaId, position: {x, z}, cash, gearId, gearName, remaining }
-- `remaining` is the play seconds left before scavengers take the cash. Every number is capped: cash like the other money fields, the position by
-- the existing '*position.x' and '*position.z' rows (so it stays fractional), remaining 0..3600 (the game's own limit is 240) and fractional.
-- The strings (areaId, gearId, gearName) fall under the default string length.
insert into public.arma_record_keys (key) values ('corpseBag') on conflict do nothing;
insert into public.arma_record_caps (path_pattern, kind, min_value, max_value, integer_only) values
  ('corpseBag.cash', 'num', 0, 1000000000, true),
  ('corpseBag.remaining', 'num', 0, 3600, false)
on conflict do nothing;

-- CASH. The bag holds cash that already left `marked.carried`; taking it back is a transfer, never new money. arma_cash_ceiling is
-- greatest(start + earned - spent, what the stored run already holds), and a character whose balance is above start + earned - spent (cash
-- the server never granted) is allowed it only through the "already holds" term. A death moves that cash out of the stored carried and into
-- the bag, so without this change the pickup would push carried over the ceiling and the clamp would take the whole bag. So, in arma_save_run
-- only (the market's arma_cash_ceiling is untouched, so bag cash can never be spent there):
--   * what the stored run already holds counts its bag cash too, and
--   * the clamped total is carried + bank + bag, taken from the BAG first (a bag is the newest unverified number), then carried, then the bank.
--     A forged bag therefore cannot mint cash. A bag clamped to 0 with no weapon in it is removed (an empty bag is not a valid record).
-- The reply carries `bag` (the bag's cash after the clamp) next to `carried` and `bank` when it clamped, for the phone to adopt.
-- Otherwise identical to arma_save_run as 000010 left it.
create or replace function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int, p_seq int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int; why text; h text; answer jsonb; existed boolean; rec jsonb := p_record; ceiling numeric; carried numeric; bank numeric; excess numeric; un text[]; bag numeric; took numeric;
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
  -- The clamp: carried + bank + bag, the bag first, then carried, then the bank.
  ceiling := public.arma_cash_ceiling(p_character);
  carried := coalesce((p_record #>> '{marked,carried}')::numeric, 0);
  bank := coalesce((p_record #>> '{marked,bank}')::numeric, 0);
  bag := coalesce((p_record #>> '{corpseBag,cash}')::numeric, 0);
  if ceiling is not null then
    ceiling := greatest(ceiling, coalesce((select coalesce((record #>> '{marked,carried}')::numeric, 0) + coalesce((record #>> '{marked,bank}')::numeric, 0) + coalesce((record #>> '{corpseBag,cash}')::numeric, 0) from public.arma_runs where character = p_character), 0));
  end if;
  if ceiling is not null and carried + bank + bag > ceiling then
    excess := carried + bank + bag - ceiling;
    took := least(excess, bag);
    bag := bag - took;
    excess := excess - took;
    bank := bank - greatest(excess - carried, 0);
    carried := greatest(carried - excess, 0);
    rec := jsonb_set(jsonb_set(rec, '{marked,carried}', to_jsonb(carried::bigint)), '{marked,bank}', to_jsonb(bank::bigint));
    if rec ? 'corpseBag' then
      if bag = 0 and (rec #>> '{corpseBag,gearId}') is null then rec := rec - 'corpseBag';
      else rec := jsonb_set(rec, '{corpseBag,cash}', to_jsonb(bag::bigint)); end if;
    end if;
  else
    ceiling := null; -- not clamped
  end if;
  un := public.arma_unreceipted(p_character, p_record); -- report only: never alters `rec`
  if not existed then
    begin
      insert into public.arma_runs (character, era, record) values (p_character, p_era, rec) returning * into r;
    exception when unique_violation then
      -- A concurrent first save won the race: this phone is stale, not broken.
      return jsonb_build_object('refused', 'stale', 'revision', 1);
    end;
  else
    update public.arma_runs set era = p_era, record = rec, revision = r.revision + 1, saved_at = now() where character = p_character returning * into r;
  end if;
  answer := jsonb_build_object('revision', r.revision, 'savedAt', r.saved_at);
  if ceiling is not null then answer := answer || jsonb_build_object('clamped', true, 'carried', carried, 'bank', bank, 'bag', bag); end if;
  if cardinality(un) > 0 then
    answer := answer || jsonb_build_object('unreceipted', to_jsonb(un));
    insert into public.arma_unreceipted_seen (character, item) select p_character, s.item from public.arma_item_sources s where s.path = any (un)
      on conflict (character, item) do update set saves = public.arma_unreceipted_seen.saves + 1, last_seen = now();
  end if;
  update public.arma_runs set last_seq = p_seq, last_hash = h, last_result = answer where character = p_character;
  return answer;
end $$;
commit;
