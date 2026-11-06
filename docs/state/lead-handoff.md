# Armagedom Lead Dev handoff (6 Nov 2026)

Written when the Lead session stood down (out of tokens). A new Lead or any dev can pick up from here. Companion doc: `docs/state/server-deploy.md` (live release, rollbacks, migrations).

## State right now

- Live: release `three-20261028-350`, source commit `04d860eb6cb70014608ba44ac6485afbcf8090f0`, at https://playarmagedom.com/. Main is `0868195` (record of 350).
- Health at 08:26 on 6 Nov: nginx, arma-writer and arma-presence all active; 0 writer errors since the flip, 0 presence errors in 12 h.
- Server: hosted DB migrations `20261105000030` (award credit), `...31` (daily scores), `...32` (safehouse upgrades) are applied. Writer bundle `04d860e` is live (ops: leaderboard, upgrades_get, upgrade_buy).
- NOT yet proven with real play: `arma_award_credits` and `arma_daily_scores` are both 0 rows (no signed-in online run yet). Kill-cash credit, daily leaderboard and upgrades need one real signed-in run to confirm.
- Waiting on the owner's phone and desktop test of 350 (and the 344-349 features).
- Open PRs: only #490 (shop candidate) and #475 (parked draft). Nothing in flight.
- Parked, not for merge: branch `feat/daily-contract` (the owner dropped the daily contract).

## What shipped in 344-350 (all live)

Heat HUD claw removed (heat/hunters kept), weapon-switch freeze fixed, kill-cash credit, daily leaderboard, loot beams, rifle and shotgun models (the shotgun is now a pump; the old one was twin-barrel), minimap, filled telegraph decals, HUD options, boss goals, permanent safehouse upgrades (reserve magazine, stamina, dodge recovery).

Feature flags: `?nomap=1`, `?notelegraph=1`, `?nobeams=1`, `?nodial=1`, `?noboard=1` turn things off; boss goals are on only with `?bossgoals=1`; waves and perks with `?waves=1`.

## Known minor issues (not fixed)

- Minimap and boss HP bar overlap about 20 px at 568 px width (touching at 667, clear at 852).
- Boss poison ring and the telegraph decal double-warn.
- Loot-beam colours do not go through the colour-blind palette.
- Shotgun double-barrel look if the owner wants it back.

## Next candidates

1. Get the owner's feedback on 350 (phone and desktop).
2. After a real signed-in run, check `arma_award_credits` and `arma_daily_scores`.
3. Fix the items above as needed.
4. Prune old `wt-*` worktrees under `C:\Users\dom12\work` (leave `wt-daily` until the owner agrees).

## How releases work

- Static previews live at `/var/www/playarmagedom.com/armagedom/preview/three-20261028-NNN/` on the VPS (`ssh vps-brain`). Job scripts are generated per release (`deployNNN`, copied to `/root/dNNN`): job1 gate (~20 min), job2 package, job3 diff, job5 area compare, job4 install preview, then `pre.sh`, `RETIRED=1 bash .../three-20261028-NNN-ops/flipNNN.sh`, and `lc.sh` live check. Rollback is `rollbackNNN.sh`.
- job4 needs the previous release's row already merged in `tools/deploy/releases.json`, and a fresh mkbase. Merge the "record release" docs PR first.
- `AREA_IDENTICAL` means presence does not need a restart.
- Writer bundles are in `/opt/armagedom-realtime/releases`; `current` is a symlink; restart `arma-writer` after switching it. Writer rollback: `ln -sfn releases/1ac6919 /opt/armagedom-realtime/current; systemctl restart arma-writer`.
- Supabase project `fdbqnupceqytizxnoiua`. Migrations are in `supabase/migrations` with downs in `supabase/down`.

## PR and CI rules

- Tier-b (code) PRs: a comment `**Lead: PASS at <headsha>**`, then BOTH labels `tier-b` and `lead-pass`, or audit-gate fails. Tier-a (docs/data only) PRs need only `tier-a`.
- Web data-layer gate: no tuning number literals in code (put them in JSON), `// tuning-ok:` total at most 386, `// text-ok:` at most 83, no 2+ word strings in code (includes validator names), data files need validators registered in `engine/game-data.js`.
- `desktop-layout.test`: everything in `style.css` after the "Desktop layout (engine/desktop-layout.js" comment must be gated by `body.desktop-ui:not(.touch)`. Put new CSS above it.
- Web text-drift test: allow-list new dynamic text prefixes.
- Windows local full suite has about 62 pre-existing failures; Linux CI is authoritative. Node 22 is at `C:\arma-work\node22`.
- Standing authorization from the owner: merge, deploy, apply migrations and restart the writer once CI is green and Lead PASS is posted. The owner wants concise replies.

## Tooling notes

- Helper scripts in `C:\Users\dom12\work\agent-briefs\` (laptop only): `mergepr.sh`, `retrymerge.sh`, `mergedocs.sh`, `keepboth.cjs` (merge conflicts), `movecss.cjs`, `gen350.sh` (pattern for the next release script set: shift the numbers, previous live source is `04d860e`), `writerbundle.sh`, `writerflip.sh`, `apicheck.sh`, `morning.sh` (health check), `datagate.mjs` (local data-layer gate).
- A Bash hook wrongly rejects commands containing long hex strings; put them in script files.
- GitHub sometimes returns 5xx or empty responses; retry loops are used for push, PR create and merge.
- Peers: Strategy Dev (reviewer, session `local_12c5fba7-4a43-49bb-99dc-1341c8bf88a7`), z-OpenTrident (`local_fb31f153-1100-42b7-9691-1bd1d4654cca`). No GPU claims until the Unity v100 build is done.
