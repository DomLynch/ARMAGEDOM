begin;
-- Undo migration 27: the drift reader loses the five economy rule tables again (the check then skips them, as before).
do $revoke$
declare t text;
begin
  foreach t in array array['arma_items', 'arma_loot_table', 'arma_kill_tiers', 'arma_pickup_rules', 'arma_shop_stock'] loop
    execute format('drop policy "the drift reader reads the seeded rows" on public.%I', t);
    execute format('revoke select on public.%I from arma_drift_reader', t);
  end loop;
end
$revoke$;
commit;
