begin;
-- ROLLBACK: supabase/down/20261105000032_arma_safehouse_upgrades_down.sql.
-- Permanent safehouse upgrades (Q2 of the server design). A character buys a level of an upgrade with cash; the level lives in its own table, NOT in the
-- run record (a retry or reset rewrites the record; an upgrade is permanent). The buy is modelled on arma_market_trade (000026 + 000028):
--  1. Idempotent on request_id (arma_market_requests, op 'upgrade', pruned after 7 days by arma_prune_market_requests); the same request id with other
--     arguments is a request-conflict.
--  2. The price is read from arma_upgrade_defs, never from the phone. Buying needs price <= arma_cash_ceiling before the debit, so a phone can never
--     spend cash the server has not granted. The debit raises `spent` (so the ceiling falls with it) and lowers the stored record's carried, then bank.
--  3. Levels are bought in order, one at a time: p_to_level must be exactly the current level + 1. A retried or stale tap therefore can never charge twice.
--  4. Guests (anonymous sessions) play but do not trade, and nothing is sold when cash is not enforced (a buy would be unbounded), as in the market.
-- No damage upgrade exists on purpose: damage is bounded by arma_weapon_rules, which would need a reseed and a presence restart. The three upgrades are
-- +1 reserve magazine for the pistol and rifle, +10 maximum stamina per level, and 10% less dodge recovery per level; the server stores levels and
-- prices only, the effects are applied by the client (Web/src/data/safehouseUpgrades.json carries the same ids, max levels and prices; a test pins them).
create table public.arma_upgrade_defs (
  id text primary key check (id ~ '^[a-z0-9-]{1,32}$'),
  max_level smallint not null check (max_level between 1 and 20),
  price int[] not null,
  check (cardinality(price) = max_level and array_position(price, null) is null and 1 <= all (price) and 1000000 >= all (price))
);
create table public.arma_upgrades (
  character text not null references public.arma_characters (id) on delete cascade,
  upgrade_id text not null references public.arma_upgrade_defs (id),
  level smallint not null check (level between 1 and 20),
  bought_at timestamptz not null default now(),
  primary key (character, upgrade_id)
);
alter table public.arma_upgrade_defs enable row level security;
alter table public.arma_upgrades enable row level security;
revoke all on public.arma_upgrade_defs, public.arma_upgrades from public, anon, authenticated;
-- An account may READ its own levels (RLS); nobody can write them except through the security definer rpc below.
grant select on public.arma_upgrades, public.arma_upgrade_defs to authenticated;
create policy "an account reads its own upgrades" on public.arma_upgrades for select to authenticated using (public.arma_me_owns(character) and public.arma_me_allowed());
create policy "everyone signed in reads the upgrade defs" on public.arma_upgrade_defs for select to authenticated using (true);

insert into public.arma_upgrade_defs (id, max_level, price) values
  ('reserve-magazine', 3, array[400, 900, 1600]),
  ('stamina', 5, array[300, 600, 1000, 1500, 2200]),
  ('dodge-recovery', 5, array[300, 600, 1000, 1500, 2200]);

-- [{upgrade_id, level}] for a character, in id order. Internal.
create function public.arma_upgrades_json(p_character text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('upgrade_id', upgrade_id, 'level', level) order by upgrade_id), '[]'::jsonb) from public.arma_upgrades where character = p_character;
$$;

