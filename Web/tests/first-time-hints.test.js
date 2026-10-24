import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFirstTimeHints, validateHintTable, HINT_STORAGE_KEY, HINT_SECONDS } from "../src/first-time-hints.js";
import table from "../src/first-time-hints.json" with { type: "json" };

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
};
const text = (id) => table.find((row) => row.id === id).text;
function world(overrides = {}) {
  const player = { pos: { x: 0, z: 0 }, hp: 100 };
  return {
    time: 10,
    finished: false,
    events: [],
    player,
    enemies: [],
    pistol: { collected: true, pickupAreaId: "westminster", pickupPos: { x: -0.85, z: -6.15 } },
    world: { areaId: "westminster", exitHint: () => "" },
    ...overrides,
  };
}
const scavenger = (x, z, extra = {}) => ({ id: 1, hp: 30, pos: { x, z }, ...extra });

test("the table is valid data: unique ids, one known trigger each, short texts", () => {
  assert.doesNotThrow(() => validateHintTable(table));
  assert.deepEqual(
    table.map((row) => row.id),
    ["attack", "dodge-guard", "pistol", "map", "ember-matron"],
  );
  assert.throws(() => validateHintTable([{ id: "x", when: { nope: 1 }, text: "t" }]), /Unknown hint trigger/);
  assert.throws(
    () =>
      validateHintTable([
        { id: "x", when: { tookHit: true }, text: "t" },
        { id: "x", when: { tookHit: true }, text: "t" },
      ]),
    /duplicate/,
  );
  assert.throws(() => validateHintTable([{ id: "x", when: { tookHit: true }, text: "" }]), /Invalid hint text/);
});

test("an enemy within range teaches SLASH and STAB; a far one or a boss does not", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(20, 0), scavenger(1, 0, { hp: 0 }), scavenger(2, 0, { bossProfile: {} })] });
  assert.equal(hints.current(g), "");
  g.enemies.push(scavenger(4, 3));
  assert.equal(hints.current(g), text("attack"));
});

test("the first hit taken teaches DODGE ROLL and GUARD; a hit on an enemy does not", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.events = [{ type: "hit", actor: scavenger(1, 1), amount: 10 }];
  hints.observe(g);
  assert.equal(hints.current(g), "");
  g.events = [{ type: "hit", actor: g.player, amount: 10 }];
  hints.observe(g);
  assert.equal(hints.current(g), text("dodge-guard"));
});

test("a pickup-eligible pistol teaches Equip pistol, only in its area and only in reach", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.pistol.collected = false;
  g.player.pos = { x: 5, z: 5 };
  assert.equal(hints.current(g), "");
  g.player.pos = { x: -0.85, z: -6 };
  g.world.areaId = "east";
  assert.equal(hints.current(g), "");
  g.world.areaId = "westminster";
  assert.equal(hints.current(g), text("pistol"));
});

test("standing near an area exit teaches the menu MAP", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  assert.equal(hints.current(g), "");
  g.world.exitHint = () => "EAST ->";
  assert.equal(hints.current(g), text("map"));
});

test("the Ember Matron in view teaches that she carries a flamethrower", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(30, 0, { bossProfile: { name: "Ember Matron" } })] });
  assert.equal(hints.current(g), "");
  g.enemies[0].pos = { x: 12, z: 3 };
  assert.equal(hints.current(g), "The Ember Matron carries a flamethrower. Take it from her.");
  const other = createFirstTimeHints({ storage: memory() });
  g.enemies[0].bossProfile.name = "Someone Else";
  assert.equal(other.current(g), "");
});

test("each hint shows once for a few seconds, then never again, even after a reload", () => {
  const storage = memory();
  const hints = createFirstTimeHints({ storage });
  const g = world({ enemies: [scavenger(2, 0)] });
  assert.equal(hints.current(g), text("attack"));
  g.time += HINT_SECONDS - 0.1;
  assert.equal(hints.current(g), text("attack"));
  g.time += 0.2;
  assert.equal(hints.current(g), "");
  assert.deepEqual(JSON.parse(storage.data.get(HINT_STORAGE_KEY)), ["attack"]);
  const reloaded = createFirstTimeHints({ storage });
  assert.equal(reloaded.current(g), "");
});

test("hints queue one at a time and wait for the current one to finish", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(2, 0)] });
  g.world.exitHint = () => "EAST ->";
  assert.equal(hints.current(g), text("attack"));
  g.time += 1;
  assert.equal(hints.current(g), text("attack"));
  g.time += HINT_SECONDS;
  assert.equal(hints.current(g), text("map"));
});

test("no hint while the run is over, and no hint when the player is dead", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(2, 0)], finished: true });
  assert.equal(hints.current(g), "");
  g.finished = false;
  g.player.hp = 0;
  assert.equal(hints.current(g), "");
});

test("seen flags live in their own key and unavailable or corrupt storage cannot break the game", () => {
  assert.equal(HINT_STORAGE_KEY, "armagedom.firstTimeHints.v1");
  const storage = memory();
  const hints = createFirstTimeHints({ storage });
  hints.current(world({ enemies: [scavenger(2, 0)] }));
  assert.deepEqual([...storage.data.keys()], [HINT_STORAGE_KEY]);
  const g = world({ enemies: [scavenger(2, 0)] });
  assert.equal(createFirstTimeHints({ storage: memory({ [HINT_STORAGE_KEY]: "{bad" }) }).current(g), text("attack"));
  const broken = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(createFirstTimeHints({ storage: broken }).current(g), text("attack"));
  assert.equal(createFirstTimeHints({ storage: null }).current(g), text("attack"));
});

test("the browser loop feeds events to the hints and passes the text to the existing notice line", () => {
  const loop = readFileSync(new URL("../src/engine/loop.js", import.meta.url), "utf8");
  assert.match(loop, /hints\.observe\(s\.game\)/);
  assert.match(loop, /s\.hud\.update\(s\.game, s\.paused \|\| s\.traveling \? "" : hints\.current\(s\.game\)\)/);
  const hud = readFileSync(new URL("../src/hud.js", import.meta.url), "utf8");
  assert.match(hud, /update\(g, hint = ""\)/);
  assert.match(hud, /g\.messageUntil \? g\.message : hint \|\|/);
});
