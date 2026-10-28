begin;
-- Removes the giant eel's kill payout row. Cash already credited to arma_cash.earned stays (a tally).
delete from public.arma_payout_rules where kind = 'giant-eel';
commit;
