import test from "node:test";
import assert from "node:assert/strict";
import { WEAPON_TILES, validateWeaponTiles } from "../src/engine/weapon-tiles-data.js";
import { TILE_FLASH_SECONDS } from "../src/engine/weapon-tiles.js";

// The numbers that were inline in engine/weapon-tiles.js before they moved to visual.json `weaponTiles`.
test("the weapon tile strip keeps its pre-data numbers", () => {
  assert.deepEqual(WEAPON_TILES, { pistolCapacity: 6, tapSlopPx: 10, flashSeconds: 5, emptyMessageSeconds: 4, pageSize: 3, pageWidthPx: 168 });
  assert.equal(TILE_FLASH_SECONDS, 5);
});

test("a bad weaponTiles row is refused", () => {
  const bad = (edit) => {
    const copy = structuredClone(WEAPON_TILES);
    edit(copy);
    assert.throws(() => validateWeaponTiles(copy));
  };
  bad((t) => (t.pageSize = 0));
  bad((t) => (t.pageSize = 1.5));
  bad((t) => (t.pageWidthPx = 0));
  bad((t) => (t.flashSeconds = Number.NaN));
  bad((t) => (t.extra = 1));
});
