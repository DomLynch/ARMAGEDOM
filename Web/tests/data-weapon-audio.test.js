import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateWeapons } from "../src/engine/game-data.js";
import { WEAPON_AUDIO } from "../src/engine/weapon-catalog.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: WEAPON_AUDIO moved from engine/weapon-catalog.js into weapons.json "audio".
// tests/fixtures/weapon-audio-pre-data.json is the old in-code table, taken before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/weapon-audio-pre-data.json", import.meta.url)));
const weapons = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/weapons.json", import.meta.url))));

test("WEAPON_AUDIO equals the old table exactly (values and key order) and is frozen", () => {
  assert.deepEqual(WEAPON_AUDIO, old);
  assert.deepEqual(Object.keys(WEAPON_AUDIO), Object.keys(old));
  for (const cue of Object.keys(old)) assert.deepEqual(Object.keys(WEAPON_AUDIO[cue]), Object.keys(old[cue]));
  assert(
    Object.isFrozen(WEAPON_AUDIO) && Object.isFrozen(WEAPON_AUDIO.shotgun) && Object.isFrozen(WEAPON_AUDIO.grenade),
  );
  assert.equal(WEAPON_AUDIO, GAME_DATA.weapons.audio);
});

test("the constant table is gone and the baseline is lowered", () => {
  const text = fs.readFileSync(new URL("../src/engine/weapon-catalog.js", import.meta.url), "utf8");
  assert.equal(countConstantTables(text), 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.equal(baseline.constantTables["engine/weapon-catalog.js"], undefined);
});

test("the validator rejects malformed cues", () => {
  validateWeapons(weapons());
  const bad = (edit, why) => {
    const d = weapons();
    edit(d);
    assert.throws(() => validateWeapons(d), why);
  };
  bad((d) => delete d.audio.grenade, Error);
  bad((d) => (d.audio.shotgun.extra = 1), Error);
  bad((d) => (d.audio.shotgun.gain = 1.5), /gain/);
  bad((d) => (d.audio.grenade.cutoff = 0), /cutoff/);
  bad((d) => (d.audio.grenade.seconds = "0.2"), /finite number/);
});
