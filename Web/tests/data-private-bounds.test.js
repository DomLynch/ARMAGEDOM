import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { residentEncounterHealth } from "../src/area-mob-spawns.js";
import { preparePrivateAreaContent } from "../src/engine/private-area-content.js";
import { GAME_DATA, validateSpawns } from "../src/engine/game-data.js";

// Data batch 15 (World): the resident encounter health ceiling (area-mob-spawns.js, 120) moved to data/spawns.json `maxResidentHealth`,
// and the private area texture budget bounds (private-area-content.js, 16 and 48 MiB) read the same `view` rows as world.js.
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("the values are the old literals", () => {
  assert.equal(GAME_DATA.spawns.maxResidentHealth, 120);
  assert.equal(GAME_DATA.areaRuntime.view.textureBudgetMinMiB, 16);
  assert.equal(GAME_DATA.areaRuntime.view.textureBudgetMiB, 48);
});

test("a resident encounter health of 1 to 120 passes and 0 or 121 is refused", () => {
  const row = (health) => ({ encounter: { health } });
  assert.equal(residentEncounterHealth(row(1), 40), 1);
  assert.equal(residentEncounterHealth(row(120), 40), 120);
  assert.throws(() => residentEncounterHealth(row(0), 40), /Invalid resident encounter health/);
  assert.throws(() => residentEncounterHealth(row(121), 40), /Invalid resident encounter health/);
  assert.equal(residentEncounterHealth({}, 40), 40);
});

test("a private area texture budget from 16 to 48 MiB passes and one byte outside is refused", () => {
  const fixture = (bytes) => ({
    areas: read("./fixtures/private-fourth/private-registry-rows.json"),
    manifest: read("./fixtures/private-fourth/private-manifest.json"),
    residents: read("./fixtures/private-fourth/private-residents.json"),
    layouts: Object.fromEntries(
      ["westminster", "east", "south"].map((id) => [`layout.${id}`, read(`../public/world/${id}/layout.json`)]),
    ),
    namespace: "armagedom:private:fourth-pilot:",
    textureBudgetBytes: bytes,
  });
  const MIB = 1024 * 1024;
  for (const bytes of [16 * MIB, 32 * MIB, 48 * MIB])
    assert.doesNotThrow(() => preparePrivateAreaContent(fixture(bytes)), String(bytes));
  for (const bytes of [16 * MIB - 1, 48 * MIB + 1, Number.NaN])
    assert.throws(() => preparePrivateAreaContent(fixture(bytes)), /Invalid private area content/, String(bytes));
});

test("the loader rejects a broken ceiling", () => {
  const broken = (mutate) => () => {
    const d = read("../src/data/spawns.json");
    mutate(d);
    validateSpawns(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.maxResidentHealth;
    }),
  );
  assert.throws(
    broken((d) => {
      d.maxResidentHealth = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.maxResidentHealth = 1.5;
    }),
  );
});
