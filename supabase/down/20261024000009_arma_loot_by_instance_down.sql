begin;
-- Restores arma_spawn_hit as 20261024000002_arma_world.sql made it (loot by creature kind) and removes exactly the rows 000009 seeds.
delete from public.arma_loot_rules where kind in ('area7:boss-knight-v1', 'area8:boss-veteran-v1', 'east-bridge:boss-warden-v1', 'east:east-roamer-2',
  'elephant-and-castle:boss-butcher-v1', 'lambeth:boss-surgeon-v1', 'south:boss-nightborn-v1', 'westminster:boss-witch-v1');
alter table public.arma_loot_rules drop constraint arma_loot_rules_kind_check;
alter table public.arma_loot_rules add constraint arma_loot_rules_kind_check check (kind ~ '^[a-z0-9._:-]{1,64}$');
create or replace function public.arma_spawn_hit(p_account uuid, p_token text, p_weapon text, p_claimed numeric, p_hits int, p_respawn_s int) returns jsonb language plpgsql security definer set search_path = '' as $$
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
commit;
