begin;
-- Removes exactly the row 20261028000022_arma_payout_spider.sql inserts.
delete from public.arma_payout_rules where kind = 'original-spider';
commit;
