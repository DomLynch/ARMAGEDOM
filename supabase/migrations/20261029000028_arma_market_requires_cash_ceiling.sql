begin;
-- ROLLBACK: supabase/down/20261029000028_arma_market_requires_cash_ceiling_down.sql.
-- Market trades need an enforced cash ceiling. With enforce_cash off, arma_cash_ceiling is null: a buy was unbounded and a sell credited cash the server never granted (a mint).
-- Buy and sell now both answer cash-not-enforced before any write. Otherwise identical to the function in 000026; create or replace keeps its grants, restated below.
create or replace function public.arma_market_trade(p_account uuid, p_character text, p_op text, p_shop text, p_item text, p_qty int, p_request text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.arma_shop_stock; prev public.arma_market_requests; h text; price int; total int; have int; purse numeric; run public.arma_runs;
        carried numeric; bank numeric; ceil_after numeric; answer jsonb; day int := extract(dow from now() at time zone 'utc')::int;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  if coalesce((select is_anonymous from auth.users where id = p_account), false) then return jsonb_build_object('ok', false, 'error', 'guest'); end if; -- guests (anonymous sessions) play but do not trade
  if p_request is null or p_request !~ '^[A-Za-z0-9_-]{8,64}$' or p_qty is null or p_qty < 1 or p_qty > 99 or p_shop is null or p_item is null then
    return jsonb_build_object('ok', false, 'error', 'bad-request');
  end if;
  if public.arma_cash_ceiling(p_character) is null then return jsonb_build_object('ok', false, 'error', 'cash-not-enforced'); end if; -- enforce_cash off: the market is closed, nothing is written
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
revoke all on function public.arma_market_trade(uuid, text, text, text, text, int, text) from public, anon, authenticated;
commit;
