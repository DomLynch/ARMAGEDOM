begin;
-- Removes the `corpseBag` key and its caps. A record that still carries the key is refused as 'shape:key:corpseBag' afterwards, so roll the game
-- release back first.
delete from public.arma_record_caps where path_pattern in ('corpseBag.cash', 'corpseBag.remaining');
delete from public.arma_record_keys where key = 'corpseBag';
commit;
