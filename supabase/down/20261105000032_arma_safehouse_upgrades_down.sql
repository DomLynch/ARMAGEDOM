begin;
-- Undo migration 20261105000032: the upgrade tables and functions go. Before they do, every character is made whole: the cash a character spent on the levels it
-- holds comes back into its stored run's marked.carried (the same cash the buy took), `spent` falls by the same amount so the cash ceiling can hold it, and the
-- record's revision is bumped so an older phone re-reads it. A run that holds no record (the character never saved) only gets the `spent` back.
-- ROLLBACK PROCEDURE. Hide the client feature first (Web/src/data/safehouseUpgrades.json "enabled": false, or ship the previous release): a phone that still
-- shows upgrades would otherwise keep applying levels it cached. The client reads the writer ops upgrades_get / upgrade_buy; once the functions are gone those answer
-- an error and the panel shows its offline state. The writer needs no restart for this down file, but the ops stay in writer.js until the next release.
with refund as (
  select u.character, coalesce(sum((select coalesce(sum(p), 0) from unnest(d.price[1:u.level]) as p)), 0)::bigint as total
  from public.arma_upgrades u join public.arma_upgrade_defs d on d.id = u.upgrade_id
  group by u.character
)
update public.arma_cash c set spent = greatest(0, c.spent - r.total) from refund r where c.character = r.character;
update public.arma_runs run
  set record = jsonb_set(record, '{marked,carried}', to_jsonb((coalesce((record #>> '{marked,carried}')::numeric, 0) + r.total)::bigint)), revision = run.revision + 1
  from (
    select u.character, coalesce(sum((select coalesce(sum(p), 0) from unnest(d.price[1:u.level]) as p)), 0)::bigint as total
    from public.arma_upgrades u join public.arma_upgrade_defs d on d.id = u.upgrade_id
    group by u.character
  ) r
  where run.character = r.character and r.total > 0;
delete from public.arma_market_requests where op = 'upgrade';
drop function if exists public.arma_upgrade_buy(uuid, text, text, int, text);
drop function if exists public.arma_upgrades_get(uuid, text);
drop function if exists public.arma_upgrades_json(text);
drop table if exists public.arma_upgrades;
drop table if exists public.arma_upgrade_defs;
commit;
