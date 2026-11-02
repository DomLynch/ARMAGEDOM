import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stepGame } from "../src/combat.js";
import { fixture } from "./helpers/rifle-fixture.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateTrapCrates } from "../src/engine/game-data-trap-crates.js";
import { nextBeepDelay, stepTrapCrates, trapCrateList } from "../src/engine/trap-crate.js";

const DATA = GAME_DATA.trapCrates,
  BLAST = GAME_DATA.weapons.ranged["standard-grenade-v1"].payload,
  TICK = 1 / 60;
const AREA = "east-bridge",
  CRATE = trapCrateList(AREA)[0];

function arena(areaId = AREA) {
  const f = fixture({ areaId }),
    g = f.g;
  g.enemies = [];
  g.player.pos = { ...trapCrateList(areaId)[0] };
  g.player.hp = 40;
  g.pistol.collected = true;
  g.pistol.reserve = 3;
  return { f, g, step: (intent = {}) => stepGame(g, intent, TICK, {}) };
}

test("data: the validator accepts the shipped file and rejects tutorial, hub and malformed rows", () => {
  const good = () => structuredClone(DATA);
  assert.doesNotThrow(() => validateTrapCrates(good()));
  for (const mutate of [
    (d) => (d.placements.westminster = [{ id: "w", x: 1, z: 1 }]),
    (d) => (d.placements["central-hub"] = [{ id: "h", x: 1, z: 1 }]),
    (d) => (d.placements.east = []),
    (d) => d.placements.east.push({ id: "a", x: 0, z: 0 }, { id: "b", x: 0, z: 0 }),
    (d) => (d.placements.south[0].id = d.placements.east[0].id),
    (d) => (d.beepSeconds.first = 0.01),
    (d) => (d.fuseSeconds = 0),
    (d) => (d.blast.profile = "other"),
    (d) => (d.loot.healFraction = 2),
    (d) => (d.text.opened = "no fields"),
    (d) => (d.model = []),
    (d) => (d.extra = 1),
  ]) {
    const d = good();
    mutate(d);
    assert.throws(() => validateTrapCrates(d));
  }
  assert.equal(DATA.fuseSeconds, 1.5);
  assert.equal(DATA.respawnSeconds, 180);
});

test("placements: one or two per area, clear ground, reachable, off the exits, none in Westminster or the hub", () => {
  const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/world/" + p, import.meta.url))),
    registry = createAreaRegistry({ manifest: read("manifest.json") });
  assert(!("westminster" in DATA.placements) && !("central-hub" in DATA.placements));
  for (const [area, list] of Object.entries(DATA.placements)) {
    assert(registry.has(area), area);
    assert(list.length >= 1 && list.length <= 2);
    const row = registry.get(area),
      geo = createGeometry(read(area + "/layout.json")),
      entry = geo.ground(row.entry);
    for (const c of list) {
      assert(geo.clear(c, DATA.openRadius), `${c.id} clear`);
      assert(geo.lineClear(entry, c), `${c.id} reachable from the entry`);
      assert(Math.hypot(c.x - entry.x, c.z - entry.z) > BLAST.radius * 2, `${c.id} away from the entry`);
      const pt = geo.point(c);
      for (const link of registry.links(area))
        assert(
          !Object.entries(link.condition).every(([k, v]) =>
            k === "xMin" ? pt.x > v : k === "xMax" ? pt.x < v : k === "yMin" ? pt.y > v : pt.y < v,
          ),
          `${c.id} off the exit`,
        );
    }
  }
});

test("open: walking into reach grants better loot than a medkit, shows the notice and lights the fuse", () => {
  const { g, step } = arena();
  step();
  const state = g.trapCrates[CRATE.id],
    open = g.events.find((e) => e.type === "trap-crate-open");
  assert.equal(state.phase, "fusing");
  assert(open);
  assert.equal(g.player.hp, g.player.maxHP, "full heal (a normal medkit is half)");
  assert.equal(g.pistol.reserve, GAME_DATA.supplies.rules.reserveCap, "reserve refilled to the cap");
  assert.equal(open.hp, g.player.maxHP - 40);
  assert.equal(open.rounds, GAME_DATA.supplies.rules.reserveCap - 3);
  assert.match(g.message, /Booby trap/);
  assert(Math.abs(state.fuseEnd - state.openedAt - DATA.fuseSeconds) < 1e-9);
  // Standing still, the crate cannot be opened twice.
  step();
  assert.equal(g.events.filter((e) => e.type === "trap-crate-open").length, 0);
});

