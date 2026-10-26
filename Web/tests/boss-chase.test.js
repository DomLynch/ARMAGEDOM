import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stepGame } from "../src/combat.js";
import { fixture } from "./helpers/rifle-fixture.js";

// Dom, 26 Oct: bosses were too passive until hit. Every boss now wakes from about 10 m, follows its target up to about 18 m from its
// spot and moves at 1.9 m/s or more (the witch keeps 2.275). These rows run the REAL area geometry with real line of sight.
const content = JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url)));
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A clear road point `radius` metres from the boss's home with a clear line to it, scanning the circle.
function pointAt(g, e, radius) {
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180,
      p = { x: e.home.x + radius * Math.cos(a), z: e.home.z + radius * Math.sin(a) };
    if (g.world.geometry.clear(p, g.player.radius) && g.world.lineClear(e.home, p) && !g.world.travelAt?.(p)) return p;
  }
  return null;
}

const receipts = [];
for (const row of content.bosses.placements) {
  const p = content.bosses.profiles[row.profileRef];
  test(`${row.profileRef}: wakes from ~10 m, chases, stays inside ${row.areaId}`, () => {
    assert.equal(p.wakeDistance, 10);
    assert.equal(p.homeLeash, 18);
    assert(p.moveSpeed >= 1.9, "speed at least 1.9");
    const f = fixture({ areaId: row.areaId }),
      g = f.g,
      e = g.enemies.find((x) => x.placementKey === row.key);
    assert(e, "boss placed");
    g.enemies = [e];
    // Just outside the old wake band, inside the new one.
    // Without a renderer there is no posed muzzle, so the ranged bosses (rocket, shotgun) get one at the body, as the view would.
    const services = {
      bossRangedSource: (_g, boss) => ({ x: boss.pos.x, y: 1.2, z: -boss.pos.z }),
      bossRangedTrace: () => null,
    };
    const near = pointAt(g, e, p.wakeDistance - 0.5);
    assert(near, "a clear point 9.5 m away");
    g.player.pos = near;
    const start = { ...e.pos };
    stepGame(g, {}, 1 / 60, services);
    assert(e.alerted, "woken from 9.5 m");
    let inside = true;
    const fired = new Set();
    for (let i = 0; i < 180; i++) {
      stepGame(g, {}, 1 / 60, services);
      for (const ev of g.events)
        if (/^boss-(ranged-warning|rocket-launch|shotgun-shot)$/.test(ev.type)) fired.add(ev.type);
      inside &&= g.world.geometry.clear(e.pos, 0.2) && !g.world.travelAt?.(e.pos) && g.world.areaId === row.areaId;
    }
    const gained = gap(start, e.pos);
    assert(e.alerted && !e.returning, "still engaged after 3 s");
    // A ranged boss (the Butcher's rocket reaches 12 m, the Nightborn's shotgun 6 m) stands and shoots once the player is in its range.
    assert(
      gained > 0.5 * p.moveSpeed * 3 || fired.size,
      `moved ${gained.toFixed(2)} m in 3 s at ${p.moveSpeed} m/s without firing`,
    );
    assert(inside, "never left the area's walkable ground or entered an exit");
    // Pursuit is area-wide once it has woken: a player 19 m from the spot (beyond the 18 m wake leash) is still chased.
    const far = pointAt(g, e, p.homeLeash + 1);
    let followed = "n/a";
    if (far) {
      g.player.pos = far;
      const before = gap(e.pos, far);
      for (let i = 0; i < 90; i++) {
        stepGame(g, {}, 1 / 60, services);
        g.player.hp = g.player.maxHP; // the receipt is about movement, not about surviving the boss
      }
      assert(e.alerted && !e.returning, "still engaged with the player 19 m from its spot");
      assert(gap(e.pos, far) < before - 0.5 || fired.size, "closes in on a player 19 m from its spot");
      followed = "still chased at 19 m";
    }
    receipts.push(
      `${row.profileRef.padEnd(9)} wake ${p.wakeDistance} m  leash ${p.homeLeash} m  speed ${p.moveSpeed} m/s  3 s from 9.5 m: ${fired.size ? "fires " + [...fired].join("+") + ", " : ""}moved ${gained.toFixed(2)} m  ${followed}`,
    );
  });
}
test("receipt", () => console.log("\n" + receipts.join("\n")));
