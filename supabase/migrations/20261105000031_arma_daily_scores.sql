begin;
-- ROLLBACK: supabase/down/20261105000031_arma_daily_scores_down.sql. Needs 20261105000030 (the credit ledger) applied first.
-- DAILY BOARD. A score is the cash the server credited to an account on a UTC day, read off the 000030 ledger: no client-submitted score exists and
-- there is no submit call. Every ledger row, written inside arma_save_run's own transaction, bumps that account's row for the day through a trigger
-- (so the board and the credit commit or roll back together, and arma_save_run is not copied a third time).
--   * arma_daily_scores(day, account, score, kills): one row per account per UTC day.
--   * arma_leaderboard(account): today's top 20 plus the caller's own rank. The writer's `leaderboard` op calls it and turns the account ids into
--     names (guestName in server/presence/names.js: "Survivor-NNNN", a hash of the id); the client never sees an id. Ties share a rank.
--     Granted to arma_writer only, so no public RPC exists (ops/realtime/verify-hosted.sql forbids anon and authenticated from executing arma functions).
-- Old days stay (one small row per active account per day). No backfill: the board starts with the first credit after this file.

create table public.arma_daily_scores (
  day date not null,
  account uuid not null,
  score int not null default 0 check (score between 0 and 1000000000),
  kills int not null default 0 check (kills between 0 and 1000000000),
  primary key (day, account)
);
create index arma_daily_scores_top on public.arma_daily_scores (day, score desc);
alter table public.arma_daily_scores enable row level security;
revoke all on public.arma_daily_scores from public, anon, authenticated;

create function public.arma_bump_daily_score() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.arma_daily_scores (day, account, score, kills) values ((new.at at time zone 'utc')::date, new.account, new.cash, 1)
    on conflict (day, account) do update
      set score = least(public.arma_daily_scores.score + excluded.score, 1000000000), kills = least(public.arma_daily_scores.kills + 1, 1000000000);
  return new;
end $$;
create trigger arma_award_credits_daily after insert on public.arma_award_credits for each row execute function public.arma_bump_daily_score();

-- {day, top: [{account, rank, score, kills}] (20 rows at most, best first), me: {rank, score, kills} or null}. A zero score is not on the board.
create function public.arma_leaderboard(p_account uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; top jsonb; mine record;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('account', t.account, 'rank', t.rank, 'score', t.score, 'kills', t.kills) order by t.rank, t.account), '[]'::jsonb) into top
    from (select s.account, s.score, s.kills, rank() over (order by s.score desc) as rank
          from public.arma_daily_scores s where s.day = today and s.score > 0 order by s.score desc, s.account limit 20) t;
  select s.score, s.kills, 1 + (select count(*) from public.arma_daily_scores o where o.day = today and o.score > s.score) as rank into mine
    from public.arma_daily_scores s where s.day = today and s.account = p_account and s.score > 0;
  return jsonb_build_object('day', today, 'top', top, 'me', case when mine.score is null then null else jsonb_build_object('rank', mine.rank, 'score', mine.score, 'kills', mine.kills) end);
end $$;

revoke all on function public.arma_bump_daily_score(), public.arma_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.arma_leaderboard(uuid) to arma_writer;
commit;
