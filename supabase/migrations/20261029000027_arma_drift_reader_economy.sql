begin;
-- ROLLBACK: supabase/down/20261029000027_arma_drift_reader_economy_down.sql.
-- The drift reader (migration 14) could read only the rule tables that existed on 26 Oct. The economy added since then keeps its prices and
-- odds in five more seeded tables, which the drift check therefore never compared: an edited item price, loot chance, kill tier, pickup rule
-- or shop row on the hosted project would have passed as "zero drift". Same shape as migration 14: SELECT plus a SELECT policy for this role
-- only. The tables must stay the same list as "seededTables" in ops/realtime/drift-allow.json (a test pins it, across all drift-reader migrations).
-- Player data (characters, cash, inventory, events, claims, requests, runs) is deliberately not readable by this role.
do $grant$
declare t text;
begin
  foreach t in array array['arma_items', 'arma_loot_table', 'arma_kill_tiers', 'arma_pickup_rules', 'arma_shop_stock'] loop
    execute format('grant select on public.%I to arma_drift_reader', t);
    execute format('create policy "the drift reader reads the seeded rows" on public.%I for select to arma_drift_reader using (true)', t);
  end loop;
end
$grant$;
commit;
