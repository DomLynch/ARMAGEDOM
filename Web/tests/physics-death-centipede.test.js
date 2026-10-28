// The real centipede GLB's node tree driven by the package's chain ragdoll: the leg banks must move, and every follower bone must copy its bank's rotation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildChainRow, chainRigOptions, createPhysics, loadChainBody } from "@frankendom/physics";
import { createThreeRig } from "@frankendom/physics/three-rig";

// The GLB's node tree as plain Object3Ds (names, translation, rotation, scale), as GLTFLoader would build it.
function sceneOf(url) {
  const b = readFileSync(new URL(`../public/assets/${url}`, import.meta.url)),
    json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()),
    make = (i) => {
      const n = json.nodes[i],
        o = new THREE.Object3D();
      o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? `node${i}`);
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      for (const c of n.children ?? []) o.add(make(c));
      return o;
    },
    scene = new THREE.Group();
  for (const i of json.scenes[0].nodes) scene.add(make(i));
  return scene;
}

test("the centipede's leg banks move when it dies and the follower bones copy the bank rotation", async () => {
  const body = loadChainBody("centipede"),
    row = buildChainRow({ ...body.spec, scale: 1 }, body.bones),
    world = await createPhysics({ seed: 1 }),
    model = sceneOf("centipede/giant-centipede.glb"),
    bind = sceneOf("centipede/giant-centipede.glb"),
    root = new THREE.Group(),
    find = (scene) => (name) => scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  root.add(model);
  const r = chainRigOptions(body, find(model), { bindFind: find(bind), bindRoot: bind }),
    rd = world.createRagdoll(structuredClone(row), { position: [0, 0, 0], id: "centipede" }),
    rig = createThreeRig(THREE, rd, r.bones, root, r.options);
  rig.drive();
  rd.snapToTarget();
  const banks = Object.entries(body.followMap),
    rest = new Map(banks.map(([part]) => [part, r.bones[part].quaternion.clone()]));
  assert.ok(banks.length > 0, "the centipede has follower banks");
  rd.kill({ part: "seg2", impulse: [0, 40, 260] });
  for (let i = 0; i < 90; i++) world.step(1 / 60);
  rig.applyPose();
  let moved = 0;
  for (const [part, followers] of banks) {
    const q = r.bones[part].quaternion;
    const angle = q.angleTo(rest.get(part));
    if (angle > 1e-3) moved++;
    if (process.env.CENTIPEDE_TRACE) console.log(`bank ${part}: ${((angle * 180) / Math.PI).toFixed(2)} deg from bind, followers ${followers.join(",")}`);
    followers.forEach((name, k) => {
      const f = find(model)(name);
      assert.ok(
        f.quaternion.angleTo(q) < 1e-6,
        `${name} copies ${part}: ${f.quaternion.toArray()} vs ${q.toArray()} (${f.quaternion.angleTo(q)} rad)`,
      );
      assert.ok(r.options.follow[part][k] === f, `${name} is the follower object`);
    });
  }
  assert.ok(moved > 0, "at least one leg bank rotated away from its bind pose");
});
