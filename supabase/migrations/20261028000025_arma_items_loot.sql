begin;
-- ROLLBACK: supabase/down/20261028000025_arma_items_loot_down.sql.
-- Market part A (docs/MARKET-CONTRACT.md): the item catalogue, a per-character inventory, and SERVER-ROLLED rare loot folded into the kill credit.
-- Inventory is keyed by CHARACTER (not account) because cash, the cash ceiling and every writer rpc already are; a character belongs to one account.
-- The kill credit arma_claim_pickup gains two optional arguments: p_enemy (the creature kind, the client's claim, bounded by the tier's kill rate cap) and
-- p_kill_id (a client-made id for THIS kill; a retry of the same kill_id answers the stored answer with replayed true and rolls and credits nothing).
-- Loot is rolled here with random(); the client never names an item.
create table public.arma_items (
  id text primary key check (id ~ '^[a-z0-9-]{1,48}$'),
  name text not null check (char_length(name) between 1 and 48),
  kind text not null check (kind in ('weapon', 'consumable', 'part', 'relic')),
  rarity smallint not null check (rarity between 1 and 5),
  base_price int not null check (base_price between 0 and 1000000),
  sell_price int not null check (sell_price between 0 and base_price), -- never above base_price: no buy/sell loop can mint cash
  data jsonb not null default '{}'::jsonb
);
create table public.arma_inventory (
  character text not null references public.arma_characters (id) on delete cascade,
  item_id text not null references public.arma_items (id),
  qty int not null check (qty between 1 and 9999),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character, item_id)
);
create table public.arma_loot_table (
  enemy text not null check (enemy ~ '^[a-z0-9._:-]{1,64}$'),
  item_id text not null references public.arma_items (id),
  chance numeric not null check (chance > 0 and chance <= 1),
  qty_min int not null default 1 check (qty_min between 1 and 99),
  qty_max int not null default 1 check (qty_max between qty_min and 99),
  primary key (enemy, item_id)
);
-- One row per settled request (a kill credit, a buy, a sell): the replay guard. args_hash pins what the request_id was first used for.
create table public.arma_market_requests (
  character text not null references public.arma_characters (id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  op text not null,
  args_hash text not null,
  result jsonb not null,
  at timestamptz not null default now(),
  primary key (character, request_id)
);
create index arma_market_requests_at on public.arma_market_requests (at);
alter table public.arma_items enable row level security;
alter table public.arma_inventory enable row level security;
alter table public.arma_loot_table enable row level security;
alter table public.arma_market_requests enable row level security;
revoke all on public.arma_items, public.arma_inventory, public.arma_loot_table, public.arma_market_requests from public, anon, authenticated;
-- An account may READ its own characters' inventory (RLS); nobody can write it except through the security definer rpcs.
grant select on public.arma_inventory, public.arma_items to authenticated;
create policy "an account reads its own inventory" on public.arma_inventory for select to authenticated using (public.arma_me_owns(character) and public.arma_me_allowed());
create policy "everyone signed in reads the item catalogue" on public.arma_items for select to authenticated using (true);

-- base_price is what the shop asks when it stocks the item; sell_price is what a player gets selling it to the NPC. Loot parts are never for sale.
insert into public.arma_items (id, name, kind, rarity, base_price, sell_price) values
  ('hunter-cpu', 'Hunter CPU', 'part', 4, 300, 150),
  ('roach-mandibles', 'Roach Mandibles', 'part', 2, 80, 40),
  ('salamander-gland', 'Salamander Gland', 'part', 4, 360, 180),
  ('military-battery', 'Military Battery', 'part', 3, 240, 120),
  ('robot-parts', 'Robot Parts', 'part', 3, 180, 90),
  ('drone-chip', 'Drone Chip', 'part', 3, 280, 140),
  ('ammo-pack', 'Ammo Pack', 'consumable', 1, 60, 20),
  ('medkit-pack', 'Medkit Pack', 'consumable', 1, 120, 40),
  ('vest-patch', 'Vest Patch', 'consumable', 2, 250, 80);
-- Rare chances, keyed by creature kind only (the client's tier names for a kind can change; the tier's kill rate cap bounds the rolls). Rare creatures and bosses only.
insert into public.arma_loot_table (enemy, item_id, chance) values
  ('original-roach', 'roach-mandibles', 0.05),
  ('giant-salamander', 'salamander-gland', 0.06),
  ('low-hover-drone', 'drone-chip', 0.06),
  ('low-hover-drone', 'robot-parts', 0.08),
  ('boss-area7-knight', 'military-battery', 0.10),
  ('boss-area8-veteran', 'military-battery', 0.10),
  ('boss-warden', 'hunter-cpu', 0.10),
  ('boss-butcher', 'robot-parts', 0.10);

-- Adds qty to a character's stack (capped at 9999). Internal.
create function public.arma_inventory_add(p_character text, p_item text, p_qty int) returns void language sql security definer set search_path = '' as $$
  insert into public.arma_inventory (character, item_id, qty) values (p_character, p_item, least(p_qty, 9999))
  on conflict (character, item_id) do update set qty = least(public.arma_inventory.qty + excluded.qty, 9999), updated_at = now();
$$;
create function public.arma_inventory_json(p_character text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty) order by item_id), '[]'::jsonb) from public.arma_inventory where character = p_character;
$$;
revoke all on function public.arma_inventory_add(text, text, int), public.arma_inventory_json(text) from public, anon, authenticated;

