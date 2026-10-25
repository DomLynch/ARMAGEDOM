# Multiplayer: deploy plan for the writer and presence services

Backend lane, 24 Oct 2026. A plan and templates only: nothing here is installed, applied or started, and the hosted Supabase project has no
migrations. Deploy owns the nginx and host side and implements it; Lead gives the go; Dom places the secrets. Shape: one always-on world,
a shared link opens playarmagedom.com, Play, and you are in it.

## What runs

| Service | Unit | Binds | Talks to | Holds |
| --- | --- | --- | --- | --- |
| writer | `arma-writer.service` | 127.0.0.1:8891 | Postgres (role `arma_writer`), Supabase Auth (`/auth/v1/user`) | `DATABASE_URL`, the shared internal key |
| presence | `arma-presence.service` | 127.0.0.1:8894 | the writer on :8891, Supabase Auth | the shared internal key only; **no database credential** |

Browser path: `wss://playarmagedom.com/arma/ws` (presence) and `https://playarmagedom.com/arma/api/<op>` (writer client routes). The writer's
`/internal/*` and `/health` are never proxied. Each service is OFF unless its flag is set (`ARMA_WRITER=1`, `ARMA_PRESENCE=1`).
Ports 8891 and 8894 are free on the VPS (checked 25 Oct: 8787, 8788 and 8793 are Frankendom's; **8892 is taken** by a static preview server, `serve-immutable.mjs ... 8892`, so
presence moved to 8894 through `PRESENCE_PORT`).

## Install runbook (A5; Deploy owns nginx and `systemctl`, Backend owns the bundle and the env files)

Everything below is run on the VPS as root. No secret appears in a command line, a chat or the repo.
1. **Bundle** (`/opt/armagedom-realtime/releases/<name>`, immutable; `current` is a symlink Deploy flips): from the repo checkout,
   `(cd Web && node scripts/area-presence-rows.mjs /tmp/area.json)` then
   `node ops/realtime/build-release.mjs --out /opt/armagedom-realtime/releases --area-data /tmp/area.json --name <sha>`. It traces what the two entry points import,
   copies only that (plus `server/data/spawns.json`, `area-content.json`, the validated area data), pins `pg` and `three`, and writes a MANIFEST of sha256s. Then
   `ln -sfn releases/<name> /opt/armagedom-realtime/current`.
2. **Env files** (once): `sudo bash ops/realtime/make-env.sh --supabase-url https://<ref>.supabase.co --anon-key <publishable key> --pooler-host <host>` generates the
   writer password and `ARMA_INTERNAL_KEY` on the box, writes `writer.env` and `presence.env` (root:root 0600, flags OFF, presence port 8894) and
   `arma_writer.verifier.sql` (one `alter role ... password '<SCRAM verifier>'` statement). Apply that one statement to the project with the Supabase SQL tool.
   `sh ops/realtime/check-env.sh` then proves the files load under the units' own confinement without printing a value.
3. **Units**: install `arma-writer.service` and `arma-presence.service`, `systemctl daemon-reload`. They start with the flags OFF (the process exits 0, nothing listens).
4. **nginx** (Deploy): the example's per-IP limit zones in `conf.d/`, the three locations in the 443 block for `playarmagedom.com` (`/arma/api/` -> 8891, `/arma/ws` -> 8894).
5. **Flip**: set `ARMA_WRITER=1`, start the writer, `curl -s http://127.0.0.1:8891/health`; set `ARMA_PRESENCE=1`, start presence; health on loopback only. The hosted
   database stays `arma_enabled = false` until Lead's gate: services up does not mean the world is open.
6. **Kill**: `ARMA_*=0` + restart (or `systemctl stop`), or `touch /etc/armagedom/DISABLED` plus an nginx reload.

Verified on the VPS on 24 Oct (read-only): Node v22.23.2; system user `armagedom` (uid 983) exists; `/etc/nginx/sites-enabled/playarmagedom.conf`
exists with a 443 block for `playarmagedom.com` that ends in `location / { return 404; }`; `/etc/armagedom/` does not exist yet; Frankendom's
`frankendom-origins-writer`, `frankendom-presence` and duel relay units are running. Not verified: whether the site sits behind a CDN
(decides how per-IP limits see the client address, see the nginx example).

