begin;
-- ROLLBACK: supabase/down/20261024000002_arma_world_down.sql (drops exactly what this file creates).
-- ARMAGEDOM W3: shared spawns with a SERVER-OWNED health bar, the damage ledger, and the settle that ignores a lying phone.
-- Modelled on Frankendom Origins (202610080014_origins_world_spawns, 20261019113226_origins_damage_share), with one deliberate difference: Origins lets every
-- phone fight its own copy of a creature and splits credit afterwards from replayed fights; here the DATABASE holds the creature's hp, so every player
-- sees one bar and one death. The phone only CLAIMS damage; the database applies at most what the weapon rules and the elapsed real time allow,
-- ignores any claimed kill, and pays from the ledger of APPLIED damage in the same transaction as the death. Creature movement stays on each phone (phase 1).
-- RLS on, no policy, no grant for any client role. Functions are granted to arma_writer.

create table public.arma_world_config (
  id boolean primary key default true check (id),
  engage_ttl_s int not null default 120 check (engage_ttl_s between 30 and 1800),   -- a token lives this long after its last accepted hit or touch
  max_open int not null default 4 check (max_open between 1 and 16),                -- open engages per account
  kills_per_min int not null default 6 check (kills_per_min between 1 and 60),
  kills_per_hour int not null default 120 check (kills_per_hour between 1 and 3600),
  min_share_pct numeric not null default 5 check (min_share_pct between 0 and 100),   -- below this share of the applied damage a contributor is not paid
  first_hit_allowance_s numeric not null default 1 check (first_hit_allowance_s > 0),  -- the real time a first report is allowed to cover
  max_elapsed_s numeric not null default 5 check (max_elapsed_s > 0),                 -- the most real time one report can ever cover (a long gap does not bank damage)
  dps_slack numeric not null default 1.25 check (dps_slack between 1 and 3)           -- jitter allowance on the weapon ceiling: batched per-tick reports are not perfectly regular
);
insert into public.arma_world_config default values;

-- Server-held weapon limits, one row per weapon id. The phone never supplies these numbers.
create table public.arma_weapon_rules (
  weapon text primary key check (weapon ~ '^[a-z0-9._:-]{1,64}$'),
  max_damage_per_hit numeric not null check (max_damage_per_hit > 0),
  max_hits_per_s numeric not null check (max_hits_per_s > 0)
);
-- What a kind of creature can drop. chance is per contributor per slot; the roll is deterministic from instance|generation|account|slot, so a retry rolls the same.
create table public.arma_loot_rules (
  kind text not null check (kind ~ '^[a-z0-9._:-]{1,64}$'),
  slot int not null check (slot between 0 and 15),
  item text not null check (item ~ '^[a-z0-9._:-]{1,120}$'),
  chance numeric not null check (chance > 0 and chance <= 1),
  primary key (kind, slot)
);

create table public.arma_spawns (
  instance text primary key check (instance ~ '^[a-z0-9._:-]{1,96}$'),
  kind text not null check (kind ~ '^[a-z0-9._:-]{1,64}$'),
  area text not null check (area ~ '^[a-z][a-z0-9.-]{0,31}$'),
  max_hp numeric not null check (max_hp > 0),
  hp numeric not null check (hp >= 0 and hp <= max_hp),
  alive boolean not null default true,
  generation int not null default 0 check (generation >= 0),
  respawn_at timestamptz,
  killed_at timestamptz,
  check ((alive and respawn_at is null) or (not alive and hp = 0 and respawn_at is not null))
);
create table public.arma_spawn_engages (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{16,128}$'),
  account uuid not null,
  character text not null,
  instance text not null references public.arma_spawns (instance),
  generation int not null,
  issued_at timestamptz not null default now(),
  last_hit_at timestamptz,
  expires_at timestamptz not null,
  used_at timestamptz,
  result text check (result in ('killed', 'dead', 'expired'))
);
create unique index arma_spawn_engages_one_open on public.arma_spawn_engages (account, instance) where used_at is null;
-- One row per contributor per incarnation of a creature: the APPLIED damage, never the claimed one.
create table public.arma_spawn_damage (
  instance text not null references public.arma_spawns (instance),
  generation int not null,
  account uuid not null,
  character text not null,
  damage numeric not null default 0 check (damage >= 0),
  hits int not null default 0 check (hits >= 0),
  claimed numeric not null default 0 check (claimed >= 0),   -- what the phone said, kept to spot liars; never used for payment
  primary key (instance, generation, account)
);
create table public.arma_loot (
  mint_key text primary key,   -- kill:<instance>:<generation>:<account>:<slot>
  item text not null,
  account uuid not null,
  character text not null,
  instance text not null,
  generation int not null,
  minted_at timestamptz not null default now()
);
create index arma_loot_owner on public.arma_loot (account, minted_at desc);

