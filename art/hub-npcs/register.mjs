// Registers the three hub NPC GLBs (Web/public/assets/npc/<ref>.glb) in Web/public/assets/manifest-hollow.json (models + files rows),
// spliced in as text so the rest of the manifest keeps its hand formatting. Same measure and row shape as art/makehuman-crowd/register.mjs.
// usage (repo root, after `npm ci` in Web/): node art/hub-npcs/register.mjs. Refuses to run twice.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../../Web/node_modules/three/build/three.module.js";
import { loadGeometry } from "../donor/probe.mjs";

const manifestPath = new URL("../../Web/public/assets/manifest-hollow.json", import.meta.url);
const npcDir = new URL("../../Web/public/assets/npc/", import.meta.url);
const roster = JSON.parse(readFileSync(new URL("../../Web/src/data/hubNpcs.json", import.meta.url), "utf8")).npcs;
const record = JSON.parse(readFileSync(new URL("./assets.json", import.meta.url), "utf8")).bodies;
const HEIGHT_BAND = [1.5, 1.95]; // same band as the crowd rows
const HERO_HIPS = 0.992; // the donor hero's hips height `stride` is measured against
const round = (n, d) => +n.toFixed(d);
let text = readFileSync(manifestPath, "utf8");
if (text.includes(`"${roster[0].ref}"`)) throw Error("hub NPCs are already registered");

const indent = (obj) =>
  JSON.stringify(obj, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : "    " + line))
    .join("\n");
const models = [],
  files = [];
for (const npc of roster) {
  const name = `${npc.ref}.glb`;
  const bytes = readFileSync(new URL(name, npcDir)),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const delivered = record.find((body) => body.id === npc.body);
  // The shipped file is OpenTrident's body with its 12 clips replaced by one retargeted Mixamo idle (build.mjs), so its own sha256 differs
  // from the delivery; hubNpcs.json pins the delivered body's sha256, which must match OpenTrident's record.
  if (!delivered || delivered.reduced_glb.sha256 !== npc.bodySha256) throw Error(`${npc.ref}: bodySha256 does not match OpenTrident's assets.json`);
  const gltf = await loadGeometry(bytes);
  const idle = gltf.animations.find((clip) => clip.name === npc.idleClip);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(idle).play();
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  let top = -Infinity,
    bottom = Infinity;
  const v = new THREE.Vector3();
  gltf.scene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, v).applyMatrix4(node.matrixWorld);
      top = Math.max(top, v.y);
      bottom = Math.min(bottom, v.y);
    }
  });
  const hips = new THREE.Vector3().setFromMatrixPosition(gltf.scene.getObjectByName("mixamorigHips").matrixWorld).y;
  const row = {
    url: `npc/${name}`,
    rig: "mixamo-106",
    motion: "donor-knife",
    scale: round(Math.min(HEIGHT_BAND[1], Math.max(HEIGHT_BAND[0], top)) / top, 3),
    forwardCorrection: 0,
    stride: round(hips / HERO_HIPS, 3),
    upperBone: "mixamorig:Spine",
    headBone: "mixamorig:Head",
    measure: {
      source: "Web/public/assets/npc GLB, skinned vertices and Hips world height at the first Idle frame (art/hub-npcs/register.mjs)",
      meshTopMetres: round(top, 3),
      meshBottomMetres: round(bottom, 3),
      hipsMetres: round(hips, 3),
      note: "same measure as the crowd rows; the NPC stands still, so stride is unused",
    },
    // The NPC file carries ONE clip, so every role points at it (the NPC never fights or walks).
    clips: Object.fromEntries(
      ["idle", "walk", "run", "slash", "return", "stab", "riposte", "heavy", "skill_pommel", "guard", "dodge", "hit", "death", "parry", "block", "deflected"].map((role) => [role, npc.idleClip]),
    ),
    deferred: true,
    provenance: {
      source: `OpenTrident Dev MakeHuman V2 NPC body ${npc.body} (${delivered.label}, delivered sha256 ${npc.bodySha256}), 13.5k triangles, 1024 px WebP textures, 106 Mixamo joints, delivered 2026-10-28; its 12 clips replaced by one Mixamo idle, ${npc.mixamoClip}, retargeted onto the 106-joint rig (art/hub-npcs/build.mjs); per-asset record art/hub-npcs/assets.json, build report art/hub-npcs/report.md`,
      licence:
        "Relayed by Lead from OpenTrident Dev (not independently re-verified per asset by Lead): CC0 1.0. MPFB2 2.0.18 in Blender 5.2 (tool only, none of its code ships) with only the official MakeHuman CC0 packs makehuman_system_assets_cc0 and skins01_cc0; rig, skin weights and packing are OpenTrident's own work. See art/hub-npcs/PROVENANCE.md and art/makehuman-crowd/PROVENANCE.md. Mixamo animation clips: cleared by Dom 2026-10-23.",
      assembly:
        "plain realistic body, no Layer_/Sword/Weapon nodes, no weapon, ONE clip (Idle, a retargeted Mixamo clip, see source); every clip role points at Idle because the NPC never fights or walks",
      note: "hub NPC, appearance and idle only (Web/src/data/hubNpcs.json); not wired into any area yet",
    },
    bytes: bytes.length,
    sha256,
  };
  models.push(`    "${npc.ref}": ${indent(row)}`);
  files.push(`    "${npc.ref}": ${indent({ file: `npc/${name}`, bytes: bytes.length, sha256 })}`);
}
// Splice after the last crowd row of each block (mh-woman-01 is last in both `models` and `files`).
const spliceAfter = (src, anchor, rows) => {
  const at = src.indexOf(anchor);
  if (at < 0) throw Error(`anchor not found: ${anchor}`);
  const end = src.indexOf("\n    }\n", at) + "\n    }".length;
  return src.slice(0, end) + ",\n" + rows.join(",\n") + src.slice(end);
};
const firstWoman = text.indexOf('    "mh-woman-01": {'),
  secondWoman = text.indexOf('    "mh-woman-01": {', firstWoman + 1);
if (firstWoman < 0 || secondWoman < 0) throw Error("mh-woman-01 rows not found");
// Do the later splice first so the earlier offset stays valid.
text = text.slice(0, secondWoman) + spliceAfter(text.slice(secondWoman), '    "mh-woman-01": {', files);
text = text.slice(0, firstWoman) + spliceAfter(text.slice(firstWoman), '    "mh-woman-01": {', models);
JSON.parse(text);
writeFileSync(manifestPath, text);
console.log("registered", roster.map((n) => n.ref).join(", "));
