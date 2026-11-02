import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { shareIdenticalTextures } from "../src/actor-texture-share.js";

// A glTF stand-in: `images` are the byte strings of the file's images, `materials` map a slot to an image index.
function file(images, materials, sampler = {}) {
  const textures = images.map((_, i) => new THREE.Texture());
  textures.forEach((t, i) => {
    t.source.data = {
      close() {
        t.closed = true;
      },
      i,
    };
    Object.assign(t, sampler);
  });
  const associations = new Map(textures.map((t, i) => [t, { textures: i }]));
  const scene = new THREE.Group();
  const made = materials.map((slots) => {
    const material = new THREE.MeshStandardMaterial();
    for (const [slot, i] of Object.entries(slots)) material[slot] = textures[i];
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    return material;
  });
  const json = { textures: images.map((_, i) => ({ source: i })), images: images.map((_, i) => ({ bufferView: i })) };
  const parser = {
    json,
    associations,
    getDependency: async (type, index) => new Uint8Array(images[index]).buffer,
  };
  return { gltf: { scene, parser }, textures, materials: made };
}

test("identical image bytes become one texture across files; the later copy is released before upload", async () => {
  const pool = new Map();
  const a = file(
    [
      [1, 2, 3],
      [9, 9],
    ],
    [{ map: 0, roughnessMap: 1 }],
  );
  const b = file(
    [
      [1, 2, 3],
      [7, 7],
    ],
    [{ map: 0, roughnessMap: 1 }],
  );
  assert.equal(await shareIdenticalTextures(a.gltf, pool), 0);
  assert.equal(await shareIdenticalTextures(b.gltf, pool), 1);
  assert.equal(b.materials[0].map, a.textures[0], "same bytes: the first texture is reused");
  assert.notEqual(b.materials[0].roughnessMap, a.textures[1], "different bytes stay separate");
  assert.equal(b.materials[0].roughnessMap, b.textures[1]);
  assert.equal(b.textures[0].closed, true, "the superseded decoded bitmap is closed");
  assert.notEqual(a.textures[0].closed, true);
  assert.equal(pool.size, 3);
});

test("a different sampler state or colour space keeps its own texture", async () => {
  const pool = new Map();
  const a = file([[5, 5]], [{ map: 0 }]);
  const b = file([[5, 5]], [{ map: 0 }], { colorSpace: THREE.SRGBColorSpace });
  const c = file([[5, 5]], [{ map: 0 }], { wrapS: THREE.RepeatWrapping });
  await shareIdenticalTextures(a.gltf, pool);
  assert.equal(await shareIdenticalTextures(b.gltf, pool), 0);
  assert.equal(await shareIdenticalTextures(c.gltf, pool), 0);
  assert.equal(pool.size, 3);
});

test("one texture used by several materials in the same file is swapped everywhere and nothing shared is closed", async () => {
  const pool = new Map();
  const a = file([[4, 4]], [{ map: 0 }]);
  const b = file([[4, 4]], [{ map: 0 }, { map: 0, emissiveMap: 0 }]);
  await shareIdenticalTextures(a.gltf, pool);
  assert.equal(await shareIdenticalTextures(b.gltf, pool), 1);
  for (const m of b.materials) assert.equal(m.map, a.textures[0]);
  assert.equal(b.materials[1].emissiveMap, a.textures[0]);
  assert.equal(a.textures[0].closed, undefined);
});

test("a bitmap another kept texture still uses is not closed", async () => {
  const pool = new Map();
  const a = file([[3, 3]], [{ map: 0 }]);
  const b = file([[3, 3]], [{ map: 0 }]);
  const spare = b.textures[0].clone();
  spare.wrapS = THREE.RepeatWrapping;
  b.materials[0].normalMap = spare; // same Source as b's map, different sampler: it stays, so the bitmap must stay open
  b.gltf.parser.associations.set(spare, { textures: 0 });
  await shareIdenticalTextures(a.gltf, pool);
  await shareIdenticalTextures(b.gltf, pool);
  assert.equal(b.materials[0].map, a.textures[0]);
  assert.equal(b.materials[0].normalMap, spare);
  assert.equal(b.textures[0].closed, undefined);
});

test("files without a parser, unreadable bytes and insecure origins are left alone", async () => {
  const scene = new THREE.Group();
  assert.equal(await shareIdenticalTextures({ scene }, new Map()), 0);
  const a = file([[1]], [{ map: 0 }]);
  a.gltf.parser.getDependency = async () => {
    throw Error("boom");
  };
  assert.equal(await shareIdenticalTextures(a.gltf, new Map()), 0);
  assert.equal(a.materials[0].map, a.textures[0]);
});
