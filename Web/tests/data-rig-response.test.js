import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { rigResponse } from "../src/rig-response.js";
import { rigText } from "../src/rig-capabilities.js";

// Data move: the hit and death reactions that combat.js chained per rig name (three copies) are rows of rig-capabilities.json and
// creatures.json defaultResponse, read by rig-response.js. tests/fixtures/rig-response-pre-data.json holds the OLD chains' output
// (copied verbatim from combat.js before the move) for every rig x health x stagger.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/rig-response-pre-data.json", import.meta.url)));
const hpOf = (v) => (v === "NaN" ? NaN : v);

test("a death reaction equals the old ranged-death and flame-death chain for every rig", () => {
  assert.equal(old.death.length, 45);
  for (const r of old.death) {
    // combat.js passes 0 for a death: the old chain ignored health for every rig but the two with a strict check, and those saw hp <= 0.
    if (!(hpOf(r.hp) <= 0)) continue;
    assert.deepEqual(rigResponse(r.rig ?? undefined, 0, 3.25), r.out, JSON.stringify(r));
  }
});

test("a knife hit or death equals the old chain for every rig, health and stagger", () => {
  assert.equal(old.hit.length, 135);
  for (const r of old.hit)
    assert.deepEqual(rigResponse(r.rig ?? undefined, hpOf(r.hp), 3.25, r.stagger), r.out, JSON.stringify(r));
});

test("the default reaction is data and the rig rows are read through the accessors", () => {
  assert.deepEqual(GAME_DATA.creatures.defaultResponse, { hitClip: "Hit", deathClip: "Death", deathTicks: 144 });
  assert.equal(rigText("original-roach", "hitClip"), "roach_hit");
  assert.equal(rigText("original-roach", "hitTicks"), undefined);
  assert.equal(rigText("original-human", "hitClip"), undefined);
});

test("the default response validator rejects bad rows", () => {
  const raw = () =>
    structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));
  validateCreatures(raw());
  for (const [edit, why] of [
    [(d) => (d.defaultResponse.hitClip = ""), /hitClip/],
    [(d) => (d.defaultResponse.deathTicks = 0), /deathTicks/],
    [(d) => delete d.defaultResponse.deathClip, Error],
  ]) {
    const d = raw();
    edit(d);
    assert.throws(() => validateCreatures(d), why);
  }
});
