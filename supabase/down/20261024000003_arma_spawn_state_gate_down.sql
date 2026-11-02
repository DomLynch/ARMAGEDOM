begin;
-- Restores the ungated arma_spawn_state(text[]) that 20261024000002_arma_world.sql created.
drop function if exists public.arma_spawn_state(uuid, text[]);
create function public.arma_spawn_state(p_instances text[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('now', now(), 'spawns', coalesce((select jsonb_agg(public.arma_spawn_view(s) order by s.instance) from public.arma_spawns s where s.instance = any(p_instances)), '[]'::jsonb))
$$;
revoke all on function public.arma_spawn_state(text[]) from public, anon, authenticated;
grant execute on function public.arma_spawn_state(text[]) to arma_writer;
commit;
