begin;
-- Removes the pickup-cash claim function and its tables. Cash already credited to arma_cash.earned stays (it is a tally, not tied to a claim row).
drop function if exists public.arma_claim_pickup(uuid, text, text, numeric);
drop table if exists public.arma_pickup_claims;
drop table if exists public.arma_pickup_rules;
commit;
