# Binary inventory (2026-10-29)

Auditor-authored. Read-only audit of `origin/main` (2533 tracked files, **874.2 MB** tracked). Nothing was moved or removed by this audit. Sizes are bytes on disk of the working tree, not packed `.git` size.

## 1. Tracked size by type

| Type | Files | MB |
|---|---:|---:|
| .png | 477 | 483.3 |
| .glb | 97 | 189.5 |
| .blend | 12 | 95.3 |
| .jpg | 143 | 62.2 |
| .webp | 20 | 20.8 |
| .gif | 1 | 5.4 |
| .wav / .mp4 / .m4a | 3 | 2.7 |
| everything else (js, json, md, py, sql ...) | ~1780 | ~15 |

Images (png/jpg/webp/gif) are 572 MB, 65% of the checkout. No LFS: there is no `.gitattributes` and no LFS pointer file.

## 2. Size by directory (top 12, depth 3)

| Directory | MB |
|---|---:|
| Web/public/assets | 134.3 |
| art/vendor/flare | 58.1 |
| art/hero | 52.8 |
| art/chained-pitborn/raw | 47.6 |
| Web/public/world | 38.9 |
| art/south-clear-crates-hedgehog/stills | 25.4 |
| art/westminster-clear-sandbags/stills | 23.1 |
| docs/stills/grid-links | 21.7 |
| art/enemies/warlock | 21.6 |
| art/enemies/orc | 21.1 |
| art/enemies (top level) | 20.6 |
| artifacts | 19.0 |

## 3. Top 30 files

| MB | Path |
|---:|---|
| 17.9 | art/hero/warden-rigged.blend |
| 14.3 | Web/public/assets/lossless/warlock.glb |
| 14.3 | art/hero/warden-source.glb |
| 14.1 | art/vendor/flare/hero.blend |
| 13.8 | art/vendor/flare/textures/Paper001_4K_NormalGL.jpg |
| 13.6 | Web/public/assets/lossless/orc.glb |
| 13.4 | Web/public/assets/lossless/revenant.glb |
| 10.7 | art/enemies/warlock/warlock-rigged.blend |
| 10.4 | art/vendor/flare/skeleton_mage_high.blend |
| 10.3 | art/enemies/orc/orc-rigged.blend |
| 10.3 | art/enemies/revenant-rigged.blend |
| 9.5 | Web/public/assets/lossless/vagrant.glb |
| 9.1 | art/enemies/warlock/warlock-source.glb |
| 8.6 | art/enemies/orc/orc-source.glb |
| 8.4 | art/enemies/revenant-source.glb |
| 6.7 | Web/public/assets/donor/warrior.glb |
| 6.7 | art/hero/warden-rigged 2.blend |
| 6.7 | art/hero/warden-rigged 3.blend |
| 6.5 | Web/public/assets/donor/goblin.glb |
| 6.2 | art/vendor/flare/textures/Paper001_4K_Displacement.jpg |
| 5.7 | art/reference-motion/mesh2motion-human-base.glb |
| 5.4 | art/hollow-scavenger/hollow-moving-proof-v2.gif |
| 5.4 | art/vendor/flare/textures/Paper001_4K_Roughness.jpg |
| 5.3 | art/hero/warden-source-1024.glb |
| 4.3 | Web/public/assets/hollow-scavenger/hollow-scavenger.glb |
| 4.3 | Web/public/assets/weapons/flamethrower.glb |
| 4.2 | art/hollow-scavenger/hollow-scavenger-review.blend |
| 4.1 | art/hollow-scavenger/archive/hollow-before-neck-037.glb |
| 4.0 | art/chained-pitborn/raw/f00.png |
| 4.0 | art/chained-pitborn/raw/f09.png |

## 4. Exact duplicates (sha256, all binary types)

12 groups, 26 files, **3.97 MB** redundant. This is far smaller than the 22-file / large-saving impression: dedup alone is not the lever.

