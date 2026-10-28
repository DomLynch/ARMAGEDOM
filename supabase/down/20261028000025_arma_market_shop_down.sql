begin;
-- Removes the shop and trading. Inventory rows (migration 000024) stay; cash already moved stays in the stored runs. `spent` is dropped, so the ceiling returns to start + earned.
drop function if exists public.arma_buy_item(uuid, text, text, text, int, text);
drop function if exists public.arma_sell_item(uuid, text, text, text, int, text);
drop function if exists public.arma_market_trade(uuid, text, text, text, text, int, text);
drop function if exists public.arma_market_stock(uuid, text);
drop table if exists public.arma_shop_stock;
drop function if exists public.arma_shop_no_loop();
create or replace function public.arma_cash_ceiling(p_character text) returns numeric language plpgsql stable security definer set search_path = '' as $$
declare allowed numeric; held numeric;
begin
  if not coalesce((select value = 'true'::jsonb from public.arma_config where key = 'enforce_cash'), true) then return null; end if;
  allowed := coalesce((select (value #>> '{}')::numeric from public.arma_config where key = 'start_cash_total'), 0)
           + coalesce((select earned from public.arma_cash where character = p_character), 0);
  held := coalesce((select coalesce((record #>> '{marked,carried}')::numeric, 0) + coalesce((record #>> '{marked,bank}')::numeric, 0) from public.arma_runs where character = p_character), 0);
  return greatest(allowed, held);
end $$;
alter table public.arma_cash drop column spent;
commit;
