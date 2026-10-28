# Hub NPCs (28 Oct 2026)

Brannock (vendor), Ines (medic), Marrow (quest giver). Roster: `Web/src/data/hubNpcs.json`. GLBs: `Web/public/assets/npc/`. Registered as deferred rows in `manifest-hollow.json` (`art/hub-npcs/register.mjs`). Not wired into any area.

- Bodies: shipped MakeHuman crowd bodies mh-male-01, mh-gen-v2-0036, mh-gen-v2-0020 (CC0, see `art/makehuman-crowd/PROVENANCE.md`), 106 joints, 13.5k triangles.
- Clip: every crowd clip dropped, ONE Mixamo idle retargeted onto the 106 rig by direction (`build.mjs`; the body rest pose is not the Mixamo T pose, so raw local copy twists the arms): 107900901-breathing-idle, 110210901-looking, 104340901-old-man-idle (VPS /srv/dev-jobs/opentrident-site/models/mixamo/clips/).
- Look: worn-2030 grade on the body atlas only (`grade.py`): desaturate, darken, warm/cool tint, seeded grime.
- Rebuild: `sh art/hub-npcs/build-all.sh` (VPS, needs gltf-transform, PIL). Stills: `shoot.mjs` + `sheet.html` (375 wide, idle frame t=1 s).
- Checks (VPS): glTF-Validator 0 errors (2 warnings, same as the crowd source); 106 joints; 2 to 3 draws; 496 to 534 KB; `Web/tests/hub-npcs.test.js` plus crowd tests 21/21.
- Not checked: phone, in-hub placement and scale (nothing draws them yet).
