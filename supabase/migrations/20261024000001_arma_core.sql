begin;
-- ROLLBACK: supabase/down/20261024000001_arma_core_down.sql (drops exactly what this file creates).
-- ARMAGEDOM W1: accounts, characters, the server-held run (the v18 save record), location, idempotency events.
-- Modelled on Frankendom Origins (202610060001_origins_save, 202610070009_origins_character_location): every table has row level security
-- on and NO grant for anon/authenticated except a few "read your own" selects. Nobody writes except the writer roles, and only through the
-- SECURITY DEFINER functions below. Everything starts OFF: arma_config.arma_enabled is false and an account needs an arma_access row.
-- Area ids are STRINGS (the registry ids: 'westminster', 'east-bridge', 'area7'). Needs Supabase's auth.users and auth.uid().

create role arma_writer login;     -- password set out of band; the writer service connects as this role
create role arma_presence login;   -- the presence service: location only

create table public.arma_config (key text primary key, value jsonb not null);
insert into public.arma_config (key, value) values ('arma_enabled', 'false'::jsonb), ('current_era', '18'::jsonb), ('oldest_era', '1'::jsonb);
create table public.arma_access (account uuid primary key references auth.users (id) on delete cascade, granted_at timestamptz not null default now());

create function public.arma_allowed(p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.arma_config where key = 'arma_enabled'), false)
     and exists (select 1 from public.arma_access where account = p_account)
$$;

create table public.arma_characters (
  id text primary key check (id ~ '^pc:[A-Za-z0-9_-]{1,64}$'),
  account uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (account, name)
);
create index arma_characters_account on public.arma_characters (account);

create function public.arma_owns(p_character text, p_account uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.arma_characters where id = p_character and account = p_account)
$$;
-- The two helpers a policy calls as the READER: they take no account argument and answer only about the caller, so they cannot probe another account.
create function public.arma_me_allowed() returns boolean language sql stable security definer set search_path = '' as $$
  select public.arma_allowed((select auth.uid()))
