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

const id = "butcher-106",
  web = fileURLToPath(new URL("../../Web/", import.meta.url)),
  rigsPath = web + "src/data/physicsRigs.json",
  text = readFileSync(rigsPath, "utf8"),
  eol = text.includes("\r\n") ? "\r\n" : "\n",
  tool = web + "node_modules/@frankendom/physics/tools/glb-measure.mjs",
  map = web + "node_modules/@frankendom/physics/data/rig-maps/mixamo-106.json",
  row = JSON.parse(execFileSync("node", [tool, web + "public/assets/bosses/boss-butcher.glb", map], { encoding: "utf8" })),
  body = {
    ...row,
    id,
    source: `boss-butcher.glb (Armagedom Web/public/assets/bosses, Warrok) bind pose via mixamo-106.json, x1 (unscaled: the actor root carries the model scale)`,
    scale_baked: 1,
  },
  model = { rig: "mixamo-106", body: id, live: true },
  entry = (value, key = id) => `    ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n    ")}`,
  endBodies = `${eol}  },${eol}  "models": {`,
  endModels = `${eol}  },${eol}  "impulseReferenceKg"`;
if (text.includes(`    "${id}": {`)) throw new Error(id + " already has a row; remove it first");
const insert = (source, marker, value, key) => {
  if (source.split(marker).length !== 2) throw new Error("expected one " + marker.trim());
  return source.replace(marker, `,${eol}${entry(value, key).replaceAll("\n", eol)}${marker}`);
};
// the Butcher keeps its model key: its old 65-bone model row (rig v1-65) is dropped and the live mixamo-106 row is added last
const old = /    "boss-butcher": \{\r?\n      "rig": "v1-65",\r?\n      "body": "butcher-65",\r?\n      "live": true\r?\n    \},\r?\n/;
if (!old.test(text)) throw new Error("old boss-butcher model row not found");
writeFileSync(rigsPath, insert(insert(text.replace(old, ""), endBodies, body, id), endModels, model, "boss-butcher"));
console.log(id, "height", row.height_m);
