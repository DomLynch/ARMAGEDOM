begin;
-- ROLLBACK: supabase/down/20261028000018_arma_kill_cash_down.sql.
-- Kill-drop cash. Enemies drop coins in every area; the amount is the client's claim, but the server decides what is payable: the claim must be one of
-- the three kill sources, its amount must lie in that tier's range, and a character can only be credited so many kills per rolling window.
-- Stashes and the airdrop keep their per-source window (migration 000017). A kill has no stable source id (a rat dying twice is two kills), so it is
-- limited by rate instead: arma_kill_tiers.max_claims credits per window_s seconds per character and tier. No save-record key is added.
create table public.arma_kill_tiers (
  source text primary key check (source ~ '^kill:[a-z]{1,16}$'),
  min_cash int not null check (min_cash between 0 and 1000000),
  max_cash int not null check (max_cash between min_cash and 1000000),
  window_s int not null check (window_s between 1 and 86400),
  max_claims int not null check (max_claims between 1 and 10000)
);
create table public.arma_kill_claims (
  character text not null references public.arma_characters (id) on delete cascade,
  source text not null references public.arma_kill_tiers (source),
  claimed_at timestamptz not null default now()
);
create index arma_kill_claims_recent on public.arma_kill_claims (character, source, claimed_at);
alter table public.arma_kill_tiers enable row level security;
alter table public.arma_kill_claims enable row level security;
revoke all on public.arma_kill_tiers, public.arma_kill_claims from public, anon, authenticated;

-- Ranges are Dom's (28 Oct 2026): $1-10 trash, $11-20 creatures, $21-40 bosses; the client's kill-drop data must carry the same ranges
-- (server/db/tests/pickup-kill-cash.test.js pins them here; the client PR adds the drift test against its data file). Rates: a crowd can die at once (8 hunters in 2 s measured), kills take 2 shots and fights
-- last about 5 s, so trash allows 30 credits a minute (one every 2 s sustained, bursts included), creatures 15, bosses 3 (one boss fight a minute).
insert into public.arma_kill_tiers (source, min_cash, max_cash, window_s, max_claims) values
  ('kill:trash', 1, 10, 60, 30),
  ('kill:creature', 11, 20, 60, 15),
  ('kill:boss', 21, 40, 60, 3);

-- Same signature and grant as 000017. Answers {credited, earned} or {refused: 'unknown-source' | 'too-soon' | 'bad-amount' | 'rate-limit', retryS?}.
-- A kill claim outside its tier's range credits nothing (a cheat); one past the rate cap credits nothing and says when to retry. The character's
-- arma_cash row is locked first, so two racing kill claims count against the cap once each.
create or replace function public.arma_claim_pickup(p_account uuid, p_character text, p_source text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
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
commit;
