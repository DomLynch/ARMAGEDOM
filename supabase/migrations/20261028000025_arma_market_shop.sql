begin;
-- ROLLBACK: supabase/down/20261028000025_arma_market_shop_down.sql.
-- Market part B (docs/MARKET-CONTRACT.md): the global NPC shop. The stock list is a pure function of the shop template rows and the UTC day, so it is identical
-- for every player in every session with no job to run (Strategy's daily roll_daily is therefore not needed in v1; a rotation is a row with active_day set).
-- Prices are fixed rows: no player pricing, no depletion. buy_item / sell_item are idempotent on request_id (arma_market_requests, migration 000024).
--
-- CASH INVARIANTS (the cash lives in the stored run record's marked.carried/bank, clamped at every save to arma_cash_ceiling):
--  1. ceiling = max(held, start_cash_total + earned - spent), floored at 0. A buy raises `spent`; a sell raises `earned` (a server credit, like a kill).
--  2. Buying needs price*qty <= ceiling before the debit, so a phone can never spend cash the server has not granted. The debit also lowers the stored
--     record (carried first, then bank) so `held` falls with it; a later save of an older, richer record is clamped to the new, lower ceiling.
--  3. A sell credits `earned` and the stored record's carried by the same amount, so it can never lift the record above the ceiling.
--  4. No loop mints cash: every stock row has sell_price <= buy_price, and across all shops no item's best sell price exceeds its lowest buy price (trigger).
--  5. Spending elsewhere is still the client's word (unchanged): ceiling is an upper bound on what a character can hold, not an exact balance.
alter table public.arma_cash add column spent int not null default 0 check (spent between 0 and 1000000000);

create table public.arma_shop_stock (
  shop_id text not null check (shop_id ~ '^[a-z0-9-]{1,32}$'),
  item_id text not null references public.arma_items (id),
  buy_price int check (buy_price between 1 and 1000000),   -- what the PLAYER pays; null = the shop does not sell it
  sell_price int check (sell_price between 0 and 1000000), -- what the PLAYER receives; null = the shop does not buy it
  active_day smallint check (active_day between 0 and 6), -- UTC day of week (0 = Sunday); null = every day
  check (buy_price is not null or sell_price is not null),
  check (buy_price is null or sell_price is null or sell_price <= buy_price)
);
create unique index arma_shop_stock_row on public.arma_shop_stock (shop_id, item_id, coalesce(active_day, -1));
alter table public.arma_shop_stock enable row level security;
revoke all on public.arma_shop_stock from public, anon, authenticated;
grant select on public.arma_shop_stock to authenticated;
create policy "everyone signed in reads the shop" on public.arma_shop_stock for select to authenticated using (true);

create function public.arma_shop_no_loop() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select max(sell_price) from public.arma_shop_stock where item_id = new.item_id) > coalesce((select min(buy_price) from public.arma_shop_stock where item_id = new.item_id), 2147483647) then
    raise exception 'shop prices for % would let a buy then sell mint cash', new.item_id using errcode = 'O0002';
  end if;
  return null;
end $$;
create constraint trigger arma_shop_stock_no_loop after insert or update on public.arma_shop_stock for each row execute function public.arma_shop_no_loop();
revoke all on function public.arma_shop_no_loop() from public, anon, authenticated;

insert into public.arma_shop_stock (shop_id, item_id, buy_price, sell_price) values
  ('hub-trader', 'ammo-pack', 60, 20),
  ('hub-trader', 'medkit-pack', 120, 40),
  ('hub-trader', 'vest-patch', 250, 80),
  ('hub-trader', 'hunter-cpu', null, 150),
  ('hub-trader', 'roach-mandibles', null, 40),
  ('hub-trader', 'salamander-gland', null, 180),
  ('hub-trader', 'military-battery', null, 120),
  ('hub-trader', 'robot-parts', null, 90),
  ('hub-trader', 'drone-chip', null, 140);

-- Same as 000008 plus `spent`.
create or replace function public.arma_cash_ceiling(p_character text) returns numeric language plpgsql stable security definer set search_path = '' as $$
declare allowed numeric; held numeric;
begin
  if not coalesce((select value = 'true'::jsonb from public.arma_config where key = 'enforce_cash'), true) then return null; end if;
  allowed := greatest(0, coalesce((select (value #>> '{}')::numeric from public.arma_config where key = 'start_cash_total'), 0)
           + coalesce((select earned - spent from public.arma_cash where character = p_character), 0));
  held := coalesce((select coalesce((record #>> '{marked,carried}')::numeric, 0) + coalesce((record #>> '{marked,bank}')::numeric, 0) from public.arma_runs where character = p_character), 0);
  return greatest(allowed, held);
end $$;

-- Today's rows for a shop, identical for everyone: [{item_id, name, buy_price, sell_price}].
create function public.arma_market_stock(p_account uuid, p_shop text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', i.name, 'buy_price', s.buy_price, 'sell_price', s.sell_price) order by s.item_id)
    from public.arma_shop_stock s join public.arma_items i on i.id = s.item_id
    where s.shop_id = p_shop and (s.active_day is null or s.active_day = extract(dow from now() at time zone 'utc')::int)
  ), '[]'::jsonb);
end $$;

-- Shared by buy and sell. p_sign: -1 buy (debit), +1 sell (credit). Returns the answer; stores it for replay when it succeeded.
create function public.arma_market_trade(p_account uuid, p_character text, p_op text, p_shop text, p_item text, p_qty int, p_request text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.arma_shop_stock; prev public.arma_market_requests; h text; price int; total int; have int; purse numeric; run public.arma_runs;
        carried numeric; bank numeric; ceil_after numeric; answer jsonb; day int := extract(dow from now() at time zone 'utc')::int;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  if p_request is null or p_request !~ '^[A-Za-z0-9_-]{8,64}$' or p_qty is null or p_qty < 1 or p_qty > 99 or p_shop is null or p_item is null then
    return jsonb_build_object('ok', false, 'error', 'bad-request');
  end if;
  insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing;
  perform 1 from public.arma_cash where character = p_character for update; -- serialises this character's kills, buys and sells
  h := encode(sha256(convert_to(p_op || ':' || p_shop || ':' || p_item || ':' || p_qty::text, 'UTF8')), 'hex');
  select * into prev from public.arma_market_requests where character = p_character and request_id = p_request;
  if found then
    if prev.args_hash = h then return prev.result || jsonb_build_object('replayed', true); end if;
    return jsonb_build_object('ok', false, 'error', 'request-conflict');
  end if;
  select * into s from public.arma_shop_stock where shop_id = p_shop and item_id = p_item and (active_day is null or active_day = day)
    order by active_day nulls last limit 1;
  price := case p_op when 'buy' then s.buy_price else s.sell_price end;
  if not found or price is null then return jsonb_build_object('ok', false, 'error', case p_op when 'buy' then 'not-for-sale' else 'not-bought' end); end if;
  total := price * p_qty;
  select qty into have from public.arma_inventory where character = p_character and item_id = p_item for update;
  have := coalesce(have, 0);
  select * into run from public.arma_runs where character = p_character for update;
  if p_op = 'buy' then
    purse := coalesce(public.arma_cash_ceiling(p_character), 1000000000);
    if purse < total then return jsonb_build_object('ok', false, 'error', 'insufficient-cash', 'ceiling', purse); end if;
    if have + p_qty > 9999 then return jsonb_build_object('ok', false, 'error', 'inventory-full'); end if;
    update public.arma_cash set spent = least(spent + total, 1000000000) where character = p_character;
    perform public.arma_inventory_add(p_character, p_item, p_qty);
  else
    if have < p_qty then return jsonb_build_object('ok', false, 'error', 'insufficient-qty'); end if;
    if have = p_qty then delete from public.arma_inventory where character = p_character and item_id = p_item;
    else update public.arma_inventory set qty = qty - p_qty, updated_at = now() where character = p_character and item_id = p_item; end if;
    update public.arma_cash set earned = least(earned + total, 1000000000) where character = p_character;
  end if;
  if run.character is not null then -- keep the stored record in step (no revision bump: a phone's next save is clamped to the ceiling, never refused)
    carried := coalesce((run.record #>> '{marked,carried}')::numeric, 0);
    bank := coalesce((run.record #>> '{marked,bank}')::numeric, 0);
    if p_op = 'buy' then
      bank := bank - greatest(total - carried, 0);
      carried := greatest(carried - total, 0);
      if bank < 0 then bank := 0; end if;
    else
      carried := carried + total;
    end if;
    update public.arma_runs set record = jsonb_set(jsonb_set(record, '{marked,carried}', to_jsonb(carried::bigint)), '{marked,bank}', to_jsonb(bank::bigint)) where character = p_character;
  end if;
  ceil_after := coalesce(public.arma_cash_ceiling(p_character), 1000000000);
  answer := jsonb_build_object('ok', true, 'cash', coalesce(carried, 0)::bigint, 'bank', coalesce(bank, 0)::bigint, 'delta', case p_op when 'buy' then -total else total end,
    'ceiling', ceil_after, 'inventory', public.arma_inventory_json(p_character), 'replayed', false);
  insert into public.arma_market_requests (character, request_id, op, args_hash, result) values (p_character, p_request, p_op, h, answer);
  return answer;
end $$;

create function public.arma_buy_item(p_account uuid, p_character text, p_shop text, p_item text, p_qty int, p_request text) returns jsonb language sql security definer set search_path = '' as $$
  select public.arma_market_trade(p_account, p_character, 'buy', p_shop, p_item, p_qty, p_request);
$$;
create function public.arma_sell_item(p_account uuid, p_character text, p_shop text, p_item text, p_qty int, p_request text) returns jsonb language sql security definer set search_path = '' as $$
  select public.arma_market_trade(p_account, p_character, 'sell', p_shop, p_item, p_qty, p_request);
$$;
revoke all on function public.arma_cash_ceiling(text), public.arma_market_trade(uuid, text, text, text, text, int, text), public.arma_market_stock(uuid, text),
  public.arma_buy_item(uuid, text, text, text, int, text), public.arma_sell_item(uuid, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.arma_market_stock(uuid, text), public.arma_buy_item(uuid, text, text, text, int, text), public.arma_sell_item(uuid, text, text, text, int, text) to arma_writer;
commit;
