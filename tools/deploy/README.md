# Release path (from 2026-11-01)

**VPS builds are retired.** The VPS is production only. A release is built, gated and packaged on the laptop, uploaded as one tarball and staged as an immutable PREVIEW. The flip is a separate step that needs the Auditor's PASS naming the exact sha, Lead's direct GO and Dom's word.

Constants are data, not code: `releases.json` (version, source sha, fingerprint, releaseSHA per release) and `baselines.txt` (rollback baseline name to source sha). Nothing is edited per release.

## The five commands
1. Laptop (Windows, Git Bash, portable Node 22.23.2 in C:/arma-work/node22; WSL is retired): `bash tools/deploy/cut-local.sh N <full sha> <fingerprint>`
   (fresh checkout by sha, `npm ci`, rollback-saves gate against ALL frozen baselines, build, assets, packaging tests, area-presence compare, `package_preview.py`, then `three-<date>-N.tgz` and `.tgz.sha256` in `$ARMA_WORK/out`).
2. Upload: `scp three-<date>-N.tgz* root@49.12.7.18:/mnt/HC_Volume_107195252/incoming/`
3. VPS: `bash install.sh /mnt/HC_Volume_107195252/incoming/three-<date>-N.tgz N`
   (verifies sidecar sha256, manifest and every file hash, that the release row matches, that the source commit is fetchable from origin; generates the ops set with `mk.py`; stages the preview with flock, refuse-if-exists, verify-parent, staging dir then activation; no flip, no reload during a flip).
4. Boot-check the preview from the laptop (`?weapon=pistol` too; both must show `"errors": []`). Auditor rebuilds the same sha; the release.json sha must match.
5. Flip (unchanged, only with the three approvals above): `resume-publish.sh` in the ops folder, then the read-backs and layout gate.

## Files
- `releases.json`, `baselines.txt`: data rows. The frozen baselines `deploy226-b224` .. `deploy238-b237` have no recorded sha and are copied once from the VPS into `C:\arma-work\baselines-frozen` (read by `prep-baselines.sh`).
- `cut-local.sh`, `prep-baselines.sh`, `gate.sh`, `mkmanifest.py`, `mktarball.py`: laptop side.
- `source_manifest.py <repo> <full sha> <version> <out.json>`: computes the source fingerprint (every tracked blob at the sha as [{path,bytes,sha256}] sorted by path; sha256 of the compact key-sorted JSON). Replaces the lost Mac script; anyone can recompute it from git. Run it before `cut-local.sh` and pass the fingerprint on.
- `install.sh`, `mk.py`: VPS side (copy to the VPS from a reviewed commit; the VPS copies are the running ones, git is the record).
- `gencut.py`, `cut336.sh`, `gate336.sh`, `install336.sh`, `mk336.py`, `mkmanifest336.py`: the retired VPS-build generation, kept as record.

No secrets belong in this folder; read them from the environment.

## Freeze list (VPS)
Never delete or move without Dom's per-folder word: `/opt/armagedom-preview-staging` (the `-ops`, `-private` and `-root-ops` dirs of the LIVE, ROLLBACK and FLOOR builds hold the rollback evidence: nginx before/after copies, private release.json, routing receipts), `/var/www/playarmagedom.com`, the nginx `playarmagedom-three-*.conf` snippets, `/opt/armagedom-realtime`. A cleanup archive copy is not a substitute: restore before a flip.

## Flip checks verify what still exists (2026-11-01)
`mk.py` no longer carries a hard-coded list of every historical preview. `promote-root.py` verifies the previews from the rollback floor (`_floor` in `releases.json`, 323) to the parent and aborts naming any missing build; `verify-served.py` compares only those builds' release shas (from `releases.json`); `verify-routing.py` asserts the domlynch.com legacy alias answers 301 without following it. Older builds are archived and unreachable by rollback.

## A release that was never staged (2026-11-01)
338 was built but replaced by 339 before staging, so `ops338-upload` never existed. `releases.json` lists it under `_unstaged`; `mk.py` skips it in the promote/served lists and derives the version shifts from the source ops set's own `deployment-plan.json`, so the parent chain can skip a number. Stage with `install.sh <tgz> N <live parent>` (e.g. `install.sh three-20261028-339.tgz 339 337`, `... 340 339`); the generated 340 ops set is byte-identical to the one patched by hand for the live flip.