-- The reader's own inventory (through the writer: p_account is the verified account).
create function public.arma_inventory_get(p_account uuid, p_character text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  return public.arma_inventory_json(p_character);
end $$;
revoke all on function public.arma_inventory_get(uuid, text) from public, anon, authenticated;
grant execute on function public.arma_inventory_get(uuid, text) to arma_writer;

-- The catalogue for the client's tooltips and sell prices: [{id, name, kind, rarity, base_price, sell_price}].
create function public.arma_item_defs(p_account uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'rarity', rarity, 'base_price', base_price, 'sell_price', sell_price) order by id) from public.arma_items), '[]'::jsonb);
end $$;
revoke all on function public.arma_item_defs(uuid) from public, anon, authenticated;
grant execute on function public.arma_item_defs(uuid) to arma_writer;

-- Roll the loot for one settled kill: each row of the enemy's table rolls once. Returns [{item_id, qty}] and adds it to the inventory.
create function public.arma_roll_loot(p_character text, p_enemy text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.arma_loot_table; q int; got jsonb := '[]'::jsonb;
begin
  if p_enemy is null then return got; end if;
  for t in select * from public.arma_loot_table where enemy = p_enemy order by item_id loop
    if random() < t.chance then
      q := t.qty_min + floor(random() * (t.qty_max - t.qty_min + 1))::int;
      perform public.arma_inventory_add(p_character, t.item_id, q);
      got := got || jsonb_build_array(jsonb_build_object('item_id', t.item_id, 'qty', q));
    end if;
  end loop;
  return got;
end $$;
revoke all on function public.arma_roll_loot(text, text) from public, anon, authenticated;

-- Replaces the 4-argument kill credit (000018). Same behaviour and answers; additionally, a credited kill (not a stash or the airdrop) rolls loot in the same
-- transaction and answers {credited, earned, loot: [...]}. With p_kill_id, the first answer is stored and a retry returns it with replayed true: no second credit, roll or rate-limit use.
create function public.arma_claim_pickup(p_account uuid, p_character text, p_source text, p_amount numeric, p_enemy text default null, p_kill_id text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_pickup_rules; k public.arma_kill_tiers; c public.arma_pickup_claims; pay int; total int; used int; oldest timestamptz; h text; prev public.arma_market_requests; loot jsonb; answer jsonb;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  select * into k from public.arma_kill_tiers where source = p_source;
  if found then
    if p_amount is null or p_amount <> floor(p_amount) or p_amount < k.min_cash or p_amount > k.max_cash then return jsonb_build_object('refused', 'bad-amount'); end if;
    if p_kill_id is not null and p_kill_id !~ '^[A-Za-z0-9_-]{8,64}$' then return jsonb_build_object('refused', 'bad-kill-id'); end if;
    if p_enemy is not null and p_enemy !~ '^[a-z0-9._:-]{1,64}$' then return jsonb_build_object('refused', 'bad-enemy'); end if;
    insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing;
    perform 1 from public.arma_cash where character = p_character for update;
    if p_kill_id is not null then
      h := encode(sha256(convert_to('kill:' || p_source || ':' || p_amount::text || ':' || coalesce(p_enemy, ''), 'UTF8')), 'hex');
      select * into prev from public.arma_market_requests where character = p_character and request_id = p_kill_id;
      if found then
        if prev.args_hash = h then return prev.result || jsonb_build_object('replayed', true); end if;
        return jsonb_build_object('refused', 'request-conflict');
      end if;
    end if;
    delete from public.arma_kill_claims where character = p_character and source = p_source and claimed_at <= now() - make_interval(secs => k.window_s);
    select count(*), min(claimed_at) into used, oldest from public.arma_kill_claims where character = p_character and source = p_source;
    if used >= k.max_claims then
      return jsonb_build_object('refused', 'rate-limit', 'retryS', greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => k.window_s) - now())))));
    end if;
    insert into public.arma_kill_claims (character, source) values (p_character, p_source);
    pay := p_amount::int;
    update public.arma_cash set earned = least(earned + pay, 1000000000) where character = p_character;
    select earned into total from public.arma_cash where character = p_character;
    loot := public.arma_roll_loot(p_character, p_enemy);
    answer := jsonb_build_object('credited', pay, 'earned', total, 'loot', loot);
    if p_kill_id is not null then insert into public.arma_market_requests (character, request_id, op, args_hash, result) values (p_character, p_kill_id, 'kill', h, answer); end if;
    return answer;
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
drop function public.arma_claim_pickup(uuid, text, text, numeric);
revoke all on function public.arma_claim_pickup(uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.arma_claim_pickup(uuid, text, text, numeric, text, text) to arma_writer;

-- Housekeeping: request rows older than 7 days can no longer be retried by a phone.
create function public.arma_prune_market_requests() returns int language sql security definer set search_path = '' as $$
  with d as (delete from public.arma_market_requests where at < now() - interval '7 days' returning 1) select count(*)::int from d;
$$;
revoke all on function public.arma_prune_market_requests() from public, anon, authenticated;
grant execute on function public.arma_prune_market_requests() to arma_writer;
commit;
