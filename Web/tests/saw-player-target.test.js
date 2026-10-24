// The Surgeon's saw against the PLAYER keeps the original hand-height blade trace. The ground column that
// lets the player's saw cut low creatures and the stooped Hollow (bone-saw-view.js) must not apply when the
// target is the player: that would be an unrequested balance change (a player hugging the Surgeon).
// The probe runs the real actors sawContact -> boneSawContact -> real posed player mesh; the pinned
// results are what the code produced before the column existed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { disposeActorSources } from "../src/actor-resources.js";
import { fixture } from "./helpers/rifle-fixture.js";

const assets = new URL("../public/assets/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("manifest-hollow.json", assets)));
// Gaps (m, Surgeon to player) from point blank to normal saw reach (BONE_SAW_RULES.range is 1.55).
const GAPS = [0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.35, 1.5, 1.7, 2];
// Printed by the code before the ground column existed (3c6cc6b^); set SAW_PLAYER_PROBE_PRINT=1 to re-print.
const PINNED = process.env.SAW_PLAYER_PROBE_PRINT
  ? null
  : { rows: Array(7).fill("0".repeat(GAPS.length)), control: true };

test("Surgeon saw contact against the player equals the pre-column hand-height trace", async (t) => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
    }),
  };
  const models = new Map();
  for (const name of ["vagrant", "boss-surgeon"]) {
    const description = manifest.models[name];
    models.set(name, {
      description,
      gltf: await loadGeometry(fs.readFileSync(new URL(description.url, assets))),
      equipment: description.equipment
        ? await loadGeometry(fs.readFileSync(new URL(description.equipment.url, assets)))
        : null,
    });
  }
  t.after(() => {
    disposeActorSources(new Set([...models.values()].flatMap((m) => [m.gltf, m.equipment].filter(Boolean))));
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  const f = fixture({ areaId: "lambeth" });
  f.restore();
  const g = f.g,
    surgeon = g.enemies.find((e) => e.placementKey === "boss-surgeon-v1");
  assert(surgeon?.bossProfile?.weapon?.kind === "saw");
  const scene = new T.Scene();
  Object.assign(f.world, {
    scene,
    camera: new T.PerspectiveCamera(),
    toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z),
  });
  const actors = createActors(scene, f.world, { models, manifest, dispose() {} }, { visualScale: 1.3225 });
  t.after(() => actors.dispose());
  g.enemies = [surgeon];
  // The Surgeon faces +x; the player is placed on a grid in front of it (the view trace needs no ground).
  surgeon.facing = { x: 1, z: 0 };
  g.player.facing = { x: -1, z: 0 };
  const rows = [];
  for (const side of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) {
    let row = "";
    for (const gap of GAPS) {
      g.player.pos = { x: surgeon.pos.x + gap, z: surgeon.pos.z + side };
      actors.update(g, 0);
      row += actors.sawContact(g, surgeon, g.player) ? "1" : "0";
    }
    rows.push(row);
  }
  // Positive control: a player standing on the blade itself is touched by the plain hand-height trace.
  const blade = actors.views.get(surgeon.id).knife,
    tip = blade.localToWorld(new T.Vector3(0, 0.65, 0));
  g.player.pos = { x: tip.x, z: -tip.z };
  actors.update(g, 0);
  const control = actors.sawContact(g, surgeon, g.player);
  console.log("SAW_PLAYER_PROBE", JSON.stringify({ rows, control }));
  if (PINNED) assert.deepEqual({ rows, control }, PINNED);
});