test("fuse: beeps speed up, then one blast hits a player who stays, once", () => {
  const { g, step } = arena(),
    beeps = [];
  step();
  let blast = null,
    blasts = 0;
  const start = g.time;
  for (let i = 0; i < 200; i++) {
    step();
    beeps.push(...g.events.filter((e) => e.type === "trap-crate-beep").map(() => g.time));
    for (const e of g.events) if (e.type === "trap-crate-blast") ((blast = { ...e, at: g.time }), blasts++);
  }
  assert.equal(blasts, 1);
  assert(Math.abs(blast.at - start - DATA.fuseSeconds) <= TICK + 1e-9, "blast lands at the fuse time");
  assert.equal(blast.radius, BLAST.radius);
  assert(beeps.length >= 4);
  const gaps = beeps.slice(1).map((t, i) => t - beeps[i]);
  assert(gaps[gaps.length - 1] < gaps[0], "beeps accelerate");
  assert(nextBeepDelay(0) > nextBeepDelay(DATA.fuseSeconds));
  assert(g.player.hp < g.player.maxHP, "player at the crate takes the blast");
  assert(
    Math.abs(g.player.maxHP - g.player.hp - BLAST.maxDamage * DATA.blast.playerDamageScale) < 1e-6,
    "full centre damage",
  );
  assert.equal(g.trapCrates[CRATE.id].phase, "spent");
});

test("dodge: a roll whose safe window covers the blast avoids it; walking out of the radius avoids it too", () => {
  const dodged = arena();
  dodged.step();
  const hp = dodged.g.player.hp;
  let rolled = false,
    evaded = false;
  for (let i = 0; i < 200; i++) {
    // Start the roll 10 ticks before the blast, inside the roll's safe window (ticks 4 to 20).
    const left = dodged.g.trapCrates[CRATE.id].fuseEnd - dodged.g.time;
    const intent = !rolled && left <= 11 * TICK ? { dodge: true, move: { x: 0, z: 1 } } : {};
    if (intent.dodge) rolled = true;
    dodged.step(intent);
    for (const e of dodged.g.events) {
      if (e.type === "evade") evaded = true;
      if (e.type === "trap-crate-blast") {
        const d = Math.hypot(dodged.g.player.pos.x - CRATE.x, dodged.g.player.pos.z - CRATE.z);
        assert(d < BLAST.radius, "the roller is still inside the radius, so only the i-frames saved them");
      }
    }
  }
  assert(rolled && evaded, "evade event from the roll");
  assert.equal(dodged.g.player.hp, hp, "no damage");
  assert.equal(dodged.g.trapCrates[CRATE.id].phase, "spent");

  const away = arena();
  away.step();
  away.g.player.pos = { x: CRATE.x + BLAST.radius + 0.5, z: CRATE.z };
  const before = away.g.player.hp;
  for (let i = 0; i < 100; i++) away.step();
  assert.equal(away.g.trapCrates[CRATE.id].phase, "spent");
  assert.equal(away.g.player.hp, before, "outside the radius");
});

test("blast uses the normal hit path: damage falls off with distance and lethal damage ends the run", () => {
  const near = arena();
  near.step();
  near.g.player.pos = { x: CRATE.x + 1.5, z: CRATE.z };
  for (let i = 0; i < 100; i++) near.step();
  const lost = near.g.player.maxHP - near.g.player.hp;
  assert(lost > 0 && lost < BLAST.maxDamage, `half range hurts less than the centre (${lost})`);
  const frail = arena();
  frail.step();
  frail.g.player.hp = 1;
  for (let i = 0; i < 100; i++) frail.step();
  assert(frail.g.player.hp <= 0 && frail.g.finished && frail.g.won === false);
});

test("respawn: spent crates re-arm after 180 s, only once off screen; leaving the area defuses a lit fuse", () => {
  const { g, step } = arena();
  step();
  for (let i = 0; i < 100; i++) step();
  const state = g.trapCrates[CRATE.id];
  assert.equal(state.phase, "spent");
  g.player.pos = { x: CRATE.x + 15, z: CRATE.z };
  g.time = state.respawnAt - TICK * 2;
  let visible = true;
  const services = { pointOnScreen: () => visible };
  stepTrapCrates(g, () => false, services);
  assert.equal(state.phase, "spent", "not yet due");
  g.time = state.respawnAt;
  stepTrapCrates(g, () => false, services);
  assert.equal(state.phase, "spent", "due but on screen");
  visible = false;
  stepTrapCrates(g, () => false, services);
  assert.equal(state.phase, "armed", "off screen and due");
  // It can be opened again.
  g.player.pos = { ...CRATE };
  g.player.hp = 10;
  stepTrapCrates(g, () => false, services);
  assert.equal(state.phase, "fusing");
  // Travelling away defuses it: no blast, respawn timer set.
  const events = [];
  g.world.areaId = "east";
  stepTrapCrates(g, () => assert.fail("no blast in another area"), services);
  assert.equal(state.phase, "spent");
  assert(state.respawnAt > g.time);
  g.world.areaId = AREA;
  for (let i = 0; i < 200; i++)
    ((g.time += TICK), stepTrapCrates(g, () => assert.fail("defused"), services), events.push(...g.events));
  assert.equal(g.trapCrates[CRATE.id].phase, "spent");
});

test("a dead or busy player does not open a crate", () => {
  const { g, step } = arena();
  g.player.hp = 0;
  step();
  assert(!g.trapCrates?.[CRATE.id] || g.trapCrates[CRATE.id].phase === "armed");
});