alter table public.arma_world_config enable row level security;
alter table public.arma_weapon_rules enable row level security;
alter table public.arma_loot_rules enable row level security;
alter table public.arma_spawns enable row level security;
alter table public.arma_spawn_engages enable row level security;
alter table public.arma_spawn_damage enable row level security;
alter table public.arma_loot enable row level security;
revoke all on public.arma_world_config, public.arma_weapon_rules, public.arma_loot_rules, public.arma_spawns, public.arma_spawn_engages, public.arma_spawn_damage, public.arma_loot from public, anon, authenticated;
-- A player may read the loot it was paid (the phone shows it); nothing else here is readable by a client.
grant select on public.arma_loot to authenticated;
create policy "an account reads its own loot" on public.arma_loot for select to authenticated using (account = (select auth.uid()) and public.arma_me_allowed());

-- A dead spawn whose respawn time has passed is alive again at full hp, next generation. The clock is the database's.
create function public.arma_spawn_view(s public.arma_spawns) returns jsonb language sql stable set search_path = '' as $$
  select case when s.alive or s.respawn_at <= now()
    then jsonb_build_object('instance', s.instance, 'kind', s.kind, 'area', s.area, 'alive', true, 'hp', case when s.alive then s.hp else s.max_hp end, 'maxHp', s.max_hp,
                            'respawnAt', null, 'generation', s.generation + (case when s.alive then 0 else 1 end))
    else jsonb_build_object('instance', s.instance, 'kind', s.kind, 'area', s.area, 'alive', false, 'hp', 0, 'maxHp', s.max_hp, 'respawnAt', s.respawn_at, 'generation', s.generation) end
$$;

