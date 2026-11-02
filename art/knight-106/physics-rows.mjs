// Ragdoll row for the Station Breaker body (the Station Breaker boss, model boss-area7-knight): Web/src/data/physicsRigs.json `bodies` (one measured, UNSCALED bind-pose row) and
// `models` (rig mixamo-106, live). The model row is LAST in `models`, so it is never one of the parked pools (maxParked): its ragdoll is built on the
// player's first death. physics-death.js reaches it through the player row's `ragdollRow` field (manifest playerSwap), the hero row keeps its own.
// usage (from the repo root, after `npm ci` in Web/): node art/knight-106/physics-rows.mjs
//   then, from Web/: node tools/physics-floor-support.mjs knight-106   (the corpse seating vertices, physicsFloor.json)
// The file is edited as text, not re-serialised: it already holds duplicate keys (vagrant-106 twice) that a parse and rewrite would collapse.
// The measure is the package tool (node_modules/@frankendom/physics/tools/glb-measure.mjs) with the package's mixamo-106 rig map.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const id = "knight-106",
  web = fileURLToPath(new URL("../../Web/", import.meta.url)),
  rigsPath = web + "src/data/physicsRigs.json",
  text = readFileSync(rigsPath, "utf8"),
  eol = text.includes("\r\n") ? "\r\n" : "\n",
  tool = web + "node_modules/@frankendom/physics/tools/glb-measure.mjs",
  map = web + "node_modules/@frankendom/physics/data/rig-maps/mixamo-106.json",
  row = JSON.parse(execFileSync("node", [tool, web + "public/assets/bosses/boss-area7-knight.glb", map], { encoding: "utf8" })),
  body = {
    ...row,
    id,
    source: `${id}.glb (Web/public/assets/bosses) bind pose via mixamo-106.json, x1 (unscaled: the actor root carries the model scale)`,
    scale_baked: 1,
  },
  entry = (value) => `    ${JSON.stringify(id)}: ${JSON.stringify(value, null, 2).replaceAll("\n", "\n    ")}`,
  endBodies = `${eol}  },${eol}  "models": {`;
if (text.includes(`    "${id}": {`)) throw new Error(id + " already has a row; remove it first");
const insert = (source, marker, value) => {
  if (source.split(marker).length !== 2) throw new Error("expected one " + marker.trim());
  return source.replace(marker, `,${eol}${entry(value).replaceAll("\n", eol)}${marker}`);
};
writeFileSync(rigsPath, insert(text, endBodies, body)); // the models row (boss-area7-knight -> mixamo-106 / knight-106) is set by apply-rows.mjs
console.log(id, "height", row.height_m);
