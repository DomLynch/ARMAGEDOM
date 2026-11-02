// weaponCaps over the real game data. Needs the Web tree and its node_modules (world-events imports three through combat.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ready = fs.existsSync(new URL("../../Web/node_modules/three", import.meta.url));
test("weapon caps: every weapon a hit can carry, damage with the progression ceiling, from the real data", { skip: ready ? false : "needs Web/node_modules" }, async () => {
  const { weaponCaps } = await import("./caps.js");
  const { WEAPON_IDS, weaponRules } = await import("../../Web/src/engine/world-events.js");
  const content = JSON.parse(fs.readFileSync(new URL("../../Web/public/world/area-content.json", import.meta.url), "utf8"));
  const caps = weaponCaps(content);
  assert.deepEqual(Object.keys(caps).sort(), [...WEAPON_IDS].sort());
  const base = (id) => weaponRules().find((r) => r.weaponId === id);
  for (const id of WEAPON_IDS) {
    assert.ok(caps[id].maxDamage >= base(id).maxDamagePerHit && caps[id].maxHitsPerS === base(id).maxHitsPerS, id);
  }
  assert.ok(Math.abs(caps.knife.maxDamage - base("knife").maxDamagePerHit * 1.21) < 1e-9, "a mastered knife hit is inside its cap");
  assert.equal(caps.rifle.maxDamage, base("rifle").maxDamagePerHit, "no mastery, no raise");
});
