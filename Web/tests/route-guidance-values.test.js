import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LondonWorld } from "../src/world.js";
import { resolveGuidance, capsuleSegmentClear } from "../src/engine/route-guidance.js";

// Differential test: the numbers route-guidance.js reads from data produce exactly the geometry, colours, reach distances and hint
// text the inline literals did. The expected digest was recorded from the code before the move
// (UPDATE_ROUTE_GUIDANCE_DIGEST=1 rewrites it; do that only for an intended presentation change). Re-pinned for the worn ammo crate and
// medkit (worldPickups.json looks, finish and contour): only the pickup meshes moved, on purpose.
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const manifest = read("../public/world/manifest.json"),
  fixture = read("./fixtures/phone-guidance-positions.json"),
  digestPath = new URL("./fixtures/route-guidance-values.json", import.meta.url);
const digest = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const round = (n) => Math.round(n * 1e9) / 1e9;
const arr = (a) => Array.from(a, round);

function snapshot() {
  const out = {},
    savedDocument = globalThis.document,
    calls = [];
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () =>
        new Proxy(
          {},
          {
            // A gradient is an object with addColorStop (the pickup ground rings draw one); every other call just logs.
            get:
              (_, k) =>
              (...a) => {
                calls.push([String(k), ...a]);
                return k === "createRadialGradient" ? { addColorStop: (...s) => calls.push(["addColorStop", ...s]) } : calls.length;
              },
            set: (_, k, v) => (calls.push(["set", String(k), v]), true),
          },
        ),
    }),
  };
  try {
    for (const area of Object.keys(fixture.baselineLayouts)) {
      const layout = read(`../public/world/${area}/layout.json`),
        scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(),
        world = new LondonWorld({ THREE, scene, camera, layout, texture: new THREE.Texture(), manifest });
      world.areaId = area;
      const g = world.geometry,
        cue = world.routeGuidance;
      if (!cue) {
        // Lambeth lost its road-boundary rails with the exits they led to; an area with no guidance rows has no cue object at all.
        out[area] = { rows: 0 };
        world.dispose();
        continue;
      }
      const entry = { rows: cue.rows.length };
      if (cue.barrier) {
        const attrs = cue.barrier.geometry.attributes;
        entry.barrier = digest([arr(attrs.position.array), arr(attrs.color.array), Array.from(cue.barrier.geometry.index.array)]);
      }
      entry.markers = cue.group.children
        .filter((c) => c.isGroup)
        .map((m) => [
          m.name,
          arr(m.position.toArray()),
          m.children.map((c) => [
            c.type,
            c.geometry?.parameters ?? null,
            c.material?.color?.getHex?.() ?? null,
            arr(c.rotation.toArray().slice(0, 3)),
            arr(c.scale.toArray()),
            arr(c.position.toArray()),
          ]),
        ]);
      entry.canvas = digest(calls.splice(0));
      entry.hints = [];
      const row = fixture.rows.find((r) => r.area === area);
      if (row) {
        const p = g.ground(row.representative);
        world.areaId = "westminster";
        for (const size of [
          [393, 695],
          [844, 390],
        ]) {
          world.update(p, 0, ...size, true);
          const c = world.routeGuidance.resolve(p);
          entry.hints.push([world.exitHint(p), c && [c.index, c.gap, c.remaining, c.target]]);
        }
        world.areaId = area;
      }
      const reach = [];
      for (let ix = 0; ix <= 10; ix++)
        for (let iy = 0; iy <= 10; iy++) {
          const p = g.ground({ x: ix / 10, y: iy / 10 });
          if (!g.clear(p, 0.4)) continue;
          const c = resolveGuidance(cue.rows, g, p);
          reach.push(c ? [c.index, c.gap, c.remaining, c.target, capsuleSegmentClear(g, p, c.target)] : null);
        }
      entry.reach = digest(reach);
      // Waypoint pick distance (a point only counts as the next waypoint when it is further than half a metre) and the pistol, hunt and
      // arrival thresholds: probe either side of each.
      const edge = [];
      for (const row of cue.rows)
        for (const wp of row.path)
          for (const off of [0.45, 0.49, 0.51, 0.55]) {
            const p = { x: wp.x + off, z: wp.z };
            if (!g.clear(p, 0.4)) continue;
            const c = resolveGuidance(cue.rows, g, p);
            edge.push(c ? [c.index, c.gap, c.remaining, c.target] : null);
          }
      entry.edge = digest(edge);
      const probe = row ? g.ground(row.representative) : g.ground({ x: 0.5, y: 0.5 }),
        cues = [];
      cue.setTutorial(true);
      for (const d of [0.2, 0.29, 0.31, 1]) {
        cue.setPistolTarget({ x: probe.x + d, z: probe.z });
        const c = cue.resolve({ ...probe });
        cues.push([c?.row.kind, c?.remaining, cue.hint({ ...probe }, { areaId: "westminster", travelAt: () => null, toRender: world.toRender.bind(world), camera: world.camera })]);
      }
      cue.setPistolTarget(null);
      cue.setTutorial(false);
      for (const d of [1.4, 1.49, 1.51, 3]) {
        cue.setHuntTarget({ pos: { x: probe.x + d, z: probe.z }, label: "KILL" });
        const c = cue.resolve({ ...probe });
        cues.push([c?.row.kind, c?.remaining]);
      }
      cue.setHuntTarget(null);
      for (const d of [3.9, 4.1]) {
        cue.arrive(cue.rows[0]?.to ?? "elsewhere", { x: probe.x, z: probe.z });
        const c = cue.resolve({ x: probe.x + d, z: probe.z });
        cues.push([c?.row.id, c?.remaining]);
      }
      entry.cues = cues.map((c) => c.map((v) => (typeof v === "number" ? round(v) : (v ?? null))));
      out[area] = entry;
      world.dispose();
    }
  } finally {
    globalThis.document = savedDocument;
  }
  return out;
}

// Re-pinned 28 Oct 2026 (pickup readability, #399): every area now builds ground rings and name labels under its pickups (new meshes
// and canvas draws), so the `meshes` and `canvas` digests changed. Intentional; the guidance geometry, colours, reach and hints did not.
// Re-pinned 28 Oct 2026 (art/south-clear-crates-hedgehog): only the south `reach` digest moved, because the painted-out crate stack's blocker left
// south/layout.json and the walkable ground grew. Intentional; the geometry, colours and hints did not.
// Re-pinned 28 Oct 2026 (gold coins, treasure-pile look): the cash stash now draws its glow-pool and glint textures on a canvas, so only the `canvas`
// digest of the areas with a stash moved. Intentional; the guidance geometry, colours, reach and hints did not.
test("route guidance geometry, colours, reach and hints are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_ROUTE_GUIDANCE_DIGEST) fs.writeFileSync(digestPath, JSON.stringify(got, null, 1) + "\n");
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath)));
});