-- The reader's own levels and wallet (through the writer: p_account is the verified account): {upgrades, cash, bank, ceiling}.
create function public.arma_upgrades_get(p_account uuid, p_character text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  return jsonb_build_object('upgrades', public.arma_upgrades_json(p_character)) || public.arma_wallet(p_account, p_character);
end $$;

-- Buys level p_to_level of p_upgrade. Returns the answer; stores it for replay when it succeeded.
create function public.arma_upgrade_buy(p_account uuid, p_character text, p_upgrade text, p_to_level int, p_request text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.arma_upgrade_defs; prev public.arma_market_requests; h text; cur int; total int; purse numeric; run public.arma_runs; carried numeric; bank numeric; answer jsonb;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  if coalesce((select is_anonymous from auth.users where id = p_account), false) then return jsonb_build_object('ok', false, 'error', 'guest'); end if;
  if p_request is null or p_request !~ '^[A-Za-z0-9_-]{8,64}$' or p_upgrade is null or p_to_level is null or p_to_level < 1 or p_to_level > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad-request');
  end if;
  if public.arma_cash_ceiling(p_character) is null then return jsonb_build_object('ok', false, 'error', 'cash-not-enforced'); end if;
  insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing;
  perform 1 from public.arma_cash where character = p_character for update; -- serialises this character's kills, buys, sells and upgrades
  h := encode(sha256(convert_to('upgrade:' || p_upgrade || ':' || p_to_level::text, 'UTF8')), 'hex');
  select * into prev from public.arma_market_requests where character = p_character and request_id = p_request;
  if found then
    if prev.args_hash = h then return prev.result || jsonb_build_object('replayed', true); end if;
    return jsonb_build_object('ok', false, 'error', 'request-conflict');
  end if;
  select * into d from public.arma_upgrade_defs where id = p_upgrade;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown-upgrade'); end if;
  select level into cur from public.arma_upgrades where character = p_character and upgrade_id = p_upgrade for update;
  cur := coalesce(cur, 0);
  if p_to_level > d.max_level then return jsonb_build_object('ok', false, 'error', 'max-level', 'level', cur); end if;
  if p_to_level <= cur then return jsonb_build_object('ok', false, 'error', 'already-owned', 'level', cur); end if;
  if p_to_level <> cur + 1 then return jsonb_build_object('ok', false, 'error', 'level-order', 'level', cur); end if;
  total := d.price[p_to_level];
  purse := coalesce(public.arma_cash_ceiling(p_character), 0);
  if purse < total then return jsonb_build_object('ok', false, 'error', 'insufficient-cash', 'ceiling', purse); end if;
  update public.arma_cash set spent = least(spent + total, 1000000000) where character = p_character;
  insert into public.arma_upgrades (character, upgrade_id, level) values (p_character, p_upgrade, p_to_level)
    on conflict (character, upgrade_id) do update set level = excluded.level, bought_at = now();
  select * into run from public.arma_runs where character = p_character for update;
  if run.character is not null then -- keep the stored record in step (no revision bump: a phone's next save is clamped to the ceiling, never refused)
    carried := coalesce((run.record #>> '{marked,carried}')::numeric, 0);
    bank := coalesce((run.record #>> '{marked,bank}')::numeric, 0);
    bank := bank - greatest(total - carried, 0);
    carried := greatest(carried - total, 0);
    if bank < 0 then bank := 0; end if;
    update public.arma_runs set record = jsonb_set(jsonb_set(record, '{marked,carried}', to_jsonb(carried::bigint)), '{marked,bank}', to_jsonb(bank::bigint)) where character = p_character;
  end if;
  answer := jsonb_build_object('ok', true, 'upgrade', p_upgrade, 'level', p_to_level, 'delta', -total, 'cash', coalesce(carried, 0)::bigint, 'bank', coalesce(bank, 0)::bigint,
    'ceiling', coalesce(public.arma_cash_ceiling(p_character), 1000000000), 'upgrades', public.arma_upgrades_json(p_character), 'replayed', false);
  insert into public.arma_market_requests (character, request_id, op, args_hash, result) values (p_character, p_request, 'upgrade', h, answer);
  return answer;
end $$;

revoke all on function public.arma_upgrades_json(text), public.arma_upgrades_get(uuid, text), public.arma_upgrade_buy(uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.arma_upgrades_get(uuid, text), public.arma_upgrade_buy(uuid, text, text, int, text) to arma_writer;
commit;
