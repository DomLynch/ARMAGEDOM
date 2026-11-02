begin;
-- Removes the crow's kill payout row. Cash already credited to arma_cash.earned stays (a tally).
delete from public.arma_payout_rules where kind = 'original-crow';
commit;