## Files and keys (names only; values are never in the repo, a chat or a note)

Dom places both files. Directory `/etc/armagedom/`, owner `root:root`, mode `0600` (systemd reads them as root before the service drops to
its own user, so they need no other reader).

`/etc/armagedom/writer.env`

| Name | What | From |
| --- | --- | --- |
| `ARMA_WRITER` | `1` | literal |
| `DATABASE_URL` | Postgres connection string for the role `arma_writer` (pooler) | Supabase dashboard; the role's password is set by Dom |
| `SUPABASE_URL` | `https://<ref>.supabase.co` (project `fdbqnupceqytizxnoiua`) | public value |
| `SUPABASE_ANON_KEY` | the publishable key, used only to ask who a token belongs to | public value |
| `ARMA_INTERNAL_KEY` | random, at least 32 bytes; shared with presence | `openssl rand -hex 32`, same value in both files |
| `ARMA_SPAWNS` | optional path to the spawn rows JSON | release bundle |

`/etc/armagedom/presence.env`

| Name | What |
| --- | --- |
| `ARMA_PRESENCE` | `1` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | same public values |
| `ARMA_INTERNAL_KEY` | the same value as in `writer.env` |
| `ARMA_AREA_DATA` | path to the area JSON World's generator writes (release bundle) |
| `PRESENCE_ORIGINS` | optional; default is only `https://playarmagedom.com` |

Roles: only `arma_writer` gets a password. `arma_presence` is created by the first migration with LOGIN but no password, so nobody can connect
as it; presence reaches the database through the writer.

### Putting the schema on the hosted project (one script, from the repo)

The migrations are applied from the repo, on the VPS, not retyped through a console: `ops/realtime/apply-migrations.sh`. It needs one more
root-only file, `/etc/armagedom/owner.env` (root:root 0600), holding the project's OWNER connection:

| Name | What |
| --- | --- |
| `OWNER_DATABASE_URL` | `postgres://postgres:<password>@<host>:<port>/postgres?sslmode=require`, from the Supabase dashboard (Connect); use the direct connection or the session-mode pooler (port 5432), NOT the transaction pooler (6543), because each migration is one multi-statement transaction; used only by this script, never by a service |

Two commands, in this order (both as root, from the release directory that holds `supabase/`):

```sh
bash ops/realtime/apply-migrations.sh --dry-run     # connects, lists what it would apply, changes nothing
bash ops/realtime/apply-migrations.sh               # applies, sets the arma_writer password, verifies, prints PASS or FAIL
```

What the real run does: applies `supabase/migrations/*.sql` in order with `psql -v ON_ERROR_STOP=1`; records each file's name and sha256 in
`public.arma_schema_migrations` (so a re-run applies nothing, and an applied file that was edited afterwards aborts the run); sets
`arma_writer`'s password from `writer.env` as a SCRAM-SHA-256 verifier computed in the script (the plaintext is never sent, printed or put on
a command line); then verifies in a READ ONLY transaction (`ops/realtime/verify-hosted.sql`): RLS on every arma table, no write privilege for
`anon`/`authenticated`, only `arma_me_allowed`/`arma_me_owns` callable by clients, the writer can call its twelve functions and not the
gate, and **both switches still false** (`arma_enabled`, `arma_open_access`). Everything stays OFF; the script never turns a switch on.
`--check` repeats the verification alone and changes nothing.

The script is tested against a throwaway Postgres 16 with its own data directory and port (`bash ops/realtime/test-apply.sh`, as root on the VPS):
18 checks, including a re-run being a no-op, an edited migration refused, no secret in the output, the SCRAM verifier accepting the real
password and refusing a wrong one, and each verification rule failing when its condition is broken.

**One command proves the files are right and readable by the units' own confinement**, without printing a value:

```sh
sh ops/realtime/check-env.sh        # as root on the VPS; or: check-env.sh writer | presence
```

