# Local end-to-end world proof (25 Oct 2026, Backend lane)

Run on the VPS against a throwaway Postgres 16 (port 55433, deleted after), the real writer and presence from a release bundle built on main fb532cf with a real `npm ci`, migrations 1-11 by the real apply-migrations.sh, and a local fake Supabase Auth with test tokens. No hosted project, no Frankendom, no real account. Repeat it with `bash ops/realtime/e2e-local.sh` (see the header).

Not covered here (Dom's two-phone test): a real Supabase sign-in, nginx/TLS, phone rendering, a verified account refused at the ws proven on hosted data.

```
== scratch cluster on 127.0.0.1:55433
== migrations (the real apply-migrations.sh)
  apply  20261024000011_arma_world_status.sql
migrations: 11 applied, 0 already applied
arma_writer password set from writer.env (as a SCRAM verifier; not shown)
PASS: ARMAGEDOM schema is applied and verified; everything is OFF (arma_enabled and arma_open_access are false).
== test accounts and the world switched ON (local database only)
== release bundle from this tree (npm ci)
built /mnt/HC_Volume_107195252/armagedom-backend/pge2e-armagedom/rel/e2e: 93 files, packages: pg, three
not activated: point 'current' at it only after the checks (see the install runbook)
== drive the world
  writer, presence and fake auth are up (all on 127.0.0.1)
== 0. the world is open to the test accounts
  ok 1 - status with a token: {"open":true,"allowed":true,"enabled":true}, Vary: Authorization
  ok 2 - anonymous status: {"open":true,"enabled":true}, public, max-age=30
  ok 3 - a forged token is a 401
  ok 4 - characters created: alice pc:0b48d1b517324ce9a4bb79ecafa4fe45, bob pc:3f388d98c2e14d1ab007a0ada4987310
== 1. two clients meet in Westminster
  ok 5 - welcome in westminster: alice Alice at (83, -517), bob Bob at (2407, 1180)
  ok 6 - each sees the other in the state broadcast
  ok 7 - bob moves 25 cm and alice sees it at (2432, 1180) in tick 6
== 2. save, reload, load_run
  ok 8 - save_run revision 1; load_run returns the same record (era 18)
== 3. a second device of the same account joins the same character
  ok 9 - device 2 gets active = pc:0b48d1b517324ce9a4bb79ecafa4fe45; the account still has 1 character
  ok 10 - device 2 loads the same record
== 4. forged cash is clamped by the server
  ok 11 - save claiming 1,000,000 carried + 1,000,000 bank: clamped=true, stored carried/bank = 0/0 (nothing was earned)
== 5. the world switch OFF
  ok 12 - status closed: anonymous {"open":true,"enabled":false}, alice {"open":true,"allowed":false,"enabled":false}
  ok 13 - a new connection from a verified account closes with 4003 and is never admitted
  ok 14 - a connection with no token is refused before the upgrade (HTTP 401)
  ok 15 - save_run while closed: HTTP 403 {"error":"O0007"}
  ok 16 - load_run while closed: HTTP 200 {"run":null}
  ok 17 - the database still holds revision 2: the halted save wrote nothing
ALL 17 CHECKS PASS
```