| Group (identical files) | Each | Referenced by text in repo? | Verdict |
|---|---:|---|---|
| docs/stills/desktop-layout/touch-375x812-{before,after}.png | 1.32 MB | No text hit | Keep: evidence path |
| docs/stills/hit-reaction/{pistol-head-0.45s, pistol-head-0.80s, rifle-torso-0.00s}.png | 0.25 MB | No text hit | Keep: evidence path |
| docs/stills/hit-reaction/{rifle-torso-0.45s, rifle-torso-0.80s, shotgun-torso-0.00s}.png | 0.19 MB | No text hit | Keep: evidence path |
| docs/stills/hit-reaction/{rocket-legs-0.00s, shotgun-torso-0.80s}.png | 0.21 MB | No text hit | Keep: evidence path |
| docs/stills/hit-reaction/{knife-arms-0.00s, rocket-legs-0.80s}.png | 0.16 MB | No text hit | Keep: evidence path |
| docs/stills/hit-reaction/{knife-arms-0.45s, knife-arms-0.80s}.png | 0.15 MB | No text hit | Keep: evidence path |
| docs/stills/burn/before-dying-{3.5s,8.0s}.png | 0.11 MB | No text hit | Keep: evidence path |
| docs/hollow-shrink-stills/hollow-scavenger-{before,after}.jpg | 0.22 MB | No text hit | Keep: evidence path |
| docs/creature-shrink-stills/original-rat-{before,after}.jpg | 0.22 MB | No text hit | Keep: evidence path |
| docs/creature-shrink-stills/original-dog-{before,after}.jpg | 0.22 MB | No text hit | Keep: evidence path |
| docs/physics-pilot-stills/stand-ragdoll-{1.6s,3.0s}.png | 0.09 MB | No text hit | Keep: evidence path |
| Web/public/assets/donor/knife.glb = Web/public/assets/hollow-scavenger/knife.glb | 0.38 MB | Yes: both paths named in each folder's `manifest.json`, `manifest-hollow.json` (donor), `verify-assets.test.mjs` | Keep: referenced, donor original |

No text file cites the still paths, but earlier PR bodies (outside the repo) may. Rule: evidence stills are never removed on repo-grep alone.

Near-duplicates (not exact, so not touched): `art/hero/warden-rigged 2.blend` and `warden-rigged 3.blend` are 6,662,479 and 6,662,448 bytes. They differ from each other by 31 bytes and are about 11 MB smaller than `warden-rigged.blend`. They are authoring saves; Dom decides.

## 5. Result of this PR

Files removed: **none**. Every exact-duplicate group is either an evidence still or a referenced donor file. Tracked size before and after: 874.2 MB.

## 6. Recommended plan, with risk

| Step | What | Saves | Risk |
|---|---|---|---|
| A | Dom reviews `warden-rigged 2/3.blend`; if they are throwaway saves, delete in a separate PR | ~13 MB | Low. They hold Dom's authoring; his call only. |
| B | Add a going-forward-only `.gitattributes` with LFS filters for new `*.blend`, `*.glb` over a threshold, `*.png` in `art/**/raw` | 0 now; stops growth | Medium. Changes nothing about existing files and commits. Needs `git lfs` on every clone, CI and the VPS/hfjob checkout; the Pages/web build must smoothly handle pointer files. |
| C | Move `art/**/raw`, `art/**/stills`, `docs/stills` to a release asset or external store, leaving a text index (path, sha256, URL) | Up to ~250 MB of checkout | High. Breaks citations from earlier PRs unless the stills stay reachable at the same path. Needs Dom plus Strategy sign-off. |
| D | Convert PNG stills to lossless-optimized PNG or WebP in new PRs only | Future growth | Low for new files; never rewrite existing evidence. |
| E | Full LFS migration / history purge | Shrinks `.git` | Highest. Needs history rewrite; out of scope and forbidden without Dom's explicit order. |

Going-forward-only option detail: the `.gitattributes` rules apply only to files added after the commit. Existing blobs stay as normal Git objects, so clone size does not drop; only future growth is capped.

## 7. Open items

- **LICENSE**: the repo has no root LICENSE (only `art/vendor/flare/LICENSE.txt`, `art/reference-motion/LICENSE-*.txt` and `docs/assets/flamethrower-LICENSE.md`). Not added; legal is Dom's call.
- Dedup of `knife.glb` would need both manifests and the hash records re-pointed, a code change and a tier-B-style review. Not worth 0.38 MB.
- Method: `git ls-files` plus sha256 over png/jpg/webp/glb/blend/fbx/mp4/gif/audio/zip types; references via `git grep -F` on full paths and basenames.
