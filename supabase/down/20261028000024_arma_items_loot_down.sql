begin;
-- Removes items, inventory and loot: restores the 000018 four-argument kill credit and drops the market tables. Run 000025's down first.
-- Inventory contents are lost; cash already credited stays in arma_cash.earned.
drop function if exists public.arma_prune_market_requests();
drop function if exists public.arma_inventory_get(uuid, text);
drop function public.arma_claim_pickup(uuid, text, text, numeric, text, text);
drop function if exists public.arma_roll_loot(text, text);
drop function if exists public.arma_item_defs(uuid);
create function public.arma_claim_pickup(p_account uuid, p_character text, p_source text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_pickup_rules; k public.arma_kill_tiers; c public.arma_pickup_claims; pay int; total int; used int; oldest timestamptz;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  select * into k from public.arma_kill_tiers where source = p_source;
  if found then
    if p_amount is null or p_amount <> floor(p_amount) or p_amount < k.min_cash or p_amount > k.max_cash then return jsonb_build_object('refused', 'bad-amount'); end if;
    insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing;
    perform 1 from public.arma_cash where character = p_character for update;
    delete from public.arma_kill_claims where character = p_character and source = p_source and claimed_at <= now() - make_interval(secs => k.window_s);
    select count(*), min(claimed_at) into used, oldest from public.arma_kill_claims where character = p_character and source = p_source;
    if used >= k.max_claims then
      return jsonb_build_object('refused', 'rate-limit', 'retryS', greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => k.window_s) - now())))));
    end if;
    insert into public.arma_kill_claims (character, source) values (p_character, p_source);
    pay := p_amount::int;
    update public.arma_cash set earned = least(earned + pay, 1000000000) where character = p_character;
    select earned into total from public.arma_cash where character = p_character;
    return jsonb_build_object('credited', pay, 'earned', total);
  end if;
  select * into r from public.arma_pickup_rules where source = p_source;
  if not found then return jsonb_build_object('refused', 'unknown-source'); end if;
  insert into public.arma_pickup_claims (character, source, claimed_at) values (p_character, p_source, '-infinity') on conflict do nothing;
  select * into c from public.arma_pickup_claims where character = p_character and source = p_source for update;
  if c.claimed_at > now() - make_interval(secs => r.window_s) then
    return jsonb_build_object('refused', 'too-soon', 'retryS', ceil(extract(epoch from (c.claimed_at + make_interval(secs => r.window_s) - now()))));
  end if;
  pay := least(r.cash, greatest(0, floor(coalesce(p_amount, 0))))::int;
  update public.arma_pickup_claims set claimed_at = now() where character = p_character and source = p_source;
  insert into public.arma_cash (character, earned) values (p_character, pay)
    on conflict (character) do update set earned = least(public.arma_cash.earned + excluded.earned, 1000000000);
  select earned into total from public.arma_cash where character = p_character;
  return jsonb_build_object('credited', pay, 'earned', total);
end $$;
revoke all on function public.arma_claim_pickup(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.arma_claim_pickup(uuid, text, text, numeric) to arma_writer;
drop function if exists public.arma_inventory_add(text, int, int);
drop function if exists public.arma_inventory_add(text, text, int);
drop function if exists public.arma_inventory_json(text);
drop table if exists public.arma_market_requests;
drop table if exists public.arma_loot_table;
drop table if exists public.arma_inventory;
drop table if exists public.arma_items;
commit;
