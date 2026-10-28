begin;
-- Removes the giant centipede payout row (kills of that kind stop paying; cash already credited stays).
delete from public.arma_payout_rules where kind = 'giant-centipede';
commit;
