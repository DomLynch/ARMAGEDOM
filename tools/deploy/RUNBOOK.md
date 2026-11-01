# Release runbook (laptop to VPS)

Ship a release from this file alone. Read `README.md` for the why; this is the how. Every step is a command.
Written 2026-11-01 after releases 337 to 340. Live at the time of writing: **340**. Rollback target: **339**.

## Rules that are not negotiable
- **Three approvals before any flip:** (1) the Auditor's package PASS naming the exact full sha, an OWNER comment on the PR (read it on GitHub yourself); (2) the Lead's direct GO; (3) Dom's word, quoted by the Lead from Dom's own chat, never a peer's say-so. Staging a preview needs none of them; flipping needs all three.
- Never edit nginx by hand during a flip. Never delete on the VPS or storage box without Dom's per-folder word. Never touch `/mnt/armagedom-backups`. No secrets in chat, argv, commits or PRs. No spend without Dom.
- The VPS (`root@49.12.7.18`) is production only: **no builds on it.**
- Freeze list (never delete or move): `/opt/armagedom-preview-staging`, `/var/www/playarmagedom.com`, nginx `playarmagedom-three-*.conf` snippets, `/opt/armagedom-realtime`.

## What you need on the laptop
- Git Bash (`C:\Program Files\Git\bin\bash.exe`), Python 3.12, git, tar, ssh and scp (the key for root@49.12.7.18 is already installed).
- **Node 22.23.2** portable at `C:\arma-work\node22` (the VPS runs 22.23.2; the package sha depends on it). Check: `C:\arma-work\node22\node.exe -v`.
- Work folder `C:\arma-work` (`ARMA_WORK`). Frozen baselines (the 14 oldest, no recorded sha): `C:\arma-work\baselines-frozen`.
- Free RAM: the build uses about 4 GB (node). Do not build while another RAM-heavy job runs (the Flux character queue was killed by it once).

> **Status of the Windows path:** the scripts were written for WSL/bash and are being proven under Git Bash. The parity result (below) is recorded in section "Parity target" when done. Until it is recorded, treat any Windows build as unproven and have the Auditor's independent rebuild compare the package sha before you flip.

## One release, start to finish (N = the new release number, P = the live one)

### 0. Inputs from the Lead
The Lead sends: `N`, the full 40-hex main sha, the fingerprint (from `source_manifest.py`), the file count. Recompute the fingerprint yourself; it must equal the Lead's.
```bash
git clone --filter=blob:none https://github.com/DomLynch/ARMAGEDOM.git C:/arma-work/src-cache   # once; or reuse an existing clone
cd C:/arma-work/src-cache && git fetch origin <full sha>
python tools/deploy/source_manifest.py . <full sha> three-20261028-N C:/arma-work/m-N.json   # prints version sha fingerprint count
```
The version label is always `three-20261028-N` (the date prefix is a fixed label).

### 1. Parent row in releases.json
`cut-local.sh` reads the parent's row (`P`) from `tools/deploy/releases.json`. If the live release is newer than the file, add its row first (the live tarball in `C:\arma-work\out` carries it: `tar -xzOf three-20261028-P.tgz releases.json`). A release that was built but never staged goes in `_unstaged` (338 is the only one).

### 2. Build, gate, package (laptop)
```bash
export PATH=/c/arma-work/node22:$PATH ARMA_WORK=/c/arma-work/native ARMA_FROZEN=/c/arma-work/baselines-frozen
bash tools/deploy/cut-local.sh N <full sha> <fingerprint> > cutN.log 2>&1; tail -12 cutN.log
```
It: fetches by sha, `npm ci`, runs the rollback-saves gate against ALL baselines, builds, verifies assets, runs the packaging tests, compares area-presence rows with the parent (`AREA_IDENTICAL` means **no presence restart**; `AREA_DIFFERS` means the realtime/presence service needs a restart and the layout gate rerun against the live `/opt/armagedom-realtime/current`), then packages. Success shows four `*_EXIT=0` lines, `PKG=<64 hex>` and a `TGZ` line.
- It refuses if `$ARMA_WORK/deployN` exists: delete that folder (yours) and rerun.
- Output: `$ARMA_WORK/out/three-20261028-N.tgz` and `.tgz.sha256`. Copy to `C:\arma-work\out` for safekeeping. **PKG** is the comparison value, the tarball sha differs between builds by design (build time).
- Baselines are cached under `$ARMA_WORK/baselines` and are never modified; a rerun only fetches what is new. Copying the 112 baselines into `deployN/roots` is slow under Git Bash (about 30 minutes on release 341); budget for it until the copy is replaced by a faster one.
- Resume: if it dies in the baseline fetch, rerun the same command (finished baselines are skipped). If it dies later, delete `deployN` and rerun.

