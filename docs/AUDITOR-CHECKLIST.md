# Auditor checklist (per-PR and per-release review)

Written 2 Nov 2026 by the retiring Auditor session, from the PRs reviewed on 31 Oct to 2 Nov. The per-PR review agent reads this file; it is the
checklist, not a policy: the gate itself is `.github/workflows/audit-gate.yml`. No credentials belong in a review comment, a commit or this file.

## 1. The verdict

- The comment starts exactly `**Auditor: PASS at <full sha>**` or `**Auditor: FAIL at <full sha>**`, with the head sha of the PR as it is now. The audit-gate
  reads the newest such line and compares it with the head. Then add the `auditor-pass` label (`gh pr edit N --add-label auditor-pass`).
  Any new push removes the label: review the new head, never write "re-PASS".
- Never pass your own PR. Merge nothing: merging is the Lead's, with `--match-head-commit`, and only on Dom's word.
- Say in the line or the first paragraph that Dom's data-layer check ran (section 3).
- Put what you did not verify in the comment as caveats: tests you did not run yourself, anything seen only in a game or on a phone, source files
  that are not in the repository, live bytes.
- Keep it short: result first, then what was checked, then what Dom must look at. Judgement calls are written as such.
- A FAIL names the one defect and what fixes it; the next head gets a fresh read of the delta.

## 2. Every PR

1. `gh pr view N --json headRefOid,baseRefOid,statusCheckRollup`: CI on that exact sha, every check except audit-gate must be success (web 1-8,
   web-gate, server db + presence, built-game boot; typecheck and lint are soft).
2. Read the whole diff against the base. Tier-b (runtime sim, combat, saves, multiplayer, auth) may need a second reviewer: ask the Lead.
3. Tests changed in the PR: every relaxed assertion, re-pinned golden or skipped check must carry a written reason. Judge whether the property it
   guarded still holds somewhere else, and say if a guard is gone.
4. Bytes and hashes: for every changed asset, the `bytes` and `sha256` in the model row, the `files` row and the world manifest must equal the blob
   at the head (compute them from `git show <head>:<path>`, not from the PR text). Beware CRLF: a hash recorded from a Windows working copy
   differs from the LF blob.
5. Records: look at JSON keys a find/replace could have mangled (a hash pasted into a key name happened once); provenance rows keep
   `source`, `sourceSHA256`, `licence`, `assembly`, `previous`.
6. Rebased PRs: compare the PR's own +/- lines before and after the rebase file by file; only hash lines and added provenance should differ.
7. Gameplay changes are listed for Dom (ranges, timings, contact scales, reach, new hit zones). Accepting one as a consequence is fine; hiding it
   is not.
8. Migrations or anything touching a database: separate Supabase project/DB/credentials per game; a migration needs its own PR, an Auditor PASS
   and a backup first.

## 3. Dom's data-layer check (standing rule, 1 Nov 2026)

"Everything was supposed to be on the data layer, not hard-coded." Fail any PR whose weapon, grip, flame, animation or attachment code names a
specific player mesh, a bone name outside the 106-rig standard, or a per-character offset. The rig standard is the only thing code may name; bone
names, offsets, scales, strides, grips, clips, timings and strike paths live in the manifest row or the data files
(`Web/public/assets/manifest-hollow.json`, `Web/src/data/*.json`, `Web/public/world/area-content.json`). Numbers in source need a data-file home
or a `// tuning-ok:` mark; the web gate counts them. A generic code change (a new optional field) must be a no-op when the field is absent:
read each changed expression and say so.

## 4. Boss and body PRs (the seven boss bodies, 1 Nov)

For a PR that swaps a body GLB: manifest row (rig, clips, bones, scale, stride, provenance), ragdoll body in `physicsRigs.json` and the floor table,
finisher bones in `finisherData.json` (load the new GLB and confirm each bone name exists, plus `fk_socket_hand_r` and any `WeaponDrawn`), strike
path rows (count = windup + active + recovery + 1), `contactScale` = manifest scale x 1.3225 (pinned by `public-area-bosses`), the old budget
exception removed in `body-kb-budget.json`, other bosses' rows intact after a rebase. Load GLBs with `art/donor/probe.mjs` `loadGeometry`.

## 5. Release package PASS (cut by the Lead, built by Deploy, compared by the Auditor)

1. The Lead sends `source-manifest-NNN.json` (version, head, fingerprint, files). Recompute the fingerprint independently: every blob tracked at the
   sha (`git ls-tree -r`, stored bytes) as `[{path, bytes, sha256}]` sorted by path (code point), then sha256 of
   `json.dumps(files, sort_keys=True, separators=(',', ':'))` (Python escaping of non-ASCII). It must equal the manifest and every file entry must match.
2. Merge chain: `git log --first-parent --format='%h %p %s'`; each merge's second parent must be the head you passed (tier-a merges you did not
   audit: read their diffs and say so).
3. CI on the exact sha green (`gh api repos/DomLynch/ARMAGEDOM/commits/<sha>/check-runs`).
4. Rebuild with the same recipe in your own work folder (Windows, Git Bash, portable Node 22.23.2, `tools/deploy/cut-local.sh N <sha> <fp>`, parent row
   for N-1 present in `releases.json`): RB/BUILD/ASSETS/PACK exit 0, AREA_IDENTICAL, and `PKG` (the sha256 of `export/release.json`) equal to Deploy's.
   The tarball hash differs because it carries buildTime; PKG is the comparison value. Do not run two builds at once (RAM).
5. Post `**Auditor: PASS at <full sha>**` on a PR in the delta and tell the Lead and Deploy. The flip needs the Lead's GO and Dom's word.

## 6. Traps seen

- A `git archive` on Windows rewrites line endings unless `core.autocrlf=false`; a baseline or hash built that way is wrong.
- `process.argv[1]` against `new URL(import.meta.url).pathname` never matches on Windows (scripts silently write nothing); use `fileURLToPath`.
- Shell stubs cannot shadow `gh.exe` on Windows; a test that calls the real `gh` can edit live issues.
- `npm ci` and the first build are the slow part; the other checks are minutes.
- The tool hook on this machine can block a command that merely contains certain words; write long comment bodies to a file with the editor and post
  with `gh ... -F <file>`.
