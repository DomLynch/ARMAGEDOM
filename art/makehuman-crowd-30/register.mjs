// Registers the 30 worn-2030 crowd bodies of batch 2 (ids mh-worn-NN) in Web/public/assets/manifest-hollow.json (models + files rows).
// usage (from the repo root, after `npm ci` in Web/): node art/makehuman-crowd-30/register.mjs
// Same row shape as art/makehuman-crowd/register.mjs (batch 1), limited to the mh-worn-* files; batch 1 rows are not touched.
// The GLBs are Web/public/assets/crowd/mh-<id>.glb. The script measures each file (bytes, sha256, bind-height at the first idle frame)
// and splices the rows in as text, so the rest of the manifest keeps its hand formatting. It refuses to run twice.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../../Web/node_modules/three/build/three.module.js";
import { loadGeometry } from "../donor/probe.mjs";

const manifestPath = new URL("../../Web/public/assets/manifest-hollow.json", import.meta.url);
const crowdDir = new URL("../../Web/public/assets/crowd/", import.meta.url);
const report = new Map(
  readFileSync(new URL("./reduction-report.md", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("| mh-worn-"))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      return [cells[1], { trisBefore: +cells[2], trisAfter: +cells[3], kbBefore: +cells[4], kbAfter: +cells[5], row: cells[8] }];
    }),
);
// Rendered height band (metres): a body keeps its natural height inside it, taller or shorter ones are scaled to the nearer end.
const HEIGHT_BAND = [1.5, 1.95];
// The donor hero's hips height the other rows' `stride` is measured against (marked-hunter row).
const HERO_HIPS = 0.992;
const round = (n, digits) => +n.toFixed(digits);

const text = readFileSync(manifestPath, "utf8");
if (text.includes('"mh-worn-01"')) throw Error("the worn crowd bodies are already registered; remove the mh-worn-* rows first");

const models = [],
  files = [];
for (const name of readdirSync(crowdDir).filter((n) => /^mh-worn-\d+\.glb$/.test(n)).sort()) {
  const id = name.replace(/\.glb$/, "");
  const bytes = readFileSync(new URL(name, crowdDir)),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const gltf = await loadGeometry(bytes);
  const idle = gltf.animations.find((clip) => clip.name === "Idle");
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
  const scale = round(Math.min(HEIGHT_BAND[1], Math.max(HEIGHT_BAND[0], top)) / top, 3);
  const r = report.get(id);
  models.push(`    "${id}": ${JSON.stringify(
    {
      url: `crowd/${name}`,
      rig: "mixamo-106",
      motion: "donor-knife",
      scale,
      forwardCorrection: 0,
      stride: round(hips / HERO_HIPS, 3),
      upperBone: "mixamorig:Spine",
      headBone: "mixamorig:Head",
      measure: {
        source: "Web/public/assets/crowd GLB, skinned vertices and Hips world height at the first Idle frame (art/makehuman-crowd-30/register.mjs)",
        meshTopMetres: round(top, 3),
        meshBottomMetres: round(bottom, 3),
        hipsMetres: round(hips, 3),
        note: "scale keeps the natural height inside 1.5 to 1.95 m; stride is the hips height over the donor hero's 0.992 like the hunter row, foot slide not checked on a phone",
      },
      clips: {
        idle: "Idle",
        walk: "Walk",
        run: "Run",
        slash: "Attack",
        return: "Attack",
        stab: "Heavy",
        riposte: "Heavy",
        heavy: "Heavy",
        skill_pommel: "Heavy",
        guard: "Guard",
        dodge: "Roll",
        hit: "Hit",
        death: "Death",
        parry: "Guard",
        block: "Guard",
        deflected: "Hit",
      },
      deferred: true,
      provenance: {
        source: `Armagedom crowd batch 2, worn 2030 clothing: MakeHuman factory row ${r.row} (art/makehuman-crowd-30/rows.json), built with the OpenTrident MakeHuman factory on the VPS (build_batch.sh), reduced to about 13.5k triangles with 1024 px textures and 106 Mixamo joints (report art/makehuman-crowd-30/reduction-report.md)`,
        trisBefore: r.trisBefore,
        trisAfter: r.trisAfter,
        kbBefore: r.kbBefore,
        kbAfter: r.kbAfter,
        licence:
          "Same factory, packs and licence statement as the batch 1 crowd bodies (art/makehuman-crowd/PROVENANCE.md, relayed by Lead from OpenTrident Dev, not independently re-verified per asset): MPFB2 2.0.18 in Blender 5.2; base mesh, shape targets, skins, eyes, eyebrows, eyelashes, teeth, hair and suits come from the MakeHuman CC0 packs makehuman_system_assets_cc0 and skins01_cc0 only (no hat, mask, equipment or community asset). Body shapes are seeded parameter sets; the worn-clothing recolour is a palette row of ours (art/makehuman-crowd-30/crowd30-palette.json). Licence of the GLBs: CC0 1.0. Mixamo animation clips: cleared by Dom 2026-10-23. No FLUX, Krea or TRELLIS parts.",
        assembly:
          "plain realistic civilian in worn clothing (a stock pack suit recoloured faded and dark), no armour, no Layer_/Sword/Weapon nodes, 12 raw Mixamo clips on the 106-joint rig (Idle Walk Run Attack Guard Roll Hit Death Heavy and three Stress_ clips the game never plays); no weapon; clip roles that Mixamo did not supply (return, riposte, skill_pommel, parry, block, deflected) point at the nearest supplied clip",
        note: "appearance only, crowd residents (Web/src/data/crowdBodies.json); same 106 rig as marked-hunter, so a ragdoll row for the 106 body can serve it",
      },
      bytes: bytes.length,
      sha256,
    },
    null,
    2,
  )
    .split("\n")
    .map((line, i) => (i === 0 ? line : "    " + line))
    .join("\n")}`);
  files.push(
    `    "${id}": ${JSON.stringify({ file: `crowd/${name}`, bytes: bytes.length, sha256 }, null, 2)
      .split("\n")
      .map((line, i) => (i === 0 ? line : "    " + line))
      .join("\n")}`,
  );
}
const modelsEnd = "\n    }\n  },\n  \"files\": {",
  filesEnd = "\n    }\n  },\n  \"pistol\": {";
if (!text.includes(modelsEnd) || !text.includes(filesEnd)) throw Error("manifest layout changed");
const out = text
  .replace(modelsEnd, `\n    },\n${models.join(",\n")}${modelsEnd.slice(modelsEnd.indexOf("\n    }") + 6)}`)
  .replace(filesEnd, `\n    },\n${files.join(",\n")}${filesEnd.slice(filesEnd.indexOf("\n    }") + 6)}`);
writeFileSync(manifestPath, out);
console.log("registered", models.length, "bodies");
