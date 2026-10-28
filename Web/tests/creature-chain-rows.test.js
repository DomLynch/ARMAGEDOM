// creatureChainRows.json against the shipped GLBs: every bone name is a real node of the skeleton, the measured lengths are the rest-pose
// distances, the scale is the manifest scale. Reads only the GLB JSON chunk (no decoder needed for node names and transforms).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateCreatureChainRows } from "../src/engine/game-data-creature-chains.js";

const ASSETS = new URL("../public/assets/", import.meta.url);
const ROWS = GAME_DATA.creatureChainRows.rows;
const clone = () => JSON.parse(JSON.stringify(GAME_DATA.creatureChainRows));
const MODELS = ["giant-salamander", "original-rat", "rat-king", "original-crow", "original-spider", "giant-centipede", "giant-eel",
  "original-elephant", "original-wolf", "original-dog", "vagrant-106", "low-hover-drone"];

function glbJson(path) {
  const b = readFileSync(new URL(path, ASSETS));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}
function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const [t, [x, y, z, w], s] = [n.translation ?? [0, 0, 0], n.rotation ?? [0, 0, 0, 1], n.scale ?? [1, 1, 1]];
  const m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z),
    2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  return m;
}
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function skeleton(json) {
  const parent = {};
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const cache = {};
  const world = (i) => (cache[i] ??= parent[i] === undefined ? localMatrix(json.nodes[i]) : multiply(world(parent[i]), localMatrix(json.nodes[i])));
  const byName = new Map(json.nodes.map((n, i) => [n.name, i]));
  return { byName, position: (name) => world(byName.get(name)).slice(12, 15) };
}

test("the rows cover every creature model Dom ordered and validate", () => {
  for (const id of MODELS) assert.ok(ROWS[id], `${id} has a row`);
  assert.doesNotThrow(() => validateCreatureChainRows(clone()));
});

test("every row is inert", () => {
  for (const [id, row] of Object.entries(ROWS)) assert.equal(row.live, false, id);
});

test("every bone, boneMap target and segment bone exists in the real GLB skeleton", () => {
  for (const [id, row] of Object.entries(ROWS)) {
    if (!row.glb) continue;
    const json = glbJson(row.glb);
    const nodes = new Set(json.nodes.map((n) => n.name));
    const joints = new Set(json.skins[0].joints.map((j) => json.nodes[j].name));
    assert.deepEqual([...row.bones].sort(), [...joints].sort(), `${id}: bones are the skin joints`);
    for (const [part, bone] of Object.entries(row.boneMap)) assert.ok(nodes.has(bone), `${id}: ${part} -> ${bone}`);
    for (const s of row.segments) for (const bone of [s.bone, s.tip]) assert.ok(nodes.has(bone), `${id}: ${s.id} ${bone}`);
    for (const bone of row.missingBones ?? []) assert.ok(!nodes.has(bone), `${id}: ${bone} is really missing`);
    for (const bone of row.nodeBones ?? []) assert.ok(nodes.has(bone) && !joints.has(bone), `${id}: ${bone} is a node, not a skin joint`);
  }
});

test("segment lengths are the GLB rest-pose bone distances", () => {
  for (const [id, row] of Object.entries(ROWS)) {
    if (!row.segments.length) continue;
    const sk = skeleton(glbJson(row.glb));
    for (const s of row.segments) {
      const a = sk.position(s.bone), b = sk.position(s.tip);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      assert.ok(Math.abs(length - s.lengthModel) < 0.0005, `${id}: ${s.id} measures ${length}, row says ${s.lengthModel}`);
    }
  }
});

test("the scale is the manifest scale and the creature definition's model scale", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest-hollow.json", ASSETS), "utf8")).models;
  for (const [id, row] of Object.entries(ROWS)) {
    if (row.glb) assert.equal(manifest[id].scale, row.modelScale, `${id}: manifest scale`);
    if (row.glb) assert.equal(manifest[id].url, row.glb, `${id}: manifest url`);
    if (row.definitionId) {
      const def = GAME_DATA.creatureDefinitions.definitions.find((d) => d.id === row.definitionId);
      assert.equal(def.scale.model, row.modelScale, `${id}: definition scale`);
    }
  }
});

test("the rig root node scale is recorded (the centipede carries 0.6 on its armature)", () => {
  assert.deepEqual(ROWS["giant-centipede"].rigNodeScale, [0.6, 0.6, 0.6]);
  assert.deepEqual(ROWS["giant-salamander"].rigNodeScale, [1, 1, 1]);
});

test("the validator rejects a live row, a bad bone and a wrong sim root", () => {
  const live = clone();
  live.rows["giant-salamander"].live = true;
  assert.throws(() => validateCreatureChainRows(live), /live must be false/);
  const bone = clone();
  bone.rows["original-rat"].segments[1].bone = "no_such_bone";
  assert.throws(() => validateCreatureChainRows(bone), /not in bones/);
  const root = clone();
  root.rows["original-wolf"].simRoot.scale = 2.5;
  assert.throws(() => validateCreatureChainRows(root), /sim root is unscaled/);
});
