begin;
-- ROLLBACK: supabase/down/20261024000007_arma_save_envelope_down.sql.
-- A2 PR 1, the save envelope (docs/MULTIPLAYER-DATA-LAYER.md): arma_save_run gains a client sequence number so a retry is idempotent, and every
-- record is checked for shape and value caps before it is stored. It does NOT make the phone's numbers true: the caps bound what a cheating
-- phone can claim. Money, ownership and progress by receipt come with PR 2 and 3.

-- Idempotency: the last APPLIED save's sequence number, a hash of what was sent, and the answer given. Refusals never consume a sequence number.
alter table public.arma_runs
  add column last_seq int not null default 0 check (last_seq >= 0),
  add column last_hash text,
  add column last_result jsonb;

-- The closed set of top-level keys of the v18 record (Web/tests/fixtures/navigation203-source202-v18.json). Older eras use a subset.
create table public.arma_record_keys (key text primary key);
insert into public.arma_record_keys (key) values
  ('version'), ('pistol'), ('hp'), ('supplies'), ('vest'), ('droneDeaths'), ('animalCycle'), ('progression'), ('expedition'),
  ('uniqueReward'), ('flameFuel'), ('rifle'), ('bossEquipment'), ('locker'), ('openingStory'), ('marked');

-- Caps by path. A path is the dotted key path with every array level written as "[]" ("supplies.issued[]", "bossEquipment.shotgun.magazine").
-- "*" in a pattern matches any text, so "bossEquipment.*.magazine" covers every boss weapon; the LONGEST matching pattern wins.
--   kind 'num'  : a number leaf; min_value..max_value inclusive, a whole number unless integer_only is false.
--   kind 'len'  : an array's element count, or a string's characters (min_value..max_value).
-- These ceilings are deliberately generous (Combat may tighten them): they stop absurd values, not clever ones.
create table public.arma_record_caps (
  path_pattern text primary key check (path_pattern ~ '^[A-Za-z0-9_.*\[\]-]+$'),
  kind text not null check (kind in ('num', 'len')),
  min_value numeric not null,
  max_value numeric not null,
  integer_only boolean not null default true,
  check (min_value <= max_value)
);
insert into public.arma_record_caps (path_pattern, kind, min_value, max_value, integer_only) values
  ('version', 'num', 1, 99, true),
  ('hp', 'num', 0, 1000, true),
  ('marked.carried', 'num', 0, 1000000000, true),
  ('marked.bank', 'num', 0, 1000000000, true),
  ('marked.bounty', 'num', 0, 1000000000, true),
  ('marked.version', 'num', 1, 99, true),
  ('openingStory.bountyStage', 'num', 0, 100, true),
  ('pistol.magazine', 'num', 0, 200, true),
  ('pistol.reserve', 'num', 0, 9999, true),
  ('rifle.magazine', 'num', 0, 200, true),
  ('rifle.reserve', 'num', 0, 9999, true),
  ('bossEquipment.*.magazine', 'num', 0, 200, true),
  ('bossEquipment.*.reserve', 'num', 0, 9999, true),
  ('flameFuel.fuelUnits', 'num', 0, 10000, true),
  ('locker.ammo.*', 'num', 0, 100000, true),
  ('progression.attributes.*', 'num', 10, 20, true),
  ('progression.proficiency.*', 'num', 0, 100, true),
  ('progression.awards', 'len', 0, 200, true),
  ('progression.rulesStamp', 'len', 0, 500, true),
  ('supplies.issued', 'len', 0, 300, true),
  ('supplies.collected', 'len', 0, 300, true),
  ('supplies.pending', 'len', 0, 300, true),
  ('supplies.rolls', 'len', 0, 300, true),
  ('expedition.visitedIds', 'len', 0, 100, true),
  ('droneDeaths', 'len', 0, 500, true),
  ('locker.weapons', 'len', 0, 100, true),
  -- World coordinates are the only fractional numbers in a record.
  ('*position.x', 'num', -100000, 100000, false),
  ('*position.z', 'num', -100000, 100000, false),
  ('*dropPosition.x', 'num', -100000, 100000, false),
  ('*dropPosition.z', 'num', -100000, 100000, false),
  ('*dropPosition.y', 'num', -100000, 100000, false),
  ('*position.y', 'num', -100000, 100000, false);
