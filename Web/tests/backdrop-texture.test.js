import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { createWorld, backdropTextureBytes } from "../src/world.js";

// The area backdrop is never drawn smaller than its pixels (view zoom >= 1), so it is uploaded without a mip chain: no mip generation at
// area preparation, a third less GPU memory, and the budget counts it at 1x instead of the 7/3 it was charged before.
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));

test("backdropTextureBytes counts 1x for an unmipped backdrop and 4/3 for a mipped texture", () => {
  const texture = { image: { width: 1672, height: 941 } };
  assert.equal(backdropTextureBytes(texture), 1672 * 941 * 4);
  assert.equal(backdropTextureBytes(texture, true), (1672 * 941 * 4 * 4) / 3);
  assert.equal(backdropTextureBytes({}), 0);
});

test("the world's backdrop texture has no mipmaps and linear filters, and is charged 1x", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => read("../public/" + new URL(url).pathname.slice(1)),
  });
  t.after(() => {
    globalThis.fetch = original;
  });
  const loaded = [];
  class Loader {
    async loadAsync() {
      const texture = new T.Texture({ width: 1672, height: 941 });
      loaded.push(texture);
      return texture;
    }
  }
  const world = await createWorld({
    THREE: { ...T, TextureLoader: Loader },
    scene: new T.Scene(),
    camera: new T.PerspectiveCamera(),
    baseUrl: "https://fixture.invalid/",
  });
  t.after(() => world.dispose());
  const texture = loaded[0];
  assert.equal(texture.generateMipmaps, false);
  assert.equal(texture.minFilter, T.LinearFilter);
  assert.equal(texture.magFilter, T.LinearFilter);
  assert.equal(world.textureBytes(), 1672 * 941 * 4);
  assert.equal(world.preparationStats().estimatedTextureBytes, 1672 * 941 * 4);
});
