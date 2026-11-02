begin;
-- Drops exactly what supabase/migrations/20261024000001_arma_core.sql creates (functions first, then tables, then the roles).
drop function if exists public.arma_record_event(uuid, text, text, text, jsonb);
drop function if exists public.arma_load_run(uuid, text);
drop function if exists public.arma_save_run(uuid, text, int, jsonb, int);
drop function if exists public.arma_saved_location(uuid);
drop function if exists public.arma_save_location(uuid, text, int, int, bigint);
drop function if exists public.arma_active(uuid);
drop function if exists public.arma_set_active(uuid, text);
drop function if exists public.arma_create_character(uuid, text);
drop table if exists public.arma_events, public.arma_runs, public.arma_character_location, public.arma_active_character, public.arma_characters, public.arma_access, public.arma_config;
drop function if exists public.arma_me_owns(text);
drop function if exists public.arma_me_allowed();
drop function if exists public.arma_owns(text, uuid);
drop function if exists public.arma_allowed(uuid);
drop role if exists arma_presence;
drop role if exists arma_writer;
commit;
