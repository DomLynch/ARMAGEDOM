# ARMAGEDOM account/save foundation

Prototype only, optional to the game. No Web integration, deployment, donor
state, server-authoritative rewards or MMO simulation. Lead owns Web and SDK
installation there; this directory never imports Web or starts Unity.

## Contract

Inject an ARMAGEDOM-only `supabase-js` client into `createPersistence(client)`.
Omit the client to disable account features; guest gameplay must always start
independently. Call `refreshAccount()` before account operations. The adapter
observes auth events, clears its account/save/draft state on account changes,
rejects old in-flight responses, and immediately disables writes on logout even
if remote sign-out fails. Caller must clear any rendered account state on an auth
event and must not use a global/localStorage save or silently import guest state.
`dispose()` releases the auth subscription at teardown. No email or token stored
by the adapter. Configure email OTP token template and use requestOtp/verifyOtp;
OTP delivery and browser auth UX are not validated here.

Methods: requestOtp(email), verifyOtp(email,token), signOut(), refreshAccount(),
getProfile(), saveProfile(displayName), loadCharacter(),
saveCharacter(expectedRevision,payload), state(), dispose(). Data methods return
`{status,data?}`. Status: ok, disabled, signed_out, validation, unsupported_schema,
conflict_or_unavailable, account_changed, network. No raw SDK errors/credentials
are exposed. `state()` is a copy, never a mutable game-state object.

Two private RLS tables, one character slot/account. `schema_version=1` is distinct
from server-owned positive `revision` and `updated_at`. Trust is always
`unvalidated_prototype`; database validation checks shape, never gameplay truth.
Payload has exactly character (bounded identifier), area (westminster/east/south),
equipment (up to16 bounded identifiers). These are persisted prototype choices,
not owned/earned rewards. No currency, XP, loot or rank fields. Equipment identifiers
still need the Lead's eventual authored manifest validation before gameplay use;
never interpret client saves as entitlement. Current world IDs require an explicit
Lead mapping to these stable save IDs.

Revision0 means first INSERT, otherwise UPDATE WHERE owner+expected revision;
trigger increments server revision, constrained column grants protect metadata.
Unique insert race or zero returned rows is conflict/unavailable, never success.
Reload on conflict and ask for explicit retry; no auto upsert/last-write-wins.
Draft remains in memory on conflict/outage, cleared on account switch/logout.
Do not start overlapping save/load calls in the UI; serialize per account.

Private profiles use INSERT then display-name-only UPDATE on unique conflict;
identity cannot be updated. Permanent signed-in users only; anonymous auth users
and unauthenticated requests have no data access. No views, storage, privileged
RPC, service keys, public player directory or auth-user creation trigger.

## Checks and receipts

From Backend/: `npm ci --ignore-scripts`, `npm test`, `npm run test:database`.
SDK test dependency is pinned2.117.2 with lockfile. Schema migration filename was
created with Supabase CLI2.119.0; CLI is not required by these tests.

Database runner requires PostgreSQL17 executables (set ARMAGEDOM_PG_BIN if needed).
It creates and stops a disposable local Postgres instance in a private temporary
folder, UNIX socket only/no TCP listener. Tests execute actual SQL under anon and
authenticated roles, including A/B reads/writes, spoofed ownership, metadata
protection, malformed payloads, initial/concurrent revision races, account cascade,
rollback and reapply. Minimal auth.users/auth.uid/auth.jwt fixtures supply identity.
This is real Postgres RLS/grant/CAS/rollback evidence; it does NOT test Supabase JWT
signature verification, Auth mail/session delivery, PostgREST or project advisors.
The runner fails instead of silently skipping if PostgreSQL is unavailable.

`npm run test:api` exercises real Supabase Auth/REST and this SDK adapter, requiring
an already-authorised dedicated dev endpoint with the migration applied and TWO
existing disposable permanent email/password accounts with no saved character:

- ARMAGEDOM_TEST_DEDICATED_DEV=1
- ARMAGEDOM_TEST_DEV_URL
- ARMAGEDOM_TEST_DEV_PROJECT_REF (for hosted dev; unnecessary for localhost)
- ARMAGEDOM_TEST_PUBLISHABLE_KEY (publishable or legacy anon only)
- ARMAGEDOM_TEST_A_EMAIL / ARMAGEDOM_TEST_A_PASSWORD
- ARMAGEDOM_TEST_B_EMAIL / ARMAGEDOM_TEST_B_PASSWORD

Supply through a private environment; never commit/print these values. Known donor
projects are explicitly refused. This script never creates accounts, uses admin
keys, or applies schema; it leaves test rows in the two disposable accounts.
Reset dedicated dev fixtures before another run. Missing env exits2 NOT RUN.
Successful API tests still do not prove OTP mail delivery or physical-phone UX.

## Apply/rollback and outstanding gate

No dedicated ARMAGEDOM Supabase stack/project was visible at intake. No hosted
project provisioned, remote migration applied, donor DB queried, or VM started.
Lead must identify a dedicated local/dev stack and authorize the exact target.
For local iteration use Supabase CLI db query (discover help/version first), then
advisors and migration-history verification per the Supabase skill. The prepared
migration is under supabase/migrations; do not silently apply to production.
After applying to a real dev stack run test:api and security/performance advisors,
fix findings, and verify the project's actual exposed-schema/column-grant behavior.

Rollback: export any needed dedicated dev rows first, then run sql/rollback.sql
against the exact dedicated dev target. It destroys only these two tables and
helpers; leaves auth.users and all other schemas alone. Reapply migration restores
empty tables, NOT exported saves. Restore exported data separately if required.
In Supabase migration history use a new CLI-generated reversal migration rather
than deleting an already-applied migration. Development API/advisors/real-stack
rollback, OTP mail, Web integration and guest/account-switch browser acceptance
remain unvalidated. Prototype saves must remain isolated from future reward authority.

Docs checked2026-10-04:
- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/local-development
