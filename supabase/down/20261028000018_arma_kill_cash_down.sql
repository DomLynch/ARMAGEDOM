begin;
-- Removes kill-drop cash: restores the 000017 claim function and drops the kill tables. Cash already credited to arma_cash.earned stays (a tally).
create or replace function public.arma_claim_pickup(p_account uuid, p_character text, p_source text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
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
drop table if exists public.arma_kill_claims;
drop table if exists public.arma_kill_tiers;
commit;
