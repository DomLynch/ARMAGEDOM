import * as T from "three";
import { FINISHER_DATA } from "../../src/engine/finisher-data.js";
import { createLocalWound } from "../../src/engine/local-wound.js";

const round = (n) => Math.round(n * 1e6) / 1e6;
const anchors = [
  { position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, tangent: { x: 1, y: 0, z: 0 }, surfaceRadius: 0.2 },
  {
    position: { x: 0.3, y: 1.2, z: -0.1 },
    normal: { x: 0.2, y: 0.1, z: 0.9 },
    tangent: { x: 1, y: 0.2, z: 0 },
    surfaceRadius: 0.05,
  },
  { position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, tangent: { x: 1, y: 0, z: 0 }, surfaceRadius: 0.014 },
];

// Everything the wound builds from its numbers: mesh buffers, per-style colours and the placed matrix for each anchor.
export function localWoundTrace() {
  const out = {};
  for (const styleId of Object.keys(FINISHER_DATA.gore.wound.styles)) {
    const parent = new T.Group();
    const wound = createLocalWound({ THREE: T, parent, profile: FINISHER_DATA.gore.wound });
    const mesh = parent.children[0];
    const geometry = mesh.geometry;
    const row = { stats: wound.stats(), placed: [] };
    for (const anchor of anchors) {
      wound.reset();
      const ok = wound.start({ victimId: 1, styleId, anchor: { surfaceValidated: true, ...anchor } });
      row.placed.push({ ok, visible: mesh.visible, matrix: ok ? mesh.matrix.elements.map(round) : null });
    }
    wound.reset();
    wound.start({ victimId: 1, styleId, anchor: { surfaceValidated: true, ...anchors[0] } });
    row.positions = Array.from(geometry.getAttribute("position").array, round);
    row.colors = Array.from(geometry.getAttribute("color").array, round);
    row.index = Array.from(geometry.index.array);
    row.tint = mesh.material.color.getHex();
    out[styleId] = row;
  }
  return out;
}
