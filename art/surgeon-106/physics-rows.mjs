// Ragdoll row for the Perseus body (the ?player=perseus player): Web/src/data/physicsRigs.json `bodies` (one measured, UNSCALED bind-pose row) and
// `models` (rig mixamo-106, live). The model row is LAST in `models`, so it is never one of the parked pools (maxParked): its ragdoll is built on the
// player's first death. physics-death.js reaches it through the player row's `ragdollRow` field (manifest playerSwap), the hero row keeps its own.
// usage (from the repo root, after `npm ci` in Web/): node art/perseus-106/physics-rows.mjs
//   then, from Web/: node tools/physics-floor-support.mjs perseus-106   (the corpse seating vertices, physicsFloor.json)
// The file is edited as text, not re-serialised: it already holds duplicate keys (vagrant-106 twice) that a parse and rewrite would collapse.
// The measure is the package tool (node_modules/@frankendom/physics/tools/glb-measure.mjs) with the package's mixamo-106 rig map.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const id = "whiteclown-106",
  web = fileURLToPath(new URL("../../Web/", import.meta.url)),
  rigsPath = web + "src/data/physicsRigs.json",
  text = readFileSync(rigsPath, "utf8"),
  eol = text.includes("\r\n") ? "\r\n" : "\n",
  tool = web + "node_modules/@frankendom/physics/tools/glb-measure.mjs",
  map = web + "node_modules/@frankendom/physics/data/rig-maps/mixamo-106.json",
  row = JSON.parse(execFileSync("node", [tool, web + "public/assets/bosses/boss-surgeon.glb", map], { encoding: "utf8" })),
  body = {
    ...row,
    id,
    source: `${id}.glb (Armagedom Web/public/assets/appearances) bind pose via mixamo-106.json, x1 (unscaled: the actor root carries the model scale)`,
    scale_baked: 1,
  },
  model = { rig: "mixamo-106", body: id, live: true },
  modelKey = "boss-surgeon",
  entry = (value) => `    ${JSON.stringify(id)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n    ")}`,
  endBodies = `${eol}  },${eol}  "models": {`,
  endModels = `${eol}  },${eol}  "impulseReferenceKg"`;
if (text.includes(`    "${id}": {`)) throw new Error(id + " already has a row; remove it first");
// bodies: append the measured row; models: re-point the existing boss-surgeon row (was rig v1-65 / scavenger-65) in place
const marker = endBodies;
if (text.split(marker).length !== 2) throw new Error("expected one bodies end");
const oldModel = /("boss-surgeon": \{\s*)"rig": "v1-65",(\s*)"body": "scavenger-65"/;
if (!oldModel.test(text)) throw new Error("boss-surgeon model row not in the expected old shape");
const withBody = text.replace(marker, `,${eol}${entry(body).replaceAll("\n", eol)}${marker}`);
writeFileSync(rigsPath, withBody.replace(oldModel, `$1"rig": "mixamo-106",$2"body": "${id}"`));
console.log(id, "height", row.height_m, model.live);
