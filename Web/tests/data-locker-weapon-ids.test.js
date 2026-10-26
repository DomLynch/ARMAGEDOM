import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateLocker } from "../src/engine/game-data.js";
import { LOCKER_RESOURCE_RULES, LOCKER_WEAPON_IDS, createLockerModel } from "../src/engine/locker-state.js";

// The ten locker weapon ids moved from engine/locker-state.js into data/locker.json (weaponIds). Their order is the saved shape, so
// tests/fixtures/locker-weapon-ids-pre-data.json holds the old list, copied from the module before the move.
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const old = read("./fixtures/locker-weapon-ids-pre-data.json");
const raw = () => structuredClone(read("../src/data/locker.json"));

test("the data list is the old list: same ids, same saved order", () => {
  assert.deepEqual([...LOCKER_WEAPON_IDS], old);
  assert.ok(Object.isFrozen(LOCKER_WEAPON_IDS));
});

test("the locker model accepts the data list and the old list alike", () => {
  for (const weaponIds of [[...old], [...LOCKER_WEAPON_IDS]])
    assert.doesNotThrow(() => createLockerModel({ weaponIds, resourceRules: LOCKER_RESOURCE_RULES }));
});

test("every locker weapon id in a saved fixture still validates", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const seen = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.locker && Array.isArray(o.locker.weapons)) seen.push(...o.locker.weapons);
    if (o.locker && o.locker.weapons && typeof o.locker.weapons === "object") seen.push(...Object.keys(o.locker.weapons));
    Object.values(o).forEach(walk);
  };
  for (const name of fs.readdirSync(dir))
    if (name.endsWith(".json"))
      try {
        walk(JSON.parse(fs.readFileSync(new URL(name, dir), "utf8")));
      } catch {}
  for (const id of seen) assert.ok(LOCKER_WEAPON_IDS.includes(id), `${id} is a locker weapon id`);
});

test("the locker validator rejects a short, duplicated or malformed id list", () => {
  assert.doesNotThrow(() => validateLocker(raw()));
  const short = raw();
  short.weaponIds.pop();
  assert.throws(() => validateLocker(short), /weaponIds/);
  const dup = raw();
  dup.weaponIds[9] = dup.weaponIds[0];
  assert.throws(() => validateLocker(dup), /weaponIds/);
  const bad = raw();
  bad.weaponIds[3] = "Not An Id";
  assert.throws(() => validateLocker(bad), /weaponIds/);
  const missing = raw();
  delete missing.weaponIds;
  assert.throws(() => validateLocker(missing));
});