alter table public.arma_record_keys enable row level security;
alter table public.arma_record_caps enable row level security;
revoke all on public.arma_record_keys, public.arma_record_caps from public, anon, authenticated;

-- Limits that are not per path.
insert into public.arma_config (key, value) values
  ('record_max_bytes', '65536'::jsonb),          -- the record as text
  ('record_max_nodes', '4000'::jsonb),           -- every object, array and leaf
  ('record_max_depth', '8'::jsonb),
  ('record_default_number', '1000000000'::jsonb), -- |any whole number with no cap row| at most this
  ('record_default_string', '200'::jsonb)        -- characters of any string with no cap row
on conflict (key) do nothing;

-- null when the record is acceptable, otherwise the reason: 'shape:<what>' (wrong kind of thing) or 'cap:<path>' (a number or length out of range).
create function public.arma_check_record(p_record jsonb) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  max_bytes int := (select (value #>> '{}')::int from public.arma_config where key = 'record_max_bytes');
  max_nodes int := (select (value #>> '{}')::int from public.arma_config where key = 'record_max_nodes');
  max_depth int := (select (value #>> '{}')::int from public.arma_config where key = 'record_max_depth');
  def_number numeric := (select (value #>> '{}')::numeric from public.arma_config where key = 'record_default_number');
  def_string int := (select (value #>> '{}')::int from public.arma_config where key = 'record_default_string');
  bad text;
begin
  if jsonb_typeof(p_record) is distinct from 'object' then return 'shape:record'; end if;
  if octet_length(p_record::text) > max_bytes then return 'cap:record-size'; end if;
  select 'shape:key:' || k.key into bad from jsonb_object_keys(p_record) as k(key) where not exists (select 1 from public.arma_record_keys r where r.key = k.key) limit 1;
  if bad is not null then return bad; end if;
  -- Walk the tree once (depth-limited, so a deeper record stops at max_depth + 1) and judge every node in the same statement.
  -- Priority: structure (depth, size), then numbers, then lengths. A null is allowed (the game writes "dropPosition": null for "no drop").
  with recursive walk(path, depth, val, t) as (
    select ''::text, 0, p_record, 'object'::text
    union all
    select case when e.key = '[]' then w.path || '[]' when w.path = '' then e.key else w.path || '.' || e.key end, w.depth + 1, e.value, jsonb_typeof(e.value)
    from walk w
    cross join lateral (
      select k.key, k.value from jsonb_each(case when w.t = 'object' then w.val else '{}'::jsonb end) as k
      union all
      select '[]', a.value from jsonb_array_elements(case when w.t = 'array' then w.val else '[]'::jsonb end) as a
    ) e
    where w.depth <= max_depth
  ),
  numbers as (
    select w.path, w.val, c.path_pattern, c.min_value, c.max_value, c.integer_only
    from walk w
    left join lateral (
      select * from public.arma_record_caps c
      where c.kind = 'num' and w.path like replace(replace(c.path_pattern, '_', '\_'), '*', '%') escape '\'
      order by length(c.path_pattern) desc limit 1
    ) c on true
    where w.t = 'number'
  ),
  lengths as (
    select w.path, w.val, w.t, c.max_value
    from walk w
    left join lateral (
      select * from public.arma_record_caps c
      where c.kind = 'len' and w.path like replace(replace(c.path_pattern, '_', '\_'), '*', '%') escape '\'
      order by length(c.path_pattern) desc limit 1
    ) c on true
    where w.t in ('array', 'string')
  )
  select reason into bad from (
    select 1 as pri, 'cap:record-depth' as reason from walk where depth > max_depth
    union all select 2, 'cap:record-nodes' from walk having count(*) > max_nodes
    -- numbers: a whole number unless the cap row says otherwise; no cap row means up to the default.
    union all select 4, 'shape:integer:' || path from numbers where coalesce(integer_only, true) and (val #>> '{}') !~ '^-?[0-9]+$'
    union all select 5, 'cap:' || path from numbers
      where case when path_pattern is null then abs((val #>> '{}')::numeric) > def_number
                 else (val #>> '{}')::numeric < min_value or (val #>> '{}')::numeric > max_value end
    -- lengths: an array's elements or a string's characters; no cap row means 300 elements or the default string length.
    union all select 6, 'cap:' || path from lengths
      where (case t when 'array' then jsonb_array_length(val) else char_length(val #>> '{}') end)
            > coalesce(max_value, case t when 'string' then def_string else 300 end)
  ) judged order by pri limit 1;
  return bad;
end $$;

drop function public.arma_save_run(uuid, text, int, jsonb, int);

-- Store the run. p_seq is the phone's counter: it rises on every NEW save attempt and is reused when it retries one.
--   seq > last_seq   applies (subject to the revision guard and the record checks);
--   seq = last_seq   with the same era/revision/record: the stored answer again, nothing written ('replayed': true);
--   seq = last_seq   with anything different: {refused:'seq-conflict'};
--   seq < last_seq   {refused:'stale-seq', lastSeq}.
-- A retry is answered before the era and record checks, so a save that was applied stays answered even after the era moves on.
-- revision stays as the cross-device guard. Refusals do not consume the sequence number.
create function public.arma_save_run(p_account uuid, p_character text, p_era int, p_record jsonb, p_expected_revision int, p_seq int) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.arma_runs; lo int; hi int; why text; h text; answer jsonb; existed boolean;
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  if not public.arma_owns(p_character, p_account) then raise exception 'not this account''s character' using errcode = 'O0007'; end if;
  if p_seq is null or p_seq < 1 then return jsonb_build_object('refused', 'seq'); end if;
  h := encode(sha256(convert_to(p_era::text || ':' || p_expected_revision::text || ':' || coalesce(p_record::text, ''), 'UTF8')), 'hex');
  select * into r from public.arma_runs where character = p_character for update;
  existed := found; -- FOUND is reset by every later SELECT INTO
  if existed then
    if p_seq = r.last_seq then
      if r.last_hash = h then return r.last_result || jsonb_build_object('replayed', true); end if;
      return jsonb_build_object('refused', 'seq-conflict', 'lastSeq', r.last_seq);
    end if;
    if p_seq < r.last_seq then return jsonb_build_object('refused', 'stale-seq', 'lastSeq', r.last_seq); end if;
  end if;
  select (value #>> '{}')::int into lo from public.arma_config where key = 'oldest_era';
  select (value #>> '{}')::int into hi from public.arma_config where key = 'current_era';
  if p_era < lo or p_era > hi then return jsonb_build_object('refused', 'era', 'currentEra', hi); end if;
  if jsonb_typeof(p_record) <> 'object' or (p_record ->> 'version') is distinct from p_era::text then return jsonb_build_object('refused', 'shape'); end if;
  if not existed then
    if p_expected_revision <> 0 then return jsonb_build_object('refused', 'stale', 'revision', 0); end if;
  elsif p_expected_revision <> r.revision then
    return jsonb_build_object('refused', 'stale', 'revision', r.revision);
  end if;
  why := public.arma_check_record(p_record);
  if why is not null then return jsonb_build_object('refused', split_part(why, ':', 1), 'reason', why); end if;
  if not existed then
    insert into public.arma_runs (character, era, record) values (p_character, p_era, p_record) returning * into r;
  else
    update public.arma_runs set era = p_era, record = p_record, revision = r.revision + 1, saved_at = now() where character = p_character returning * into r;
  end if;
  answer := jsonb_build_object('revision', r.revision, 'savedAt', r.saved_at);
  update public.arma_runs set last_seq = p_seq, last_hash = h, last_result = answer where character = p_character;
  return answer;
end $$;

revoke all on function public.arma_check_record(jsonb), public.arma_save_run(uuid, text, int, jsonb, int, int) from public, anon, authenticated;
-- TRAP (see 000001): grant to every server role that calls it. Only the writer saves; the check is internal to the save, so nothing else is granted.
grant execute on function public.arma_save_run(uuid, text, int, jsonb, int, int) to arma_writer;
commit;
