begin;
-- Auditor fix on presence (#59): a hit is applied to the creature of the TOKEN's engage row, so the result must say which creature that was.
-- Presence used to broadcast the instance the phone claimed, so a modified client could relabel another creature's bar for the whole layer.
-- arma_spawn_hit_batch now adds the engage row's instance and generation to every result row; presence broadcasts those, never the claim.
create or replace function public.arma_spawn_hit_batch(p_batch jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; out jsonb := '[]'::jsonb; res jsonb; v_instance text; v_generation int;
begin
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) > 200 then raise exception 'a hit batch is an array of at most 200 rows' using errcode = 'O0002'; end if;
  for item in select * from jsonb_array_elements(p_batch) loop
    begin
      res := public.arma_spawn_hit((item ->> 'account')::uuid, item ->> 'token', item ->> 'weapon', (item ->> 'applied')::numeric, coalesce((item ->> 'hits')::int, 1), coalesce((item ->> 'respawnS')::int, 60));
    exception when others then
      res := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
    end;
    -- Only this account's own token counts: a token that is not theirs names nothing (null), and a malformed row names nothing either.
    v_instance := null; v_generation := null;
    begin
      select e.instance, e.generation into v_instance, v_generation from public.arma_spawn_engages e where e.token = item ->> 'token' and e.account = (item ->> 'account')::uuid;
    exception when others then
      v_instance := null; v_generation := null;
    end;
    out := out || jsonb_build_array(jsonb_build_object('token', item ->> 'token', 'instance', v_instance, 'generation', v_generation) || res);
  end loop;
  return out;
end $$;
revoke all on function public.arma_spawn_hit_batch(jsonb) from public, anon, authenticated;
grant execute on function public.arma_spawn_hit_batch(jsonb) to arma_writer;
commit;
