import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { LondonWorld } from "../src/world.js";
import { resolveGuidance, capsuleSegmentClear } from "../src/engine/route-guidance.js";

// Differential test: the numbers route-guidance.js reads from data produce exactly the geometry, colours, reach distances and hint
// text the inline literals did. The expected digest was recorded from the code before the move
// (UPDATE_ROUTE_GUIDANCE_DIGEST=1 rewrites it; do that only for an intended presentation change).
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const manifest = read("../public/world/manifest.json"),
  fixture = read("./fixtures/phone-guidance-positions.json"),
  digestPath = new URL("./fixtures/route-guidance-values.json", import.meta.url);
const digest = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const arr = (a) => Array.from(a, (n) => Math.round(n * 1e9) / 1e9);

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
            get:
              (_, k) =>
              (...a) =>
                calls.push([String(k), ...a]),
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
        cue = world.routeGuidance,
        entry = { rows: cue.rows.length };
      if (cue.barrier) {
        const attrs = cue.barrier.geometry.attributes;
        entry.barrier = digest([arr(attrs.position.array), arr(attrs.color.array), Array.from(cue.barrier.geometry.index.array)]);
      }
      entry.arrow = digest([arr(cue.arrow.geometry.attributes.position.array), cue.arrow.material.color.getHex()]);
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
          const c = world.routeGuidance.resolve(p),
            a = world.routeGuidance.arrow;
          entry.hints.push([
            world.exitHint(p),
            c && [c.index, c.gap, c.remaining, c.target],
            a.visible,
            arr(a.position.toArray()),
            a.rotation.y,
          ]);
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
      out[area] = entry;
      world.dispose();
    }
  } finally {
    globalThis.document = savedDocument;
  }
  return out;
}

test("route guidance geometry, colours, reach and hints are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_ROUTE_GUIDANCE_DIGEST) fs.writeFileSync(digestPath, JSON.stringify(got, null, 1) + "\n");
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath)));
});
