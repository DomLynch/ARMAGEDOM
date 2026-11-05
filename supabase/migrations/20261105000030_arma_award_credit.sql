begin;
-- ROLLBACK: supabase/down/20261105000030_arma_award_credit_down.sql (roll back 20261105000031 first if it is applied).
-- KILL CASH ONLINE. The client pays a kill from progression.awards (Web/src/engine/marked-core.js: one row per placement, $100, a boss $200) and raises
-- marked.carried in the same record. Online, the cash ceiling (arma_cash_ceiling = start + earned - spent) threw that cash away, because `earned` only rose
-- from server-settled kills (arma_spawn_hit) and the claim_pickup kill tiers, and the client never calls the settle. So every online full clear (71 x $100
-- + 7 bosses x $200 = $8,500) was clamped back to nothing.
-- This file credits the cash from the record the player saves, and nothing the player says is trusted beyond which placements it names:
--   * arma_placement_cash: what each placement pays, seeded from the game's own tables (server/data/generate-payout-seed.mjs --placements; the
--     instance is "<areaId>:<placementKey>", the key the awards carry). 78 rows: both animal cycles (A and B) name the same 78 placements and only five
--     change creature kind between them, so the union is also 78. A pinned test fails when the game's placements or rates drift from these rows.
--   * arma_save_run now diffs the awards of the record being saved against the awards of the record already stored, keeps the placements that have a row,
--     once each, and credits their cash to arma_cash.earned BEFORE the clamp (so the clamp sees it) and writes one arma_award_credits row per credit.
--     Existing awards on a stored run are not back-credited (the stored record already holds them), and a retry that resets the awards simply
--     starts counting again from the new record.
--   * The credit is capped per ACCOUNT over a rolling HOUR with arma_world_config.kills_per_hour (120 as shipped; one UPDATE retunes it): a forged
--     record that toggles awards on and off can farm at most 120 x $200 = $24,000 an hour. There is deliberately no per-minute cap: an honest save can
--     carry a burst of new awards (20 kills before the phone saves), and a credit dropped by a minute cap is gone for good. A credit past the hourly
--     cap is dropped (the stored record then holds its award, so it is not offered again) and counted in the reply.
-- The reply gains `awarded` (cash credited by this save) and `awardCapped` (credits dropped by the cap), each only when above zero.
-- Signature, grants and every other behaviour of arma_save_run are as 000029 left them; each addition is marked "000030" below (a pinned test diffs this
-- function against 000029). Lock order: the character's arma_cash row first, then its run (as arma_market_trade does), so a save and a trade cannot
-- deadlock; a transaction-level advisory lock on the character closes the first-save race, so a credit is never written for a save that the
-- first-save unique key then refuses.
-- Limits that stay: the awards in a record are the phone's word, so a forged record can still name placements it never killed; it is bounded by the
-- window above and by the 78 rows. A death that drops the cash still credits the awards it saved (the ceiling rises, no cash is handed out).

create table public.arma_placement_cash (
  instance text primary key check (instance ~ '^[a-z0-9._:-]{1,96}$'),
  cash int not null check (cash between 0 and 1000000)
);
-- One row per credit. No unique key on (character, instance): a retry resets the awards, so the same placement can be credited again in a later life.
create table public.arma_award_credits (
  id bigint generated always as identity primary key,
  character text not null references public.arma_characters (id) on delete cascade,
  account uuid not null,
  instance text not null references public.arma_placement_cash (instance),
  cash int not null check (cash > 0),
  at timestamptz not null default now()
);
create index arma_award_credits_recent on public.arma_award_credits (account, at);
alter table public.arma_placement_cash enable row level security;
alter table public.arma_award_credits enable row level security;
revoke all on public.arma_placement_cash, public.arma_award_credits from public, anon, authenticated;

