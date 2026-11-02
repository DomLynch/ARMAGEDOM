begin;
-- Restores arma_spawn_hit_batch as 20261024000002_arma_world.sql created it (results carry the token but not the instance).
create or replace function public.arma_spawn_hit_batch(p_batch jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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
revoke all on function public.arma_spawn_hit_batch(jsonb) from public, anon, authenticated;
grant execute on function public.arma_spawn_hit_batch(jsonb) to arma_writer;
commit;