It checks `root:root 0600`, then starts a transient unit that loads each file exactly as the real unit does (`EnvironmentFile`, `DynamicUser`,
`ProtectSystem=strict`) and prints `set (N chars)` or `MISSING` for every required name, then compares a hash of the internal key in both files.
Exit status is non-zero on any problem. (Tested 24 Oct on the VPS against fake files in a scratch directory: it reports a missing name, a wrong
mode, and a clean pass.)

## Release layout and rollback

- `/opt/armagedom-realtime/releases/<git-sha>/` holds the server code of one reviewed commit (exported with `git archive`, not the
  auto-following checkout in `/opt/armagedom`, which moves with main); `/opt/armagedom-realtime/current` is a symlink to the live release.
- Update: unpack the new release, `systemctl restart arma-writer arma-presence` after pointing `current` at it (writer first).
- Rollback: point `current` at the previous release and restart. The schema is rolled back separately with the `supabase/down/` files, only on
  Lead's word.
- Start order: writer, then presence. Presence starts fine without the writer (it counts failures and tells hitters), but nothing is stored.

## Safety and kill switches (fastest first)

1. nginx 503: `touch /etc/armagedom/DISABLED` plus the `if (-f ...)` line in the example, then `nginx -s reload`. Stops new traffic, leaves services up.
2. `systemctl stop arma-presence` (everyone is dropped from the world; what the client does then is Web's to define), then the writer.
3. Database: `update public.arma_config set value = 'false'::jsonb where key = 'arma_enabled'`. Every function refuses.
4. Unset the flag (`ARMA_PRESENCE` / `ARMA_WRITER`) in the env file and restart: the process prints "OFF" and exits without listening.

Never touched by this work: any Frankendom unit, file, port (8787, 8788, 8793), `/etc/frankendom`, its database or keys. Names are
ARMAGEDOM-only: `arma-*` units, `/etc/armagedom`, `/opt/armagedom-realtime`.

## Abuse and capacity

- nginx limits the **writer and socket paths** only: 10 requests/s per IP (burst 20) on `/arma/api/`, 4 sockets per IP on `/arma/ws`.
  Presence also limits itself: 40 messages/s per socket, 512-byte messages, one socket per account (a reconnect replaces the old one).
- **Guest sign-up abuse is not stopped by our nginx**: anonymous sign-in goes from the browser straight to Supabase. Supabase's own rate limits
  and its captcha (hCaptcha/Turnstile) are the control; the captcha is a must-have before the open-access flag goes public.
- Presence and the writer are single processes on one VPS. Layers of about 9 per zone are later work: today there is one layer per area.
- Free Supabase plan: the hit batch is one transaction per 100 ms tick only while someone is fighting; locations are one write per player per
  5 s at most. Measure latency and connection use on the first real session before raising anything.

## What must change in code before the first real install

1. **A release bundle step.** `server/presence/caps.js` imports Combat's `world-events.js`, which pulls in the game (three.js). The service must
   not need the Web tree at run time. Add a build step that writes one JSON from the real data (area data with its version, weapon caps with the
   progression ceiling, spawn rows) into the release, and have the services read only that.
2. **`server/package.json`** with `pg` pinned and a lockfile (the writer imports `pg` but no package file lists it yet), and `npm ci --omit=dev`
   in the release step.
3. **`/health` on presence** (the writer has one) so Deploy's check has something to call; counters only, no account ids.
4. **Seed rows**: `arma_weapon_rules` from the loader (a migration), `arma_loot_rules` from Combat's single-player tables (waiting on Combat).
5. **Guest access**: a migration that auto-grants `arma_access` on first call under a flag (open access), and Supabase anonymous sign-ins switched on.
6. **Apply the migrations** (`20261024000001`, `20261024000002`, `20261024000003`) to the hosted project, with Lead's go and Dom's secrets.

## Order of work

Dom places the two env files, then Lead says go for the migrations. Backend applies nothing itself (it holds no keys). Deploy installs the units
and the nginx locations from `ops/realtime/`, runs `check-env.sh`, starts the writer, then presence, and checks `/health` and one real
`wss` connection from a phone on the real origin before anyone else is invited.
