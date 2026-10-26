import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createRemotePlayersView } from "../src/engine/remote-players-view.js";

// Differential test: the capsule figures (sizes, segment counts, hue per id, colour) and the name tags (canvas card, sprite scale and
// height) are exactly what the inline numbers drew. The expected snapshot was recorded from the code before the numbers moved to
// visual.json `remotePlayers` (UPDATE_REMOTE_VIEW_DIGEST=1 rewrites it; only for an intended change).
const digestPath = new URL("./fixtures/remote-players-view-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;

function snapshot() {
  const saved = globalThis.document,
    calls = [];
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () =>
        new Proxy(
          {},
          {
            get:
              (_, k) =>
              (...a) =>
                calls.push([String(k), ...a]),
            set: (_, k, v) => (calls.push(["set", String(k), v]), true),
          },
        );
      calls.push(["canvas", canvas]);
      return canvas;
    },
  };
  try {
    const scene = new THREE.Scene(),
      view = createRemotePlayersView({ scene, toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z) }),
      samples = [1, 2, 5, 13, 47, 200].map((id, i) => ({ id, x: i * 1.5, z: -i, facing: i * 0.4, moving: i % 2 === 0, name: i % 2 ? "Hale" : null }));
    view.update(samples);
    const figures = view.group.children.map((root) => ({
      name: root.name,
      position: root.position.toArray().map(round),
      rotation: round(root.rotation.y),
      children: root.children.map((c) => ({
        type: c.type,
        name: c.name,
        position: c.position.toArray().map(round),
        scale: c.scale.toArray().map(round),
        parts: c.children.map((m) => ({
          type: m.type,
          geometry: m.geometry.parameters,
          y: round(m.position.y),
          colour: m.material.color.getHex(),
          hsl: (() => {
            const o = {};
            m.material.color.getHSL(o);
            return [round(o.h), round(o.s), round(o.l)];
          })(),
        })),
      })),
    }));
    const out = { figures, canvas: calls.map((c) => (c[0] === "canvas" ? ["canvas", c[1].width, c[1].height] : c)), labels: [...view.labels()] };
    view.dispose();
    return JSON.parse(JSON.stringify(out));
  } finally {
    globalThis.document = saved;
  }
}

test("remote player figures and name tags are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_REMOTE_VIEW_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert.equal(got.figures.length, 6);
});
