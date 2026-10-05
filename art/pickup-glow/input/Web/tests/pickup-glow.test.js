import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {addPickupGlow} from '../src/pickup-glow.js';

test('instanced rounds preserve transforms and borrowed resources; disposal restores originals once', () => {
  for (const count of [1, 2, 3]) {
    const geometry = new T.CylinderGeometry(.018, .019, .11, 8);
    const texture = new T.Texture();
    const original = new T.MeshStandardMaterial({color: 0xb49a65, map: texture});
    const mesh = new T.InstancedMesh(geometry, original, count);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, new T.Matrix4().makeTranslation(i, .022, .066*i));
    const matrices = [...mesh.instanceMatrix.array];
    let borrowedDisposals = 0, ownedDisposals = 0;
    for (const r of [geometry, original, texture]) r.addEventListener('dispose', () => borrowedDisposals++);
    const handle = addPickupGlow(mesh);
    mesh.material.addEventListener('dispose', () => ownedDisposals++);
    assert.notEqual(mesh.material, original);
    assert.equal(mesh.material.map, texture);
    assert.equal(mesh.geometry, geometry);
    assert.deepEqual([...mesh.instanceMatrix.array], matrices);
    assert.equal(mesh.material.depthTest, true);
    assert.equal(mesh.material.depthWrite, true);
    assert.equal(original.emissiveIntensity, 1);
    assert.equal(original.emissive.getHex(), 0);
    handle.dispose(); handle.dispose();
    assert.equal(mesh.material, original);
    assert.equal(borrowedDisposals, 0);
    assert.equal(ownedDisposals, 1);
    geometry.dispose(); original.dispose(); texture.dispose(); mesh.dispose();
  }
});

test('multi-material items restore identity; equipped skinned cloth is rejected without mutation', () => {
  const geometry = new T.BoxGeometry(), sources = [new T.MeshStandardMaterial(), new T.MeshStandardMaterial()];
  const mesh = new T.Mesh(geometry, sources), handle = addPickupGlow(mesh);
  assert.equal(mesh.material.length, 2);
  assert.ok(mesh.material.every((m, i) => m !== sources[i]));
  handle.dispose(); assert.equal(mesh.material, sources);
  const cloth = new T.SkinnedMesh(geometry, sources[0]);
  assert.throws(() => addPickupGlow(cloth), TypeError);
  assert.equal(cloth.material, sources[0]);
  geometry.dispose(); sources.forEach(m => m.dispose());
});
