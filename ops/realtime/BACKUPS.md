# ARMAGEDOM hosted database: what backup exists, and how to restore (checked 26 Oct 2026)

Project: Supabase `ARMAGEDOM`, ref `fdbqnupceqytizxnoiua`, eu-central-1, Postgres 17.11. Owner: org `Global-Digital-Assets's Org`.

## What exists today: nothing we can restore from

| Fact | Source |
|---|---|
| The organization is on the **Free** plan (`plan: free`). | Supabase MCP `get_organization`, 26 Oct 2026 (verified) |
| Daily backups cover Pro, Team and Enterprise only (Pro keeps 7 days). Free projects have none in the dashboard, and Supabase tells free projects to export their own data with `supabase db dump` and keep it off-site. | https://supabase.com/docs/guides/platform/backups |
| Point-in-Time Recovery is an add-on for Pro or above (7-day retention is about USD 100 a month, and it needs at least the Small compute add-on). | same page, and the PITR pricing page |
| Free projects can be paused after 7 days of low activity. | https://supabase.com/docs/guides/deployment/going-into-prod |

Not verified: the dashboard's Database > Backups page itself (no tool of ours can open it). The plan above is the evidence. **There is no repo or VPS job that dumps the database either** (no cron, no `/etc/armagedom/owner.env` on the VPS as of today).

## What is lost if the project is lost, and what is not

- Rebuildable from this repo: every table, function, policy and seeded rule row (`supabase/migrations/*`, applied in order by `ops/realtime/apply-migrations.sh`, which also records each file's sha256 in `arma_schema_migrations`), and the two live switches (`arma_enabled`, `arma_open_access`, and `enforce_cash`, which are listed in `drift-allow.json`).
- NOT rebuildable: every player. Guest accounts are rows in Supabase `auth.users` (anonymous users), and their characters, saved runs (`arma_runs`), events and locations are in `public.arma_*`. After a lost project the saves would survive only in the players' own browsers (the client keeps the run in local storage), and the guests' account ids would be new ones, so a server save could not be matched to them.

## Recommended (needs Dom's approval; nothing here is set up)

1. Cheapest sound option now: a nightly logical dump from the VPS, kept 14 days on the storage volume.
   - The VPS has `pg_dump` 16, and the server is Postgres 17, so install `postgresql-client-17` first (a 16 client refuses a 17 server).
   - It needs the project owner connection string in a root-only file (`/etc/armagedom/owner.env`, the same file `apply-migrations.sh` reads). Dom puts it there; no lane enters credentials.
   - Command shape: `pg_dump --no-owner --schema=public --schema=auth --format=custom "$OWNER_DATABASE_URL" > /mnt/HC_Volume_107195252/armagedom-backups/arma-$(date -u +%F).dump` (dump `auth` too, or guests cannot be restored), then delete dumps older than 14 days, and record the size and date. Supabase's own guide for this: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
   - The database is small today (free tier is 500 MB), so a dump is seconds and well inside the free egress.
2. Pro plan (USD 25 a month plus compute) gives 7 daily backups and a one-click restore; PITR on top is about USD 100 a month more. Scale-budget rule: paid Supabase is allowed once launch needs it; Dom decides.

## How to restore (once a dump exists)

1. Make a **new** Supabase project (a restore never goes over the live one first). Same region.
2. `pg_restore --no-owner --clean --if-exists --dbname "$NEW_OWNER_URL" arma-<date>.dump`
3. Recreate what a dump does not carry: the role passwords (`arma_writer`, `arma_drift_reader` are created by the migrations without or with out-of-band passwords; set `arma_writer`'s through `apply-migrations.sh`, Dom sets the drift reader's), and the Supabase Auth settings (anonymous sign-ins on, rate limits).
4. `bash ops/realtime/apply-migrations.sh --check` against the new project (every migration recorded with the right sha256, RLS on, no client write grants), and the drift check (`node ops/realtime/check-db-drift.mjs --hosted`).
5. Point `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the writer's `DATABASE_URL` at the new project, restart the writer and presence (Deploy), and keep `arma_enabled` false until the checks pass.

## If the plan changes

Pro or above: the dashboard restores a daily backup (or a PITR point) in place and the project is down while it runs; custom role passwords are not in a daily backup, so reset `arma_writer`'s and `arma_drift_reader`'s afterwards. Update this file with the plan, the retention and the date it was checked.
