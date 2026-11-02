begin;
-- ROLLBACK: supabase/down/20261026000014_arma_drift_reader_down.sql.
-- A read-only role for the drift check (ops/realtime/check-db-drift.mjs), so Deploy never needs the owner's connection string.
-- It can SELECT the seeded rule tables and the migration registry, and read the catalogs (readable by everyone already). It has no write
-- privilege anywhere, cannot execute any arma function, is not a member of any role, does not bypass row-level security (each table
-- gets a SELECT policy for this role only) and connects read-only with a statement timeout. The password is set out of band; until
-- then the role cannot log in. The tables must stay the same list as "seededTables" in ops/realtime/drift-allow.json (a test pins it).
create role arma_drift_reader login nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 2;
alter role arma_drift_reader set default_transaction_read_only = on;
alter role arma_drift_reader set statement_timeout = '30s';
grant usage on schema public to arma_drift_reader;

do $grant$
declare t text;
begin
  foreach t in array array['arma_item_sources', 'arma_loot_rules', 'arma_payout_rules', 'arma_record_caps', 'arma_record_keys', 'arma_weapon_rules', 'arma_config', 'arma_world_config'] loop
    execute format('grant select on public.%I to arma_drift_reader', t);
    execute format('create policy "the drift reader reads the seeded rows" on public.%I for select to arma_drift_reader using (true)', t);
  end loop;
  -- The registry is created by ops/realtime/apply-migrations.sh before the first migration, not by a migration, so it is absent on a
  -- bare database (pglite in the db tests).
  if to_regclass('public.arma_schema_migrations') is not null then
    grant select on public.arma_schema_migrations to arma_drift_reader;
    create policy "the drift reader reads the seeded rows" on public.arma_schema_migrations for select to arma_drift_reader using (true);
  end if;
end
$grant$;
commit;
