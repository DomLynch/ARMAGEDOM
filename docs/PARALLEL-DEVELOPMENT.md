# Parallel development — 2026-10-03

Owner authorised isolated checkouts for concurrent development. Keep Git and the
existing Unity project; no new version-control service or infrastructure.

## Checkouts and ownership

Canonical root: `/Users/domininclynch/Desktop/Business/ARMAGEDOM`.

| Checkout relative to canonical root | Branch | Owner |
| --- | --- | --- |
| `.` | `main` | Lead integration, currently running sword test/build |
| `.worktrees/lead` | `codex/armagedom-lead` | Lead's next combat/gameplay edits |
| `.worktrees/world` | `codex/armagedom-world` | World camera/layout/collision work |
| `.worktrees/character` | `codex/armagedom-character` | Main Char art/import work |

Strategy maintains shared scope documents in canonical. Deploy packages only the
accepted integration revision. No additional permanent chats are needed. Existing
chat working directories are not automatically moved: use the assigned absolute
checkout as every command's working directory and resolve files there.

Lead finishes the already-running sword gate/build in canonical without migration.
World can code in its isolated checkout immediately after setup handoff. Character
uses its checkout for the next approved asset change. Lead uses its lane after
this in-flight delivery. Before starting a lane, compare its baseline with any
subsequent canonical fixes; transfer required fixes explicitly, never sync blindly.

## Private starting snapshot

`refs/heads/codex/armagedom-parallel-baseline` preserves current working game inputs
and required test fixtures. This is a LOCAL DEVELOPMENT SNAPSHOT, not a release or
proof of acceptance. `artifacts/parallel-development/setup.json` records its SHA,
included files and checks. Main's HEAD, staging area and running game inputs are
preserved. Generated temporary test scenes, Unity caches and build copies are
excluded. Historical tracked files remain inherited from the original commit.

No automatic merge, push or public release. Do not merge/push the baseline branch
wholesale: it contains previously uncommitted development work. Lane branches
start clean from it, so their subsequent diffs isolate only each lane's work.

## Daily workflow

1. Work only in your assigned checkout. Keep `.meta` files with assets. Make small
   local commits listing the exact files changed; do not stage unrelated output.
2. World owns London camera/travel/layout and its tests; Lead owns combat/input/
   damage/HUD and its tests; Character owns vagrant assets/importer. Agree before
   changing another lane's files, shared scenes or project/package settings.
3. Hand Lead your branch, commit, base SHA, changed paths and validation receipts.
   A pure data/asset handoff is also allowed; pin hashes and include metadata.
4. Lead reviews the lane-only change, not the private starting snapshot. For this
   initially dirty canonical checkout, export a binary patch from the recorded
   starting SHA to the lane commit, run `git apply --check` in canonical, and apply
   only at a quiet integration checkpoint. Inspect conflicts instead of forcing
   overwrites. Never copy whole source folders back or reset canonical work.
5. Validate the integrated revision once, record native evidence separately, and
   let Deploy package that exact accepted build. Commit/publish only the scoped
   accepted change under the existing release process.

After canonical work is properly committed, lanes can use normal branch merges
or cherry-picks with Lead as integration owner. Updating a lane's base is a
deliberate checkpoint; keep uncommitted lane work safe and record the new base.

## Unity and machine resources

Parallel coding/art preparation is enabled. Separate checkouts have separate
Assets, ProjectSettings, Packages, test outputs and eventually Library/Temp/Logs.
Never symlink or share mutable Unity caches. Do not open two Editors on one path.
Every Unity command must pass `--project-path` with that lane's absolute `Game`
path. Build output and receipts belong to that lane, not canonical by accident.

On this 24 GB Mac, retain one heavy Unity import/test/build job at a time by default.
Record owner/project/job in the shared coordination note and release at completion.
Other lanes continue coding while it runs. Multiple Editors are possible only
after checking available memory/disk and licensing, not automatically launched by
this setup. At setup the disk had approximately 24 GB free; caches are intentionally
not copied. Suitable offline art jobs may use the already approved HF CPU workflow.

Startup/import and Unity tests must run in an allocated slot before claiming a
lane is Editor-validated. Source/hash and isolated-Git checks establish isolation,
not that an unimported checkout has passed its game tests.

## Shared context

All lanes use the canonical PROJECT_STATE.md for integrated status and the single
shared note `/Users/domininclynch/Desktop/Business/Vibe Coding Management/codex-state/armagedom.md`.
Checkout copies may lag. Record lane-specific work with its branch/commit and keep
release claims tied to canonical evidence. Existing scope/compute rules still apply.