-- Generated: node server/data/generate-payout-seed.mjs --placements
insert into public.arma_placement_cash (instance, cash) values
  ('area7:area7-resident-1', 100),
  ('area7:area7-resident-2', 100),
  ('area7:area7-resident-3', 100),
  ('area7:area7-resident-4', 100),
  ('area7:area7-resident-5', 100),
  ('area7:area7-resident-6', 100),
  ('area7:area7-resident-7', 100),
  ('area7:area7-resident-8', 100),
  ('area7:area7-station-rat-v1', 100),
  ('area7:boss-knight-v1', 200),
  ('area8:area8-resident-1', 100),
  ('area8:area8-resident-10', 100),
  ('area8:area8-resident-3', 100),
  ('area8:area8-resident-4', 100),
  ('area8:area8-resident-5', 100),
  ('area8:area8-resident-6', 100),
  ('area8:area8-resident-7', 100),
  ('area8:area8-resident-8', 100),
  ('area8:area8-resident-9', 100),
  ('area8:boss-veteran-v1', 200),
  ('east-bridge:boss-warden-v1', 200),
  ('east-bridge:east-bridge-resident-1', 100),
  ('east-bridge:east-bridge-resident-2', 100),
  ('east-bridge:east-bridge-resident-3', 100),
  ('east-bridge:east-bridge-resident-4', 100),
  ('east-bridge:east-bridge-resident-5', 100),
  ('east-bridge:east-bridge-resident-6', 100),
  ('east-bridge:east-bridge-resident-7', 100),
  ('east-bridge:east-bridge-resident-8', 100),
  ('east-bridge:east-bridge-resident-9', 100),
  ('east:east-roamer-1', 100),
  ('east:east-roamer-10', 100),
  ('east:east-roamer-11', 100),
  ('east:east-roamer-12', 100),
  ('east:east-roamer-2', 100),
  ('east:east-roamer-3', 100),
  ('east:east-roamer-4', 100),
  ('east:east-roamer-5', 100),
  ('east:east-roamer-6', 100),
  ('east:east-roamer-8', 100),
  ('elephant-and-castle:boss-butcher-v1', 200),
  ('elephant-and-castle:elephant-and-castle-resident-1', 100),
  ('elephant-and-castle:elephant-and-castle-resident-2', 100),
  ('elephant-and-castle:elephant-and-castle-resident-3', 100),
  ('elephant-and-castle:elephant-and-castle-resident-4', 100),
  ('elephant-and-castle:elephant-and-castle-resident-5', 100),
  ('elephant-and-castle:elephant-and-castle-resident-6', 100),
  ('elephant-and-castle:elephant-and-castle-resident-7', 100),
  ('elephant-and-castle:elephant-and-castle-resident-8', 100),
  ('elephant-and-castle:elephant-and-castle-resident-9', 100),
  ('lambeth:boss-surgeon-v1', 200),
  ('lambeth:lambeth-resident-1', 100),
  ('lambeth:lambeth-resident-2', 100),
  ('lambeth:lambeth-resident-3', 100),
  ('lambeth:lambeth-resident-4', 100),
  ('lambeth:lambeth-resident-5', 100),
  ('lambeth:lambeth-resident-6', 100),
  ('lambeth:lambeth-resident-7', 100),
  ('lambeth:lambeth-resident-8', 100),
  ('lambeth:lambeth-resident-9', 100),
  ('south:boss-nightborn-v1', 200),
  ('south:south-drone-1', 100),
  ('south:south-roamer-1', 100),
  ('south:south-roamer-10', 100),
  ('south:south-roamer-11', 100),
  ('south:south-roamer-12', 100),
  ('south:south-roamer-2', 100),
  ('south:south-roamer-4', 100),
  ('south:south-roamer-6', 100),
  ('south:south-roamer-9', 100),
  ('westminster:boss-witch-v1', 200),
  ('westminster:westminster-roamer-1', 100),
  ('westminster:westminster-roamer-2', 100),
  ('westminster:westminster-roamer-3', 100),
  ('westminster:westminster-roamer-4', 100),
  ('westminster:westminster-roamer-6', 100),
  ('westminster:westminster-roamer-7', 100),
  ('westminster:westminster-roamer-8', 100)
on conflict (instance) do update set cash = excluded.cash;