$$;
create function public.arma_me_owns(p_character text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.arma_owns(p_character, (select auth.uid()))
$$;

create table public.arma_active_character (
  account uuid primary key references auth.users (id) on delete cascade,
  character text not null references public.arma_characters (id) on delete cascade,
  set_at timestamptz not null default now()
);
-- Where the server last saw a character, in centimetres inside the area's own frame. Written ONLY from presence's observation; no client op writes it.
create table public.arma_character_location (
  character text primary key references public.arma_characters (id) on delete cascade,
  area text not null check (area ~ '^[a-z][a-z0-9.-]{0,31}$'),
  x int not null check (x between -100000 and 100000),
  z int not null check (z between -100000 and 100000),
  updated_at timestamptz not null
);
-- The run: ONE row per character, the game's v18 save record (src/engine/save-eras.js) plus its era. revision counts server writes; a stale phone is refused.
create table public.arma_runs (
  character text primary key references public.arma_characters (id) on delete cascade,
  era int not null check (era between 1 and 99),
  record jsonb not null check (jsonb_typeof(record) = 'object' and (record ->> 'version')::int = era),
  revision int not null default 1 check (revision >= 1),
  saved_at timestamptz not null default now()
);
-- The idempotency ledger: ids are derived server-side; a retried event hits the primary key and aborts with O0001 (the writer reads that as "already done").
create table public.arma_events (
  event_id text primary key check (char_length(event_id) between 3 and 200),
  kind text not null check (kind in ('kill', 'loot', 'save', 'travel')),
  account uuid not null references auth.users (id) on delete cascade,
  character text references public.arma_characters (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index arma_events_account on public.arma_events (account, at desc);

alter table public.arma_config enable row level security;
alter table public.arma_access enable row level security;
alter table public.arma_characters enable row level security;
alter table public.arma_active_character enable row level security;
alter table public.arma_character_location enable row level security;
alter table public.arma_runs enable row level security;
alter table public.arma_events enable row level security;
revoke all on public.arma_config, public.arma_access, public.arma_characters, public.arma_active_character, public.arma_character_location, public.arma_runs, public.arma_events from public, anon, authenticated;
revoke all on function public.arma_allowed(uuid), public.arma_owns(text, uuid), public.arma_me_allowed(), public.arma_me_owns(text) from public, anon, authenticated;
grant execute on function public.arma_me_allowed(), public.arma_me_owns(text) to authenticated;   -- the policies below call them as the reader

grant select on public.arma_characters, public.arma_runs to authenticated;
grant select (event_id, kind, at) on public.arma_events to authenticated;
create policy "an account reads its own characters" on public.arma_characters for select to authenticated using (account = (select auth.uid()) and public.arma_me_allowed());
create policy "an account reads its own run" on public.arma_runs for select to authenticated using (public.arma_me_owns(character) and public.arma_me_allowed());
create policy "an account reads its own events" on public.arma_events for select to authenticated using (account = (select auth.uid()) and public.arma_me_allowed());

-- ---- the writer's functions (security definer; execute for the server roles only) ------------------------------------------------

create function public.arma_create_character(p_account uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare cid text;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  cid := 'pc:' || replace(gen_random_uuid()::text, '-', '');
  insert into public.arma_characters (id, account, name) values (cid, p_account, p_name);
  insert into public.arma_active_character (account, character) values (p_account, cid)
    on conflict (account) do update set character = excluded.character, set_at = now();
  return cid;
end $$;

create function public.arma_set_active(p_account uuid, p_character text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then return false; end if;
  insert into public.arma_active_character (account, character) values (p_account, p_character)
    on conflict (account) do update set character = excluded.character, set_at = now();
  return true;
end $$;

create function public.arma_active(p_account uuid) returns text language sql stable security definer set search_path = '' as $$
  select a.character from public.arma_active_character a join public.arma_characters c on c.id = a.character and c.account = a.account
  where a.account = p_account and public.arma_allowed(p_account)
$$;

-- Presence's observation of an ACCOUNT, stored for its active character. The latest observation wins: one older than the stored row changes nothing,
-- and a time in the future is taken as now. Returns {character, stored}; character null (nothing written) when arma is not open or there is no active character.
create function public.arma_save_location(p_account uuid, p_area text, p_x int, p_z int, p_at_ms bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cid text; n int;
begin
  if not public.arma_allowed(p_account) then return jsonb_build_object('character', null, 'stored', false); end if;
  cid := public.arma_active(p_account);
  if cid is null then return jsonb_build_object('character', null, 'stored', false); end if;
  insert into public.arma_character_location (character, area, x, z, updated_at) values (cid, p_area, p_x, p_z, least(to_timestamp(p_at_ms / 1000.0), now()))
  on conflict (character) do update set area = excluded.area, x = excluded.x, z = excluded.z, updated_at = excluded.updated_at
  where public.arma_character_location.updated_at <= excluded.updated_at;
  get diagnostics n = row_count;
  return jsonb_build_object('character', cid, 'stored', n > 0);
end $$;

create function public.arma_saved_location(p_account uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.arma_allowed(p_account) then (
    select jsonb_build_object('character', l.character, 'area', l.area, 'x', l.x, 'z', l.z, 'updated_at', l.updated_at)
    from public.arma_characters c join public.arma_character_location l on l.character = c.id
    where c.id = public.arma_active(p_account)) end
$$;

-- Store the run. expected_revision 0 creates it; otherwise it must equal the stored revision (a stale phone gets {refused:'stale'} and nothing changes).
-- The record's own version must equal its era, and the era must be a known one (arma_config oldest_era..current_era).
create function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then raise exception 'not this account''s character' using errcode = 'O0007'; end if;
  select (value #>> '{}')::int into lo from public.arma_config where key = 'oldest_era';
  select (value #>> '{}')::int into hi from public.arma_config where key = 'current_era';
  if p_era < lo or p_era > hi then return jsonb_build_object('refused', 'era', 'currentEra', hi); end if;
  if jsonb_typeof(p_record) <> 'object' or (p_record ->> 'version') is distinct from p_era::text then return jsonb_build_object('refused', 'shape'); end if;
  select * into r from public.arma_runs where character = p_character for update;
  if not found then
    if p_expected_revision <> 0 then return jsonb_build_object('refused', 'stale', 'revision', 0); end if;
    insert into public.arma_runs (character, era, record) values (p_character, p_era, p_record) returning * into r;
  else
    if p_expected_revision <> r.revision then return jsonb_build_object('refused', 'stale', 'revision', r.revision); end if;
    update public.arma_runs set era = p_era, record = p_record, revision = r.revision + 1, saved_at = now() where character = p_character returning * into r;
  end if;
  return jsonb_build_object('revision', r.revision, 'savedAt', r.saved_at);
end $$;

create function public.arma_load_run(p_account uuid, p_character text) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.arma_allowed(p_account) and public.arma_owns(p_character, p_account) then (
    select jsonb_build_object('era', era, 'record', record, 'revision', revision, 'savedAt', saved_at) from public.arma_runs where character = p_character) end
$$;

-- Idempotency: the first insert of an id wins; a second raises O0001, which the writer reads as "already done".
create function public.arma_record_event(p_account uuid, p_character text, p_event_id text, p_kind text, p_payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  begin
    insert into public.arma_events (event_id, kind, account, character, payload) values (p_event_id, p_kind, p_account, p_character, coalesce(p_payload, '{}'::jsonb));
  exception when unique_violation then
    raise exception 'event % already recorded', p_event_id using errcode = 'O0001';
  end;
end $$;

revoke all on function public.arma_create_character(uuid, text), public.arma_set_active(uuid, text), public.arma_active(uuid), public.arma_save_location(uuid, text, int, int, bigint),
  public.arma_saved_location(uuid), public.arma_save_run(uuid, text, int, jsonb, int), public.arma_load_run(uuid, text), public.arma_record_event(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
-- TRAP (Origins' kill switches once failed silently): grant every function to EVERY server role that calls it.
grant execute on function public.arma_create_character(uuid, text), public.arma_set_active(uuid, text), public.arma_active(uuid), public.arma_saved_location(uuid),
  public.arma_save_run(uuid, text, int, jsonb, int), public.arma_load_run(uuid, text), public.arma_record_event(uuid, text, text, text, jsonb) to arma_writer;
grant execute on function public.arma_save_location(uuid, text, int, int, bigint), public.arma_saved_location(uuid), public.arma_active(uuid) to arma_presence;
grant execute on function public.arma_save_location(uuid, text, int, int, bigint) to arma_writer;
commit;
