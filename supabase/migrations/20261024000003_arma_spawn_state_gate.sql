begin;
-- Auditor fix on the writer (#33): reading spawn hp and respawn times needs the same access gate as every other client op.
-- The state read now takes the account and refuses it with O0007 unless arma_allowed, exactly like arma_spawn_engage.
drop function public.arma_spawn_state(text[]);
create function public.arma_spawn_state(p_account uuid, p_instances text[]) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.arma_allowed(p_account) then raise exception 'arma is not open for this account' using errcode = 'O0007'; end if;
  return jsonb_build_object('now', now(), 'spawns', coalesce((select jsonb_agg(public.arma_spawn_view(s) order by s.instance) from public.arma_spawns s where s.instance = any(p_instances)), '[]'::jsonb));
end
$$;
revoke all on function public.arma_spawn_state(uuid, text[]) from public, anon, authenticated;
grant execute on function public.arma_spawn_state(uuid, text[]) to arma_writer;
commit;
