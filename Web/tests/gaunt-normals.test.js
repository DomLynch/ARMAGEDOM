import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createGauntShapeLibrary } from "../src/gaunt-shape.js";
import { recomputeNormals } from "../src/geometry-normals.js";

// The shipped hollow body stores int8 interleaved normals. computeVertexNormals on a clone of it left every normal zero, which lit the
// gaunt hollow pure black in Westminster; recomputeNormals swaps in a float attribute first.
const hollow = () => loadGeometry(fs.readFileSync(new URL("../public/assets/hollow-scavenger/hollow-scavenger-phone.glb", import.meta.url)));

// How many vertices the index draws that have no usable normal.
function drawnWithoutNormal(geometry) {
  const normals = geometry.getAttribute("normal"),
    drawn = new Set(geometry.index.array);
  let bad = 0;
  for (const i of drawn) if (Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) > 0.05) bad++;
  return bad;
}

test("the hollow body ships quantised normals, and a plain computeVertexNormals on a clone zeroes them", async () => {
  const { scene } = await hollow();
  let checked = 0;
  scene.traverse((m) => {
    if (m.name !== "mesh_2_1") return;
    checked++;
    assert(!(m.geometry.getAttribute("normal").array instanceof Float32Array));
    const plain = m.geometry.clone();
    plain.computeVertexNormals();
    assert(drawnWithoutNormal(plain) > 0, "this is the bug recomputeNormals avoids");
  });
  assert.equal(checked, 1);
});

test("recomputeNormals leaves every drawn vertex with a unit normal", async () => {
  const { scene } = await hollow();
  scene.traverse((m) => {
    if (!m.name.startsWith("mesh_2")) return;
    const clone = m.geometry.clone();
    recomputeNormals(T, clone);
    assert(clone.getAttribute("normal").array instanceof Float32Array);
    assert.equal(drawnWithoutNormal(clone), 0, m.name);
  });
});

test("the gaunt shape library keeps unit normals on the body and jacket it reshapes", async () => {
  const { scene } = await hollow(),
    library = createGauntShapeLibrary(scene);
  const handle = library.apply(scene);
  let reshaped = 0;
  scene.traverse((m) => {
    if (!m.isSkinnedMesh || !m.geometry.index || m.geometry.getAttribute("normal").array instanceof Int8Array) return;
    reshaped++;
    assert.equal(drawnWithoutNormal(m.geometry), 0, m.name);
  });
  assert(reshaped >= 5, "the garment and body meshes were reshaped");
  handle.dispose();
  library.dispose();
});