-- Read-only: the state of the named instances and the database clock. Instances never engaged are not listed (the writer reads them as alive at full hp).
create function public.arma_spawn_state(p_instances text[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('now', now(), 'spawns', coalesce((select jsonb_agg(public.arma_spawn_view(s) order by s.instance) from public.arma_spawns s where s.instance = any(p_instances)), '[]'::jsonb))
$$;

-- Engage a LIVE spawn (creating its row on first engage from the world rows the writer derives). One open engage per account per creature; re-engaging returns it.
create function public.arma_spawn_engage(p_account uuid, p_character text, p_token text, p_instance text, p_kind text, p_area text, p_max_hp numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.arma_world_config; s public.arma_spawns; e public.arma_spawn_engages;
begin
  if not public.arma_allowed(p_account) or not public.arma_owns(p_character, p_account) then raise exception 'arma is not open for this character' using errcode = 'O0007'; end if;
  select * into cfg from public.arma_world_config;
  insert into public.arma_spawns (instance, kind, area, max_hp, hp) values (p_instance, p_kind, p_area, p_max_hp, p_max_hp) on conflict (instance) do nothing;
  select * into s from public.arma_spawns where instance = p_instance for update;
  if s.kind <> p_kind or s.area <> p_area or s.max_hp <> p_max_hp then raise exception 'spawn % does not match its world row', p_instance using errcode = 'O0002'; end if;
  if not s.alive and s.respawn_at > now() then return jsonb_build_object('refused', 'dead', 'respawnAt', s.respawn_at); end if;
  if not s.alive then update public.arma_spawns set alive = true, hp = max_hp, generation = generation + 1, respawn_at = null, killed_at = null where instance = p_instance returning * into s; end if;
  update public.arma_spawn_engages set used_at = now(), result = 'expired' where account = p_account and used_at is null and expires_at <= now();
  select * into e from public.arma_spawn_engages where account = p_account and instance = p_instance and used_at is null;
  if found and e.generation = s.generation then
    update public.arma_spawn_engages set expires_at = now() + make_interval(secs => cfg.engage_ttl_s) where token = e.token returning * into e;
  else
    if found then update public.arma_spawn_engages set used_at = now(), result = 'dead' where token = e.token; end if;
    if (select count(*) from public.arma_spawn_engages where account = p_account and used_at is null) >= cfg.max_open then return jsonb_build_object('refused', 'too-many'); end if;
    insert into public.arma_spawn_engages (token, account, character, instance, generation, expires_at) values (p_token, p_account, p_character, p_instance, s.generation, now() + make_interval(secs => cfg.engage_ttl_s)) returning * into e;
  end if;
  return jsonb_build_object('token', e.token, 'instance', e.instance, 'generation', e.generation, 'hp', s.hp, 'maxHp', s.max_hp, 'expiresAt', e.expires_at);
end $$;

-- A hit report. p_claimed is the phone's claimed damage over p_hits swings. The database applies at most:
--   (1) hits x the weapon's max damage per hit, with hits itself capped by the weapon's max hits per second over the REAL time since this token's last accepted report;
--   (2) the weapon's damage-per-second ceiling over that same real time (a long gap banks at most max_elapsed_s).
-- A claimed kill does not exist: the creature dies only when its hp reaches 0. On death everyone in the ledger is paid in this same transaction.
create function public.arma_spawn_hit(p_account uuid, p_token text, p_weapon text, p_claimed numeric, p_hits int, p_respawn_s int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg public.arma_world_config; e public.arma_spawn_engages; s public.arma_spawns; w public.arma_weapon_rules; elapsed numeric; hits_ok int; applied numeric; total numeric; c record; r record; roll numeric; minted int := 0; paid int := 0;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  select * into cfg from public.arma_world_config;
  select * into w from public.arma_weapon_rules where weapon = p_weapon;
  if not found then return jsonb_build_object('refused', 'weapon'); end if;
  select * into e from public.arma_spawn_engages where token = p_token and account = p_account and used_at is null and expires_at > now() for update;
  if not found then raise exception 'engage token unknown, used or expired' using errcode = 'O0009'; end if;
  select * into s from public.arma_spawns where instance = e.instance for update;
  if not (s.alive and s.generation = e.generation) then
    update public.arma_spawn_engages set used_at = now(), result = 'dead' where token = p_token;
    return jsonb_build_object('refused', 'dead', 'respawnAt', s.respawn_at);
  end if;
  elapsed := least(coalesce(extract(epoch from (now() - e.last_hit_at)), cfg.first_hit_allowance_s), cfg.max_elapsed_s);
  hits_ok := least(greatest(p_hits, 0), ceil(w.max_hits_per_s * elapsed * cfg.dps_slack)::int);
  applied := least(greatest(coalesce(p_claimed, 0), 0), hits_ok * w.max_damage_per_hit, w.max_damage_per_hit * w.max_hits_per_s * elapsed * cfg.dps_slack, s.hp);
  update public.arma_spawn_engages set last_hit_at = now(), expires_at = now() + make_interval(secs => cfg.engage_ttl_s) where token = p_token;
  insert into public.arma_spawn_damage (instance, generation, account, character, damage, hits, claimed) values (e.instance, e.generation, p_account, e.character, applied, hits_ok, greatest(coalesce(p_claimed, 0), 0))
    on conflict (instance, generation, account) do update set damage = public.arma_spawn_damage.damage + excluded.damage, hits = public.arma_spawn_damage.hits + excluded.hits, claimed = public.arma_spawn_damage.claimed + excluded.claimed;
  update public.arma_spawns set hp = hp - applied where instance = e.instance returning * into s;
  if s.hp > 0 then
    return jsonb_build_object('applied', applied, 'hp', s.hp, 'maxHp', s.max_hp, 'killed', false);
  end if;

  -- Death and settle, one transaction. Everyone in this incarnation's ledger with at least min_share_pct of the applied damage is paid; no last-hit bonus.
  update public.arma_spawns set alive = false, hp = 0, respawn_at = now() + make_interval(secs => least(greatest(p_respawn_s, 10), 86400)), killed_at = now() where instance = e.instance returning * into s;
  update public.arma_spawn_engages set used_at = now(), result = 'killed' where instance = e.instance and generation = e.generation and used_at is null;
  select sum(damage) into total from public.arma_spawn_damage where instance = e.instance and generation = e.generation;
  for c in select * from public.arma_spawn_damage where instance = e.instance and generation = e.generation order by account loop
    continue when total <= 0 or c.damage * 100 / total < cfg.min_share_pct;
    continue when (select count(*) from public.arma_events where account = c.account and kind = 'kill' and at > now() - interval '1 minute') >= cfg.kills_per_min
               or (select count(*) from public.arma_events where account = c.account and kind = 'kill' and at > now() - interval '1 hour') >= cfg.kills_per_hour;
    begin
      insert into public.arma_events (event_id, kind, account, character, payload)
        values ('kill:' || e.instance || ':' || e.generation || ':' || c.account, 'kill', c.account, c.character,
                jsonb_build_object('instance', e.instance, 'kind', s.kind, 'generation', e.generation, 'damage', c.damage, 'sharePct', round(c.damage * 100 / total, 2)));
    exception when unique_violation then continue;   -- already settled (cannot happen inside one death, kept for a retried report)
    end;
    paid := paid + 1;
    for r in select * from public.arma_loot_rules where kind = s.kind order by slot loop
      roll := (abs(hashtextextended(e.instance || '|' || e.generation || '|' || c.account || '|' || r.slot, 0)) % 1000000) / 1000000.0;
      if roll < r.chance then
        insert into public.arma_loot (mint_key, item, account, character, instance, generation)
          values ('kill:' || e.instance || ':' || e.generation || ':' || c.account || ':' || r.slot, r.item, c.account, c.character, e.instance, e.generation) on conflict (mint_key) do nothing;
        minted := minted + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('applied', applied, 'hp', 0, 'maxHp', s.max_hp, 'killed', true, 'respawnAt', s.respawn_at, 'paid', paid, 'minted', minted);
end $$;

-- One presence tick = one transaction. p_batch is an array of {account, token, weapon, applied, hits, respawnS} that PRESENCE has already clamped (reach, rate, weapon);
-- each row still goes through arma_spawn_hit, so the database applies its own ceiling again. A row that fails (closed token, unknown spawn) is reported in its slot and does not
-- stop the others. Rows are applied in the order given, so two players' hits in one tick are settled deterministically.
create function public.arma_spawn_hit_batch(p_batch jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; out jsonb := '[]'::jsonb; res jsonb;
begin
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) > 200 then raise exception 'a hit batch is an array of at most 200 rows' using errcode = 'O0002'; end if;
  for item in select * from jsonb_array_elements(p_batch) loop
    begin
      res := public.arma_spawn_hit((item ->> 'account')::uuid, item ->> 'token', item ->> 'weapon', (item ->> 'applied')::numeric, coalesce((item ->> 'hits')::int, 1), coalesce((item ->> 'respawnS')::int, 60));
    exception when others then
      res := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
    end;
    out := out || jsonb_build_array(jsonb_build_object('token', item ->> 'token') || res);
  end loop;
  return out;
end $$;

revoke all on function public.arma_spawn_view(public.arma_spawns), public.arma_spawn_state(text[]), public.arma_spawn_engage(uuid, text, text, text, text, text, numeric),
  public.arma_spawn_hit(uuid, text, text, numeric, int, int), public.arma_spawn_hit_batch(jsonb) from public, anon, authenticated;
-- TRAP: every server role that calls a function gets it. Today only the writer calls these; add roles here, not later.
grant execute on function public.arma_spawn_state(text[]), public.arma_spawn_engage(uuid, text, text, text, text, text, numeric), public.arma_spawn_hit(uuid, text, text, numeric, int, int), public.arma_spawn_hit_batch(jsonb) to arma_writer;
commit;