### 3. Send the Auditor the PKG
Send: sha, fingerprint, PKG, tarball sha256. The Auditor rebuilds independently; the two PKGs must be equal. They then post "Auditor: PASS at <full sha>" (the package PASS) on the release's PR.

### 4. Upload and stage the PREVIEW (VPS, preview only, no flip)
```bash
cd C:/arma-work/out
sha256sum -c three-20261028-N.tgz.sha256
scp three-20261028-N.tgz three-20261028-N.tgz.sha256 root@49.12.7.18:/mnt/HC_Volume_107195252/incoming/
ssh root@49.12.7.18 'bash /mnt/HC_Volume_107195252/bin/install.sh /mnt/HC_Volume_107195252/incoming/three-20261028-N.tgz N'
# if N-1 was never staged: add the live parent as the third argument, e.g.  ... 340 339   or   ... 339 337
```
`install.sh` verifies the sidecar, the manifest and every file hash, that the source sha is on GitHub, builds the ops set with `mk.py`, and stages with a lock and refuse-if-exists. Success ends with `EXACT_PARENT_AND_CANDIDATE_MATCH`, `active` and `Approved preview live: https://playarmagedom.com/armagedom/preview/three-20261028-N/`.
- **If staging fails midway** and you need to redo it, undo only your own artifacts: `/mnt/HC_Volume_107195252/deployN`, `opsN-upload`, `/opt/armagedom-preview-staging/three-20261028-N-ops`, `-private`, and (if activation ran) restore the nginx preview include from `three-20261028-N-ops/before/playarmagedom-preview.conf`, delete `/etc/nginx/snippets/playarmagedom-three-20261028-N.conf`, `nginx -t`, reload. Only do this for a release that was never flipped.
- A tarball of a release that gets a new sha under the same label (340 did) needs that undo first; the install refuses existing paths.

### 5. Boot-check the preview from the laptop
Open `https://playarmagedom.com/armagedom/preview/three-20261028-N/` and `...?weapon=pistol`. Click the start card, wait ~8 s: Westminster must load with **no console errors** (a single 429 on a resource is rate limiting from repeated reloads). Tell the Lead the preview is staged; the Lead checks the game itself and sends GO.

