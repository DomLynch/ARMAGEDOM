// Ragdoll rows for the MakeHuman crowd bodies: Web/src/data/physicsRigs.json `bodies` (one measured, UNSCALED bind-pose row per body) and `models`
// (rig mixamo-106, the body row, live = the body is active in Web/src/data/crowdBodies.json).
// usage (from the repo root, after `npm ci` in Web/): node art/makehuman-crowd/physics-rows.mjs
// The measure is the package tool (node_modules/@frankendom/physics/tools/glb-measure.mjs) with the package's mixamo-106 rig map. Rows are unscaled
// because the sim frame is the actor root's local frame: the root carries the manifest `scale`. Only active bodies are live, because every live body
// row gets its own parked ragdoll pool (physics-death-impl.js warm); crowd-bodies.test.js fails if an active body has no live row.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const web = new URL("../../Web/", import.meta.url).pathname;
const rigsPath = web + "src/data/physicsRigs.json";
const pool = JSON.parse(readFileSync(web + "src/data/crowdBodies.json", "utf8")).pool;
const rigs = JSON.parse(readFileSync(rigsPath, "utf8"));
for (const name of Object.keys(rigs.bodies)) if (name.startsWith("mh-")) delete rigs.bodies[name];
for (const name of Object.keys(rigs.models)) if (name.startsWith("mh-")) delete rigs.models[name];
const tool = web + "node_modules/@frankendom/physics/tools/glb-measure.mjs",
  map = web + "node_modules/@frankendom/physics/data/rig-maps/mixamo-106.json";
for (const file of readdirSync(web + "public/assets/crowd").filter((n) => n.endsWith(".glb")).sort()) {
  const id = file.replace(/\.glb$/, "");
  const row = JSON.parse(execFileSync("node", [tool, web + "public/assets/crowd/" + file, map], { encoding: "utf8" }));
  rigs.bodies[id] = {
    ...row,
    id,
    source: `${file} bind pose via mixamo-106.json, x1 (unscaled: the actor root carries the manifest scale)`,
    scale_baked: 1,
  };
  rigs.models[id] = { rig: "mixamo-106", body: id, live: pool.find((p) => p.ref === id)?.active === true };
}
writeFileSync(rigsPath, JSON.stringify(rigs, null, 2) + "\n");
console.log("rows", Object.keys(rigs.models).filter((n) => n.startsWith("mh-")).length);
