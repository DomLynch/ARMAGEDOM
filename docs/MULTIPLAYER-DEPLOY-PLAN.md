# Multiplayer: deploy plan for the writer and presence services

Backend lane, 24 Oct 2026. A plan and templates only: nothing here is installed, applied or started, and the hosted Supabase project has no
migrations. Deploy owns the nginx and host side and implements it; Lead gives the go; Dom places the secrets. Shape: one always-on world,
a shared link opens playarmagedom.com, Play, and you are in it.

## What runs

| Service | Unit | Binds | Talks to | Holds |
| --- | --- | --- | --- | --- |
| writer | `arma-writer.service` | 127.0.0.1:8891 | Postgres (role `arma_writer`), Supabase Auth (`/auth/v1/user`) | `DATABASE_URL`, the shared internal key |
| presence | `arma-presence.service` | 127.0.0.1:8892 | the writer on :8891, Supabase Auth | the shared internal key only; **no database credential** |

Browser path: `wss://playarmagedom.com/arma/ws` (presence) and `https://playarmagedom.com/arma/api/<op>` (writer client routes). The writer's
`/internal/*` and `/health` are never proxied. Each service is OFF unless its flag is set (`ARMA_WRITER=1`, `ARMA_PRESENCE=1`).
Ports 8891 and 8892 are free on the VPS (checked 24 Oct: only 8787, 8788 and 8793, which are Frankendom's, listen).

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

Roles: only `arma_writer` needs a password. `arma_presence` exists for later and stays `NOLOGIN`; presence reaches the database through the writer.

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
