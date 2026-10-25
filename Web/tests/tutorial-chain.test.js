import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createGeometry } from "../src/world-geometry.js";
import { createRouteGuidance, huntTarget } from "../src/engine/route-guidance.js";
import { createFirstTimeHints, HINT_STORAGE_KEY } from "../src/first-time-hints.js";
import { createTileFlash, TILE_FLASH_KEY } from "../src/engine/weapon-tiles.js";

const memory = () => {
  const data = new Map();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};
const salamander = (x, z, hp = 40) => ({ rig: "giant-salamander", hp, pos: { x, z } });
const matron = (x, z, hp = 120) => ({ rig: "boss-witch", hp, pos: { x, z }, bossProfile: { name: "Ember Matron" } });

test("the hunt chain leads to the salamander, then the Ember Matron, then stops once the flamethrower is collected", () => {
  const sal = salamander(10, 4),
    witch = matron(-8, 2),
    g = { enemies: [sal, witch], flameFuel: { collected: false } };
  assert.deepEqual(huntTarget(g), { pos: sal.pos, label: "KILL THE SALAMANDER" });
  sal.hp = 0;
  assert.deepEqual(huntTarget(g), { pos: witch.pos, label: "KILL THE EMBER MATRON" });
  witch.hp = 0;
  assert.equal(huntTarget(g), null);
  witch.hp = 120;
  g.flameFuel.collected = true;
  assert.equal(huntTarget(g), null, "a collected flamethrower ends the chain even with a live Matron");
  g.flameFuel.collected = false;
  g.bossEquipment = { emberProjector: { status: "owned" } };
  assert.equal(huntTarget(g), null, "an owned Ember Projector ends the chain too");
  assert.equal(huntTarget({ enemies: [] }), null);
});

test("the route arrow follows the hunt target's live position and names the kill", () => {
  const layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url))),
    g = createGeometry(layout),
    start = g.ground(layout.tutorialPath[0]),
    world = {
      areaId: "westminster",
      THREE,
      layout,
      geometry: g,
      group: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(),
      toRender: (p, y = 0) => new THREE.Vector3(p.x, y, -p.z),
      travelAt: () => null,
    },
    cue = createRouteGuidance(world);
  cue.setTutorial(true);
  cue.setHuntTarget({ pos: { x: start.x + 6, z: start.z }, label: "KILL THE SALAMANDER" });
  assert.equal(cue.resolve(start).row.kind, "tutorial", "the shelter still comes first");
  cue.setTutorial(false);
  const first = cue.resolve(start);
  assert.equal(first.row.kind, "hunt");
  assert.deepEqual(first.target, { x: start.x + 6, z: start.z });
  assert.match(cue.hint(start), /KILL THE SALAMANDER · 6m/);
  cue.setHuntTarget({ pos: { x: start.x + 3, z: start.z + 4 }, label: "KILL THE SALAMANDER" });
  assert.deepEqual(cue.resolve(start).target, { x: start.x + 3, z: start.z + 4 }, "the cue tracks the moved enemy");
  cue.setHuntTarget({ pos: { x: start.x + 5, z: start.z }, label: "KILL THE EMBER MATRON" });
  assert.match(cue.hint(start), /KILL THE EMBER MATRON/);
  cue.setHuntTarget(null);
  assert.notEqual(cue.resolve(start)?.row.kind, "hunt");
  cue.dispose();
});

test("the Ember drop shows a pick-up notice once, and only while it is uncollected and in reach", () => {
  const storage = memory(),
    hints = createFirstTimeHints({ storage }),
    g = {
      time: 10,
      finished: false,
      events: [],
      player: { pos: { x: 5.5, z: 5 }, hp: 100 },
      enemies: [],
      bossEquipment: { emberProjector: { status: "pending", dropPosition: { x: 5, z: 5 } } },
      pistol: { collected: true, pickupAreaId: "westminster", pickupPos: { x: 0, z: 0 } },
      world: {
        areaId: "westminster",
        exitHint: () => "",
        bossEquipmentData: { emberProjector: { source: { areaId: "westminster" } } },
      },
    };
  assert.equal(hints.current(g), "Tap PICK UP EMBER to take it.");
  g.time += 30;
  assert.equal(hints.current(g), "Tap PICK UP EMBER to take it.", "it stays while the drop is uncollected within 6 m");
  g.bossEquipment.emberProjector.status = "owned";
  g.time += 0.5;
  assert.notEqual(hints.current(g), "Tap PICK UP EMBER to take it.");
  assert(JSON.parse(storage.data.get(HINT_STORAGE_KEY)).includes("ember-pickup"));
  const again = createFirstTimeHints({ storage });
  g.bossEquipment.emberProjector.status = "pending";
  assert.notEqual(again.current(g), "Tap PICK UP EMBER to take it.", "a seen hint does not repeat");
});

test("the tile flash fires once per newly carried weapon and never for the first look at a save", () => {
  const storage = memory(),
    flash = createTileFlash(storage);
  assert.equal(flash(["knife", "westminster-start-pistol-v1"]), false, "the first look only records what is carried");
  assert.equal(flash(["knife", "westminster-start-pistol-v1"]), false);
  assert.equal(flash(["knife", "westminster-start-pistol-v1", "flamethrower-area8-v1"]), true, "a new weapon flashes");
  assert.equal(flash(["knife", "westminster-start-pistol-v1", "flamethrower-area8-v1"]), false);
  assert(JSON.parse(storage.data.get(TILE_FLASH_KEY)).includes("flamethrower-area8-v1"));
  const later = createTileFlash(storage);
  later(["knife"]);
  assert.equal(later(["knife", "flamethrower-area8-v1"]), false, "a weapon that flashed before does not flash again");
  const css = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(css, /#weapon-tiles\.flash::after\{content:"‹ › SWITCH"[^}]*font-size:13px;font-weight:600/);
});
