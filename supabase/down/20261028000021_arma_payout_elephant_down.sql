begin;
-- Removes the elephant's seeded payout row.
delete from public.arma_payout_rules where kind = 'original-elephant';
commit;
