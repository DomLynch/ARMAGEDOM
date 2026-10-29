# Server & Deploy lane: handover (29 Oct 2026, paused on Dom's order)

## Now
- PAUSED. Nothing in flight on the VPS. Live = 330 (main cfd2eda04cf600fa94e8d1b7d313bfb9f0c79940), rollback 329, rollback floor 323 (LMG saves are one-way: a rollback below 323 forfeits them). Writer bundle 1ac6919, presence bundle a505657 (layout f5d9d528780ea92d), neither restarted since 28 Oct.
- Preview-only three-20261028-491 (PR #490 head 360ba67d, shop only) is still served. Delete it when Lead says (recipe below).
- Draft PR #503 (branch server/verify-hosted-drift-economy): verify-hosted.sql, drift coverage, drift-allow. Waits for CI + Lead PASS; migration 27 is then applied on hosted by Lead (Deploy never writes hosted).

## Done today (28-29 Oct)
- Cut and flipped 324 to 330 (client only; each: gate, area compare, package, preview install, boot loads, flip, layout, curls). Added /armagedom/version.json (302 to the live release.json; rollback: cp /root/playarmagedom.conf.pre-version-json back to /etc/nginx/sites-available/playarmagedom.conf, nginx -t, reload).
- Preview-only builds 490 (deleted) and 491 (up). Disk audit answer sent to Hooks Dev.
- PR #503: verify-hosted.sql lists the real 22 writer functions, presence's 3 and 12 internal helpers, reports the switches instead of requiring them closed; new verify-hosted.test.mjs; migration 20261029000027 (+down) lets arma_drift_reader read arma_items, arma_loot_table, arma_kill_tiers, arma_pickup_rules, arma_shop_stock; drift-allow seededTables + enforce_cash text (hosted reads true per Lead, not re-read by Deploy).

## Open
1. Platform plan STEP 0 (Strategy, Dom confirmed; I own steps 0, 2, 3 of "games-platform", two games on one platform). BLOCKED on Dom placing /root/.armagedom/db-url on the VPS (root:root, dir 700, file 600, one line = Postgres connection string, read-only role if possible; also /root/.armagedom/storage-key for Storage files, or Dom exports them). Checklist when it exists: pg_dump to /mnt/armagedom-backups/pgdump-<date>/ (5TB box, ~2T free); restore into a local Postgres 16 on the VPS (pg_dump/psql 16 are installed); compare row counts per table; copy Storage separately; reconcile hosted migration history vs supabase/migrations (arma_schema_migrations registry); state the plan tier; RLS receipt (cross-table access blocked); then make it a repeatable script (audit item 3). The script reads the file inside, never echoes it, never in argv/chat/PR.
2. STEP 2 starts on the verified-restore receipt: games-platform repo, identity package, migrations COPIED, V1 Google auth UI ported; ARMAGEDOM repo changes additive, feature-flagged, Auditor PASS; no auth cut-over before Dom's phone pass. STEP 3: market engine with game_id and separate ledgers (local Postgres from the dump in CI, no spend).
3. #503 to merge; Lead applies migration 27 on hosted BEFORE the next hosted drift run (else the 5 tables show missing grants).
4. Owed: receipt sections 324-330 in side-session-notes/local_ade728d1.../deploy-publication-receipt-282-286.md; real-token claim/buy smoke (needs a test token Dom authorizes); disk-plan deletions (Strategy + Dom go).

## Gotchas
- Heavy runs (suites, builds) go to hfjob or CI now; the VPS only serves and deploys. VPS cuts ran the gate there while load was under 20; if load is high use hfjob.
- Cut recipe lives in /mnt/HC_Volume_107195252: cutNNN.sh + mkNNN.py (copy the last pair, shift numbers; constants PSHA = parent source sha, parent package sha), run in the background with nohup; preview-only builds use prev49x.sh/mk49x.py and the fake release number never becomes a real cut. Prune plain deploy(N-2) at each cut.
- Layout gate: arma-presence's journal line was vacuumed; use `check-presence-layout.mjs --release /opt/armagedom-realtime/releases/a505657 --line "presence listening on x, layout f5d9d528780ea92d" --tree`.
- Never touch nginx snippets during a flip (promote-root asserts unrelated nginx unchanged). Endpoints: /arma/api/status (200), /arma/api/save_run (401). Hooks block Bash heredocs/sed: write files with Write, scp them.
- Version names keep the three-20261028-NNN prefix (scripts chain on it) even though Lead's manifest says 20261029 from 327 on; sourceCommit via /armagedom/version.json is the receipt.
