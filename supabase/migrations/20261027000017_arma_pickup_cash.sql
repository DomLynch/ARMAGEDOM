begin;
-- ROLLBACK: supabase/down/20261027000017_arma_pickup_cash_down.sql.
-- Cash from the world's cash stashes and the supply airdrop was never saved or settled: a page reload re-armed every stash and the airdrop clock,
-- so reloading farmed cash up to the game's maximum, and once enforce_cash is on that cash would be clamped away as unearned. The server now credits it
-- once. arma_claim_pickup(account, source, amount) adds to arma_cash.earned (the ceiling arma_cash_ceiling reads) only when this character has not
-- claimed this source within the rule's window. The amount is the client's claim clamped to the rule's cash; a refused claim credits nothing.
-- No save-record key is added (readers 279-283 reject unknown keys): the timer lives here, in real time.
create table public.arma_pickup_rules (
  source text primary key check (source ~ '^[a-z0-9._:-]{1,64}$'),
  kind text not null check (kind in ('stash', 'airdrop')),
  cash int not null check (cash between 0 and 1000000),
  window_s int not null check (window_s between 1 and 86400)
);
create table public.arma_pickup_claims (
  character text not null references public.arma_characters (id) on delete cascade,
  source text not null references public.arma_pickup_rules (source),
  claimed_at timestamptz not null default now(),
  primary key (character, source)
);
alter table public.arma_pickup_rules enable row level security;
alter table public.arma_pickup_claims enable row level security;
revoke all on public.arma_pickup_rules, public.arma_pickup_claims from public, anon, authenticated;

-- Seeded from Web/src/data/worldPickups.json (cashStash max 180, respawnSeconds 180) and Web/src/data/airdrop.json (loot.bundle cash 150,
-- schedule.firstDelayMin 60: the shortest legitimate gap between two airdrops, one per area visit). Web/tests/arma-pickup-rules-seed.test.js fails when they drift.
insert into public.arma_pickup_rules (source, kind, cash, window_s) values
  ('stash:westminster-3', 'stash', 180, 180),
  ('stash:east-3', 'stash', 180, 180),
  ('stash:south-3', 'stash', 180, 180),
  ('stash:east-bridge-3', 'stash', 180, 180),
  ('stash:elephant-and-castle-3', 'stash', 180, 180),
  ('stash:lambeth-3', 'stash', 180, 180),
  ('stash:area7-3', 'stash', 180, 180),
  ('stash:area8-3', 'stash', 180, 180),
  ('airdrop', 'airdrop', 150, 60);

-- Answers {credited, earned} or {refused: 'unknown-source' | 'too-soon', retryS}. Rows are locked by the claim's own primary key, so two racing
-- claims for one source credit once.
create function public.arma_claim_pickup(p_account uuid, p_character text, p_source text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_pickup_rules; c public.arma_pickup_claims; pay int; total int;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
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
commit;