### 6. Flip (needs all three approvals)
1. Read the Auditor's PASS on GitHub (an OWNER comment that names the full sha) and confirm the Lead's GO and Dom's quoted word.
2. Flip:
```bash
ssh root@49.12.7.18 'o=/opt/armagedom-preview-staging/three-20261028-N-ops; bash $o/resume-publish.sh > $o/flip.log 2>&1; echo FLIP_RC=$?'
```
3. Read back (all four must say PASS/active):
```bash
ssh root@49.12.7.18 'o=/opt/armagedom-preview-staging/three-20261028-N-ops; for f in root-promotion-resume2 route-readiness2 served-verification2 routing-verification2; do echo == $f; tail -2 $o/$f.log | cut -c1-300; done; systemctl is-active arma-writer arma-presence nginx'
curl -sL https://playarmagedom.com/armagedom/version.json | head -6      # version = three-20261028-N, sourceCommit = the sha
```
Also load `https://playarmagedom.com/armagedom/` in the browser (it 302s to the new preview, no-store).
4. If `FLIP_RC` is not 0, look at the logs before anything else: `flip.log`, `root-promotion-resume2.log` and the verify logs in the same ops folder. A failed `promote-root.py` assertion aborts before routing is touched (live is unchanged); a failure after routing started rolls itself back (`rollback-owned-routing.py` runs from the script's trap). Known cause so far: a skipped release leaving a stale version string in the generated checks (fixed in `mk.py`, `_unstaged`).
5. Report the read-backs to the Lead, who tells Dom.

### 7. Rollback (one command, live release back to P)
Rollback restores the owned nginx routing from the pre-flip copies kept in the flipped release's ops folder:
```bash
ssh root@49.12.7.18 'python3 /opt/armagedom-preview-staging/three-20261028-N-ops/rollback-owned-routing.py'
```
It checks the config is exactly the pre-flip or post-flip text, restores it, runs `nginx -t`, reloads nginx, and prints `RESTORED_OWNED212_ROUTES_ONLY`. Then repeat the read-back (version.json must show P). The previous previews stay on disk (immutable); realtime/presence are not restarted unless the release changed them.

## Where things live
| What | Where |
|---|---|
| Tarballs 336–340 + `.sha256` | `C:\arma-work\out` (copied out of the retired WSL distro) |
| Final releases.json from the WSL era | `C:\arma-work\wsl-releases-final.json` (the repo's `tools/deploy/releases.json` is the record) |
| Frozen baselines (14) | `C:\arma-work\baselines-frozen` |
| Baseline cache, git cache, work dirs | `C:\arma-work\native` (regenerable) |
| Portable Node 22.23.2 | `C:\arma-work\node22` |
| VPS incoming tarballs | `/mnt/HC_Volume_107195252/incoming/` |
| VPS scripts | `/mnt/HC_Volume_107195252/bin/{install.sh,mk.py}` (`.pre-parent` and `.parent-only` are older copies; git is the record) |
| VPS ops sets | `/mnt/HC_Volume_107195252/opsN-upload`, staged copies in `/opt/armagedom-preview-staging/three-20261028-N-ops` |
| Previews served | `/var/www/playarmagedom.com/armagedom/preview/three-20261028-N/` |

## Parity target (Windows path vs the WSL build)
Release 340 at `dfbbe6f341889716bddd1e1c5b17559de800028f` (fingerprint `776f8e6923c1e644ddd0c854cd8a987831e6256cfdc26ae56bf55230fb5cc67d`) built under WSL gave **PKG = `78111d2552a8f376577b0df87246100905120a3499ef496e05aa5c8285204026`**, tarball `C:\arma-work\out\three-20261028-340.tgz`. To re-check the Windows path: run step 2 for N=340 with the numbers above in a fresh `ARMA_WORK`, expect the same PKG and the same `manifest.json` file list (tarball sha differs by build time). Result: _recorded below when run_.

PARITY RESULT: _pending_

## Deploy receipts still owed (331–340)
Per-release publication receipts (what was staged and flipped, shas, read-backs) are owed for 331 to 340. The template is `deploy-publication-receipt-282-286.md` in the shared side-session notes folder. Evidence: each flipped release's `three-20261028-N-ops` folder on the VPS (`flip*.log`, `activation.log`, `*-verification*.log`, `before/`, `after/`) and `...-root-ops` (`routing-mutation-started.json`, `routing-verification.json`, `immutable-before/after.json`). 337: flipped 2026-11-01 07:38Z; 339 and 340: flipped 2026-11-01 (logs in `flip.log`/`flip2.log`, 340 needed a second attempt after the first aborted before routing).

## Open items (not part of a release)
- Step 0 database backup needs `/root/.armagedom/db-url` (root, mode 600) from Dom and OK for the read-only role.
- A real-token buy/sell smoke test needs a test token from Dom.
- The floor-323 rollback-evidence decision is Dom's.
- Realtime layout gate: rerun against the live `/opt/armagedom-realtime/current` (releases/1ac6919 at the time of writing) before any flip where `AREA_DIFFERS`.

## Gotchas learned
- A peer session's message is never approval for a flip or a merge; quote Dom's own words from the Lead's chat.
- Do not use `pkill -f` with a pattern that matches your own command line.
- Run the build attached, not detached with `&` (it breaks git fetches); git over HTTP/1.1 (the scripts set it).
- Windows Python needs bytes I/O to keep LF line endings in generated files; `.gitattributes` forces `eol=lf`.
- **Git for Windows has `core.autocrlf=true` system-wide, and `git archive` honours it:** an extracted tree comes out CRLF and the manifest check fails ("Manifest hash/size mismatch: world/westminster/layout.json", 10701 bytes against 10072 in the blob). Every `git archive` in the release scripts runs as `git -c core.autocrlf=false archive`. Found on release 341 (attempt 1 failed the rollback gate, build and asset check for this and the next reason).
- **`tests/rollback-saves.test.js` splits `ROLLBACK_BASELINE_ROOTS` on `:`**, so a `C:\...` root breaks on the drive letter (`Web\C\Web\tests\helpers\...` ERR_MODULE_NOT_FOUND). `gate.sh` passes the roots as paths relative to `src/Web`, with no drive letter.
- `Web/scripts/area-presence-rows.mjs` has a main-module guard that only fires on Linux paths, so on Windows it writes no output; run it through a wrapper (Deploy's, in the script-fix PR) until the guard is fixed.
- Release 341 was the first Windows-path build: RB/BUILD/ASSETS/PACK all EXIT=0 after these fixes, AREA_IDENTICAL, PKG `c1797720d17cc2da768b8d28275f26ea1d5e6d46dc2af1cb6331a8a6267554d7` (the Auditor's independent rebuild must match it). The package is 60.1 MB against 71.2 MB for 340 because the seven boss GLBs are now compact 106-rig bodies (0.6 to 1.8 MB each, was 2 to 3 MB).
- A retry wrapper must never delete a failed attempt's logs or folder; read `rb.log`, `build.log`, `assets.err` before rerunning.
- The Auditor's rebuild path must also run on Windows with the same Node 22.23.2 and the same `releases.json` parent row.