-- The placements in p_new's progression.awards that p_old's do not have, that have a row above and a free window slot, paid and written once each.
-- Highest cash first, then by name, so the order is the same on a retry. Returns {cash, kills, capped}. Internal: callable only from arma_save_run.
create function public.arma_credit_awards(p_account uuid, p_character text, p_old jsonb, p_new jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.arma_world_config; used_hour int; room int; paid int := 0; kills int := 0; capped int := 0; c record;
begin
  select * into cfg from public.arma_world_config;
  select count(*)::int into used_hour from public.arma_award_credits where account = p_account and at > now() - interval '1 hour';
  room := greatest(cfg.kills_per_hour - used_hour, 0);
  for c in
    select n.instance, k.cash
    from (select distinct (e ->> 'areaId') || ':' || (e ->> 'placementKey') as instance
          from jsonb_array_elements(case when jsonb_typeof(p_new #> '{progression,awards}') = 'array' then p_new #> '{progression,awards}' else '[]'::jsonb end) e) n
    join public.arma_placement_cash k on k.instance = n.instance
    where k.cash > 0 and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(p_old #> '{progression,awards}') = 'array' then p_old #> '{progression,awards}' else '[]'::jsonb end) o
      where (o ->> 'areaId') || ':' || (o ->> 'placementKey') = n.instance)
    order by k.cash desc, n.instance
  loop
    if kills >= room then
      capped := capped + 1;
    else
      insert into public.arma_award_credits (character, account, instance, cash) values (p_character, p_account, c.instance, c.cash);
      paid := paid + c.cash;
      kills := kills + 1;
    end if;
  end loop;
  if paid > 0 then
    insert into public.arma_cash (character, earned) values (p_character, paid)
      on conflict (character) do update set earned = least(public.arma_cash.earned + excluded.earned, 1000000000);
  end if;
  return jsonb_build_object('cash', paid, 'kills', kills, 'capped', capped);
end $$;
revoke all on function public.arma_credit_awards(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- The drift reader (000014, 000027) reads the seeded rule tables so the hosted rows can be compared with these. Same shape, one more table.
do $grant$
begin
  grant select on public.arma_placement_cash to arma_drift_reader;
  create policy "the drift reader reads the seeded rows" on public.arma_placement_cash for select to arma_drift_reader using (true);
end
$grant$;

-- arma_save_run as 000029 left it, plus the additions marked "000030".
create or replace function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int, p_seq int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int; why text; h text; answer jsonb; existed boolean; rec jsonb := p_record; ceiling numeric; carried numeric; bank numeric; excess numeric; un text[]; bag numeric; took numeric; awarded jsonb;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then raise exception 'not this account''s character' using errcode = 'O0007'; end if;
  if p_seq is null or p_seq < 1 then return jsonb_build_object('refused', 'seq'); end if;
  insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing; -- 000030: lock the cash row before the run row, as the market does
  perform 1 from public.arma_cash where character = p_character for update; -- 000030
  perform pg_advisory_xact_lock(hashtextextended(p_character, 0)); -- 000030: one save of a character at a time, so a credit is never written for a save the first-save key refuses
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
  awarded := public.arma_credit_awards(p_account, p_character, case when existed then r.record end, p_record); -- 000030: the kills this save adds, credited before the clamp
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
  if (awarded ->> 'cash')::int > 0 then answer := answer || jsonb_build_object('awarded', awarded -> 'cash'); end if; -- 000030
  if (awarded ->> 'capped')::int > 0 then answer := answer || jsonb_build_object('awardCapped', awarded -> 'capped'); end if; -- 000030
  if cardinality(un) > 0 then
    answer := answer || jsonb_build_object('unreceipted', to_jsonb(un));
    insert into public.arma_unreceipted_seen (character, item) select p_character, s.item from public.arma_item_sources s where s.path = any (un)
      on conflict (character, item) do update set saves = public.arma_unreceipted_seen.saves + 1, last_seen = now();
  end if;
  update public.arma_runs set last_seq = p_seq, last_hash = h, last_result = answer where character = p_character;
  return answer;
end $$;
commit;
