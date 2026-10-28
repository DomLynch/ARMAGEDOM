// Registers the three hub NPC GLBs in Web/public/assets/manifest-hollow.json (models + files rows), spliced in as text so the rest of the
// manifest keeps its hand formatting. usage (repo root, after `npm ci` in Web/): node art/hub-npcs/register.mjs. Refuses to run twice.
import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../../Web/node_modules/three/build/three.module.js";
import { loadGeometry } from "../donor/probe.mjs";

const manifestPath = new URL("../../Web/public/assets/manifest-hollow.json", import.meta.url);
const npcDir = new URL("../../Web/public/assets/npc/", import.meta.url);
const roster = JSON.parse(readFileSync(new URL("../../Web/src/data/hubNpcs.json", import.meta.url), "utf8")).npcs;
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
    clips: Object.fromEntries(
      ["idle", "walk", "run", "slash", "return", "stab", "riposte", "heavy", "skill_pommel", "guard", "dodge", "hit", "death", "parry", "block", "deflected"].map((role) => [role, npc.idleClip]),
    ),
    deferred: true,
    provenance: {
      source: `Crowd body ${npc.body} (OpenTrident Dev MakeHuman V2, art/makehuman-crowd) with its clips replaced by one Mixamo idle, ${npc.mixamoClip}, retargeted onto the 106-joint rig (art/hub-npcs/build.mjs)`,
      licence: "Same as the crowd bodies, see art/makehuman-crowd/PROVENANCE.md (MakeHuman CC0 packs, Mixamo clips cleared by Dom 2026-10-23).",
      assembly: "plain body, worn-2030 colour grade on the body atlas only, ONE clip (Idle), no weapon; every clip role points at Idle because the NPC never fights",
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
