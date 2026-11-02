begin;
-- Removes the drift reader: its policies, its grants and the role. Leaves every table and row as it was.
do $drop$
declare t text;
begin
  foreach t in array array['arma_item_sources', 'arma_loot_rules', 'arma_payout_rules', 'arma_record_caps', 'arma_record_keys', 'arma_weapon_rules', 'arma_config', 'arma_world_config', 'arma_schema_migrations'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists "the drift reader reads the seeded rows" on public.%I', t);
    end if;
  end loop;
end
$drop$;
drop owned by arma_drift_reader;
drop role arma_drift_reader;
commit;
