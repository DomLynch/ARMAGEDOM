begin;
-- Generated from the game's own tables (node server/data/generate-payout-seed.mjs lists every spawn kind): the crow (art/monster-crow) is a new
-- creature kind in cycle B of two population slots, so it needs a kill payout row like every other creature (marked.cashPerKill = 100).
-- Web/tests/arma-payout-rules-seed.test.js keeps this seed and the game's tables from drifting apart. Seed only; no schema change.
insert into public.arma_payout_rules (kind, cash) values
  ('original-crow', 100)
on conflict (kind) do update set cash = excluded.cash;
commit;
