// Registers the reduced MakeHuman crowd bodies in Web/public/assets/manifest-hollow.json (models + files rows): the 19 first-batch bodies (mh-<id>)
// and the 19 crowd-batch bodies (mh-crowd-b<n>-<nn>). A body whose id already has a manifest row is skipped, so it can run again after new GLBs arrive.
// usage (from the repo root, after `npm ci` in Web/): node art/makehuman-crowd/register.mjs
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
    .filter((line) => line.startsWith("| mh-"))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      const num = (cell) => (Number.isFinite(+cell) ? +cell : undefined); // "-" = not recorded in that batch's report
      return [cells[1], { trisBefore: num(cells[2]), trisAfter: num(cells[3]), kbBefore: num(cells[4]), kbAfter: num(cells[5]) }];
    }),
);
// Rendered height band (metres): a body keeps its natural height inside it, taller or shorter ones are scaled to the nearer end.
const HEIGHT_BAND = [1.5, 1.95];
// The donor hero's hips height the other rows' `stride` is measured against (marked-hunter row).
const HERO_HIPS = 0.992;
const round = (n, digits) => +n.toFixed(digits);

const text = readFileSync(manifestPath, "utf8");
const registered = new Set(Object.keys(JSON.parse(text).models));

const models = [],
  files = [];
for (const name of readdirSync(crowdDir).filter((n) => n.endsWith(".glb")).sort()) {
  const id = name.replace(/\.glb$/, "");
  if (registered.has(id)) continue;
  const batch = id.match(/^mh-crowd-(b\d)-/)?.[1];
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
  const upstream = batch
    ? `OpenTrident crowd batch ${batch}: record in art/makehuman-crowd/assets.json (batch ${batch}), packs in art/makehuman-crowd/packs-${batch}.md`
    : id.startsWith("mh-gen-v2-")
    ? `/srv/dev-jobs/opentrident-site/models/makehuman-gen/body-${id.slice(-4)}.glb`
    : `/srv/dev-jobs/opentrident-site/models/makehuman/${id}.glb`;
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
        source: "Web/public/assets/crowd GLB, skinned vertices and Hips world height at the first Idle frame (art/makehuman-crowd/register.mjs)",
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
        source: batch
          ? `OpenTrident Dev's own MakeHuman crowd body ${id} (batch ${batch} of 3, built 2026-10-28), 13.5k triangles, 1024 px WebP textures, 106 Mixamo joints (report art/makehuman-crowd/reduction-report.md); ${upstream}`
          : `OpenTrident Dev MakeHuman V2 body ${id}, reduced to about 13.5k triangles with 1024 px textures and 106 Mixamo joints (VPS /root/mh-reduce/out/${name}, report art/makehuman-crowd/reduction-report.md); upstream ${upstream}`,
        trisBefore: r.trisBefore,
        trisAfter: r.trisAfter,
        kbBefore: r.kbBefore,
        kbAfter: r.kbAfter,
        licence: batch
          ? `OpenTrident Dev's own MakeHuman bodies (crowd batch ${batch}), generated by OpenTrident (Dom Lynch) with MPFB2 2.0.18 in Blender 5.2 using only the official MakeHuman CC0 asset packs makehuman_system_assets_cc0 and skins01_cc0 (117 assets, all CC0 per their manifests; pack statement and five-pack table in art/makehuman-crowd/PROVENANCE.md, per-batch listing in art/makehuman-crowd/packs-${batch}.md, per-body asset record in art/makehuman-crowd/assets.json). Rig, skin weights, texture packing and the 106-joint skeleton are OpenTrident's own work; the GPL-3.0 MPFB2 add-on is a tool and none of its code ships. Licence of the delivered GLB: CC0 1.0, no attribution required. Relayed by Lead from OpenTrident Dev, not independently re-verified per asset here. Mixamo animation clips: cleared by Dom 2026-10-23. No FLUX, Krea or TRELLIS parts.`
          : "Relayed by Lead from OpenTrident Dev (not independently re-verified per asset by Lead): MakeHuman crowd bodies (30). Generated by OpenTrident (Dom Lynch) with MPFB2 2.0.18 in Blender 5.2. Base mesh, shape targets, skins, eyes, eyebrows, eyelashes, teeth, hair and clothes come from the MakeHuman CC0 asset packs (makehuman_system_assets_cc0, skins01_cc0; the pack pages list CC0 per asset). Body shapes are our own seeded parameter sets. Rig, skin weights, texture packing and the 106-joint Mixamo-compatible skeleton are OpenTrident's own work. The MPFB2 add-on code is GPL-3.0 but only a tool: none of its code ships in the files. Licence of the delivered GLBs: CC0 1.0; no attribution required. Reduced copies (13.5k tris, 1024px) are derived from these. Source of record: OpenTrident data/makehuman.json (all 30 rows source CC0), docs/parts-lab/makehuman/README.md + FACTORY.md; pack SHA256SUMS on the VPS at parts-lab/makehuman/dl/. Not independently re-verified per asset by Lead. Mixamo animation clips: cleared by Dom 2026-10-23. No FLUX, Krea or TRELLIS parts are in these 30.",
        assembly:
          "plain realistic body, no Layer_/Sword/Weapon nodes, 12 raw Mixamo clips on the 106-joint rig (Idle Walk Run Attack Guard Roll Hit Death Heavy and three Stress_ clips the game never plays); no weapon; clip roles that Mixamo did not supply (return, riposte, skill_pommel, parry, block, deflected) point at the nearest supplied clip",
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
