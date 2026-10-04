-- DESTRUCTIVE: export dedicated dev rows first if they must be retained.
-- Removes only this foundation; never removes auth.users or other schemas.
begin;
drop table public.armagedom_character_saves;
drop table public.armagedom_profiles;
drop function public.armagedom_increment_save_revision();
drop function public.armagedom_valid_prototype_payload(jsonb);
commit;
