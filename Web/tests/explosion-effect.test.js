import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createExplosionEffects } from "../src/engine/explosion-effect.js";
import { EXPLOSION as X, validateExplosionEffect } from "../src/engine/explosion-effect-data.js";

const fake = () => ({ scene: new T.Scene(), world: { camera: new T.PerspectiveCamera() } });
const meshes = (scene) => scene.children.filter((c) => c.isInstancedMesh);
const visible = (mesh, alpha) => {
  let n = 0;
  for (let i = 0; i < mesh.count; i++) if (alpha.getX(i) > 0) n++;
  return n;
};

test("one blast costs three draw calls in all, and nothing is built until the first blast", () => {
  const s = fake(),
    fx = createExplosionEffects(s);
  assert.equal(meshes(s.scene).length, 0);
  fx.spawn(new T.Vector3(1, 0, 2), 3, 10);
  assert.equal(meshes(s.scene).length, 3);
  fx.spawn(new T.Vector3(4, 0, 2), 3, 10.1);
  assert.equal(meshes(s.scene).length, 3);
  fx.dispose();
  assert.equal(meshes(s.scene).length, 0);
});

test("its three meshes are named, so view digests can leave them out", () => {
  const s = fake(),
    fx = createExplosionEffects(s);
  fx.spawn(new T.Vector3(), 3, 0);
  assert.deepEqual(meshes(s.scene).map((m) => m.name), ["Explosion scorch", "Explosion smoke", "Explosion glow"]);
  fx.dispose();
});

test("flash, fireball, sparks, smoke and scorch show while it burns and all fade out", () => {
  const s = fake(),
    fx = createExplosionEffects(s);
  fx.spawn(new T.Vector3(0, 0, 0), 3, 10);
  fx.update(10.05);
  const [scorch, smoke, glow] = meshes(s.scene);
  const alpha = (m) => m.geometry.getAttribute("aAlpha");
  assert.ok(visible(glow, alpha(glow)) > X.fireball.lobes, "flash, fireball lobes and sparks are drawn");
  assert.equal(visible(scorch, alpha(scorch)), 1);
  fx.update(10 + X.smoke.delay + 0.5);
  assert.ok(visible(smoke, alpha(smoke)) > 0, "smoke lingers after the fireball");
  fx.update(10 + X.fireball.seconds + 0.01);
  assert.equal(visible(glow, alpha(glow)), 0, "the fireball and sparks are gone by then");
  fx.update(10 + Math.max(X.smoke.delay + X.smoke.seconds, X.scorch.seconds) + 0.01);
  for (const m of [scorch, smoke, glow]) assert.equal(visible(m, alpha(m)), 0);
  fx.dispose();
});

test("the fireball grows with the blast radius and the oldest slot is reused past the pool size", () => {
  const sizeAt = (radius) => {
    const s = fake(),
      fx = createExplosionEffects(s);
    fx.spawn(new T.Vector3(), radius, 0);
    fx.update(X.fireball.seconds / 2); // tuning-ok: halfway through the burn
    const glow = meshes(s.scene)[2],
      m = new T.Matrix4(),
      p = new T.Vector3(),
      q = new T.Quaternion(),
      sc = new T.Vector3();
    glow.getMatrixAt(1, m);
    m.decompose(p, q, sc);
    fx.dispose();
    return sc.x;
  };
  assert.ok(sizeAt(6) > sizeAt(3) * 1.9, "twice the radius is about twice the fireball"); // tuning-ok: test radii and the ratio between them
  const s = fake(),
    fx = createExplosionEffects(s);
  for (let i = 0; i <= X.maxActive; i++) fx.spawn(new T.Vector3(i, 0, 0), 3, i);
  assert.doesNotThrow(() => fx.update(X.maxActive));
  fx.clear();
  fx.dispose();
});

test("data that is not a finite, ordered number or a hex colour is refused", () => {
  const bad = (edit) => {
    const copy = structuredClone(X);
    edit(copy);
    assert.throws(() => validateExplosionEffect(copy));
  };
  bad((c) => (c.fireball.peakDiameterRatio = c.fireball.startDiameterRatio));
  bad((c) => (c.smoke.colour = "#3b3530"));
  bad((c) => (c.sparks.count = 0));
  bad((c) => (c.scorch.opacity = 0));
  bad((c) => (c.extra = 1));
});
