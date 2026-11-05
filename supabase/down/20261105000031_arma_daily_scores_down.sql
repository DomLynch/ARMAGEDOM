begin;
-- Rolls back 20261105000031: the board function, the trigger and the scores. The credit ledger and the cash (000030) are untouched. The writer's
-- `leaderboard` op then answers 500 until the writer release without it is running (or the client hides the panel); roll the writer back first
-- if it is already running the release that has the op, or leave the op: it only fails for that one route.
-- ROLLBACK ORDER for the pair: this file, then 20261105000030_arma_award_credit_down.sql.
drop trigger if exists arma_award_credits_daily on public.arma_award_credits;
drop function if exists public.arma_bump_daily_score();
drop function if exists public.arma_leaderboard(uuid);
drop table if exists public.arma_daily_scores;
commit;
