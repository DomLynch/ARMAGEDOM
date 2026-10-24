-- Read-only checks that the hosted project has the ARMAGEDOM schema, locked down, and everything OFF.
-- Run by ops/realtime/apply-migrations.sh with ON_ERROR_STOP; any problem raises, so the exit status is the verdict.
begin read only;

do $check$
declare
  problems text[] := '{}';
  n int;
  r record;
  -- Every function the writer must be able to call (the same list server/db/tests/core.test.js pins on pglite).
  writer_functions text[] := array['arma_create_character', 'arma_set_active', 'arma_active', 'arma_save_location', 'arma_saved_location', 'arma_save_run',
    'arma_load_run', 'arma_record_event', 'arma_spawn_state', 'arma_spawn_engage', 'arma_spawn_hit', 'arma_spawn_hit_batch'];
  fn text;
begin
  -- 1. Switches: closed, both.
  if (select value from public.arma_config where key = 'arma_enabled') is distinct from 'false'::jsonb then problems := problems || 'arma_enabled is not false'; end if;
  if (select value from public.arma_config where key = 'arma_open_access') is distinct from 'false'::jsonb then problems := problems || 'arma_open_access is not false (or its row is missing)'; end if;

  -- 2. Roles.
  for fn in select unnest(array['arma_writer', 'arma_presence']) loop
    if not exists (select 1 from pg_roles where rolname = fn) then problems := problems || ('role ' || fn || ' does not exist'); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'arma_writer' and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) then problems := problems || 'arma_writer has more than plain LOGIN'; end if;
  if exists (select 1 from pg_roles where rolname = 'arma_writer' and not rolcanlogin) then problems := problems || 'arma_writer cannot log in'; end if;

  -- 3. Every arma table: row level security on, and no write privilege for the API roles (anon, authenticated).
  for r in select c.relname, c.relrowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\_%' loop
    if not r.relrowsecurity then problems := problems || ('RLS is off on ' || r.relname); end if;
    foreach fn in array array['anon', 'authenticated'] loop
      if has_table_privilege(fn, format('public.%I', r.relname), 'insert,update,delete,truncate,references,trigger') then problems := problems || (fn || ' can write ' || r.relname); end if;
      if fn = 'anon' and has_table_privilege('anon', format('public.%I', r.relname), 'select') then problems := problems || ('anon can read ' || r.relname); end if;
    end loop;
  end loop;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\_%';
  if n < 12 then problems := problems || ('only ' || n || ' arma tables found'); end if;

  -- 4. Functions: no client may call any arma function except the two read-gates; the writer may call its twelve; nobody else gets them.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'arma\_%' loop
    if has_function_privilege('anon', r.oid, 'execute') then problems := problems || ('anon can execute ' || r.proname); end if;
    if has_function_privilege('authenticated', r.oid, 'execute') and r.proname not in ('arma_me_allowed', 'arma_me_owns') then problems := problems || ('authenticated can execute ' || r.proname); end if;
  end loop;
  foreach fn in array writer_functions loop
    if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = fn) then
      problems := problems || ('function ' || fn || ' is missing');
    elsif exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = fn and not has_function_privilege('arma_writer', p.oid, 'execute')) then
      problems := problems || ('arma_writer cannot execute ' || fn);
    end if;
  end loop;
  -- The gate itself and the ownership check stay server-only.
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('arma_allowed', 'arma_owns') and has_function_privilege('arma_writer', p.oid, 'execute')) then
    problems := problems || 'arma_writer can call arma_allowed or arma_owns directly';
  end if;

  -- 5. Nothing has been used yet: no accounts' data (a fresh project; a non-empty table means someone ran this against live data).
  select count(*) into n from public.arma_characters;
  raise notice 'characters in the project: %', n;

  if array_length(problems, 1) > 0 then
    raise exception 'verification failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'verification: schema, locks and switches are as designed';
end
$check$;

rollback;
