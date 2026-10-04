-- Dedicated ARMAGEDOM local/dev only. Never apply to a donor or production project.
begin;
create function public.armagedom_valid_prototype_payload(p jsonb)
returns boolean language sql immutable strict set search_path = '' as $$
  select coalesce(
    jsonb_typeof(p) = 'object' and octet_length(p::text) <= 32768 and
    p - array['character','area','equipment']::text[] = '{}'::jsonb and
    jsonb_typeof(p->'character') = 'string' and (p->>'character') ~ '^[a-z0-9_-]{1,64}$' and
    jsonb_typeof(p->'area') = 'string' and (p->>'area') in ('westminster','east','south') and
    case when jsonb_typeof(p->'equipment') = 'array' then
      jsonb_array_length(p->'equipment') <= 16 and not exists (
        select 1 from jsonb_array_elements(p->'equipment') item
        where jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[a-z0-9_-]{1,64}$'
      ) else false end, false);
$$;
revoke all on function public.armagedom_valid_prototype_payload(jsonb) from public,anon,authenticated;
grant execute on function public.armagedom_valid_prototype_payload(jsonb) to authenticated;

create table public.armagedom_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32 and btrim(display_name) <> '')
);
create table public.armagedom_character_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  trust text not null default 'unvalidated_prototype' check (trust = 'unvalidated_prototype'),
  payload jsonb not null check (public.armagedom_valid_prototype_payload(payload)),
  updated_at timestamptz not null default now()
);
create function public.armagedom_increment_save_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.armagedom_increment_save_revision() from public,anon,authenticated;
create trigger armagedom_save_revision before update on public.armagedom_character_saves
for each row execute function public.armagedom_increment_save_revision();

alter table public.armagedom_profiles enable row level security;
alter table public.armagedom_character_saves enable row level security;
revoke all on public.armagedom_profiles,public.armagedom_character_saves from public,anon,authenticated;
grant select on public.armagedom_profiles,public.armagedom_character_saves to authenticated;
grant insert(user_id,display_name), update(display_name) on public.armagedom_profiles to authenticated;
grant insert(user_id,payload), update(payload) on public.armagedom_character_saves to authenticated;

-- Identity comes from verified Supabase Auth JWT, never user_metadata or client fields.
create policy armagedom_profile_read on public.armagedom_profiles for select to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy armagedom_profile_insert on public.armagedom_profiles for insert to authenticated
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy armagedom_profile_update on public.armagedom_profiles for update to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy armagedom_save_read on public.armagedom_character_saves for select to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy armagedom_save_insert on public.armagedom_character_saves for insert to authenticated
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy armagedom_save_update on public.armagedom_character_saves for update to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
commit;
