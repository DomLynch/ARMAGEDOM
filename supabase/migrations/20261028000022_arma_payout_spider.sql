begin;
-- ROLLBACK: supabase/down/20261028000022_arma_payout_spider_down.sql.
-- Seeds the kill payout of the new spider creature kind (cycle B of the area7 station slot). Generated from the game's own tables by
-- server/data/generate-payout-seed.mjs (Web/tests/arma-payout-rules-seed.test.js fails until this row exists): the creature rate, 100, like the rat.
-- Additive and idempotent; the other kinds are seeded by earlier migrations and are untouched. Not applied by this PR.
insert into public.arma_payout_rules (kind, cash) values
  ('original-spider', 100)
on conflict (kind) do update set cash = excluded.cash;
commit;
