-- Read-only checks that the hosted project has the ARMAGEDOM schema and that it is locked down. The switches are reported, not required
-- closed: the world has been open since 25 Oct 2026, so a closed-switch requirement would fail on every live run.
-- Run by ops/realtime/apply-migrations.sh with ON_ERROR_STOP; any problem raises, so the exit status is the verdict.
begin read only;

do $check$
declare
  problems text[] := '{}';
  n int;
  r record;
  -- Every function the writer must be able to call: the writer's grants after all migrations (migration 26), read off a fresh pglite
  -- database. Add a function here in the same change that grants it.
  writer_functions text[] := array['arma_active', 'arma_buy_item', 'arma_claim_pickup', 'arma_create_character', 'arma_inventory_get', 'arma_item_defs',
    'arma_load_run', 'arma_market_stock', 'arma_prune_engages', 'arma_prune_market_requests', 'arma_record_event', 'arma_save_location', 'arma_save_run',
    'arma_saved_location', 'arma_sell_item', 'arma_set_active', 'arma_spawn_engage', 'arma_spawn_hit', 'arma_spawn_hit_batch', 'arma_spawn_state',
    'arma_wallet', 'arma_world_status'];
  -- The only functions presence may call.
  presence_functions text[] := array['arma_active', 'arma_save_location', 'arma_saved_location'];
  -- Internal helpers, callable only from inside other arma functions: no server role and no client may execute them directly.
  internal_functions text[] := array['arma_allowed', 'arma_owns', 'arma_cash_ceiling', 'arma_check_record', 'arma_grant_kill_cash', 'arma_inventory_add',
    'arma_inventory_json', 'arma_market_trade', 'arma_roll_loot', 'arma_shop_no_loop', 'arma_spawn_view', 'arma_unreceipted'];
  fn text;
begin
  -- 1. Switches: reported. A missing row is a problem (the writer reads both); the value is the operator's choice.
  for fn in select unnest(array['arma_enabled', 'arma_open_access']) loop
    if not exists (select 1 from public.arma_config where key = fn) then problems := problems || ('config row ' || fn || ' is missing');
    else raise notice 'switch %: %', fn, (select value from public.arma_config where key = fn); end if;
  end loop;

  -- 2. Roles.
  for fn in select unnest(array['arma_writer', 'arma_presence']) loop
    if not exists (select 1 from pg_roles where rolname = fn) then problems := problems || ('role ' || fn || ' does not exist'); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'arma_writer' and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) then problems := problems || 'arma_writer has more than plain LOGIN'; end if;
  if exists (select 1 from pg_roles where rolname = 'arma_writer' and not rolcanlogin) then problems := problems || 'arma_writer cannot log in'; end if;

  -- The server roles are members of nothing: a grant of postgres, or of any other role, would carry its privileges past every check below.
  for r in select u.rolname as member, g.rolname as granted from pg_auth_members m join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.roleid where u.rolname in ('arma_writer', 'arma_presence') loop
    problems := problems || (r.member || ' is a member of role ' || r.granted);
  end loop;

  -- 3. Every arma table: row level security on, and no write privilege for the API roles (anon, authenticated).
  for r in select c.relname, c.relrowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\_%' loop
    if not r.relrowsecurity then problems := problems || ('RLS is off on ' || r.relname); end if;
    foreach fn in array array['anon', 'authenticated'] loop
      if has_table_privilege(fn, format('public.%I', r.relname), 'insert,update,delete,truncate,references,trigger') then problems := problems || (fn || ' can write ' || r.relname); end if;
      if fn = 'anon' and has_table_privilege('anon', format('public.%I', r.relname), 'select') then problems := problems || ('anon can read ' || r.relname); end if;
    end loop;
  end loop;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\_%';
  if n < 29 then problems := problems || ('only ' || n || ' arma tables found (migrations create 29 with the registry created by apply-migrations.sh)'); end if;

  -- 4. Functions: no client may call any arma function except the two read-gates; the writer may call its list; presence its three; nobody else gets them.
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
  foreach fn in array presence_functions loop
    if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
               where s.nspname = 'public' and p.proname = fn and not has_function_privilege('arma_presence', p.oid, 'execute')) then
      problems := problems || ('arma_presence cannot execute ' || fn);
    end if;
  end loop;
  -- Presence may call only its three.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname like 'arma\_%' and p.proname <> all (presence_functions) and has_function_privilege('arma_presence', p.oid, 'execute') loop
    problems := problems || ('arma_presence can execute ' || r.proname);
  end loop;
  -- The writer may call only its list; the gate, the ownership check and every internal helper stay unreachable for both server roles.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname like 'arma\_%' and p.proname <> all (writer_functions) and p.proname not in ('arma_me_allowed', 'arma_me_owns')
             and has_function_privilege('arma_writer', p.oid, 'execute') loop
    problems := problems || ('arma_writer can execute ' || r.proname || ', which is not on its list');
  end loop;
  foreach fn in array internal_functions loop
    if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = fn) then
      problems := problems || ('internal function ' || fn || ' is missing');
    elsif exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = fn and (has_function_privilege('arma_writer', p.oid, 'execute') or has_function_privilege('arma_presence', p.oid, 'execute'))) then
      problems := problems || (fn || ' is executable by a server role');
    end if;
  end loop;

  -- 5. Reported only: how much player data the project holds (this runs against live data now, so a non-empty table is normal).
  select count(*) into n from public.arma_characters;
  raise notice 'characters in the project: %', n;

  if array_length(problems, 1) > 0 then
    raise exception 'verification failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'verification: schema and locks are as designed';
end
$check$;

rollback;
