import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFirstTimeHints, validateHintTable, HINT_STORAGE_KEY, HINT_SECONDS } from "../src/first-time-hints.js";
import table from "../src/first-time-hints.json" with { type: "json" };
import { START_PISTOL_LABEL } from "../src/pistol.js";

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
// Advance game time in half-second frames, like the loop does, and return the last hint text.
function run(hints, g, seconds) {
  let last = "";
  for (let t = 0; t < seconds - 1e-9; t += 0.5) {
    g.time += Math.min(0.5, seconds - t);
    last = hints.current(g);
  }
  return last;
}
const scavenger = (x, z, extra = {}) => ({ id: 1, hp: 30, pos: { x, z }, ...extra });

test("the table is valid data: unique ids, one known trigger each, short texts", () => {
  assert.doesNotThrow(() => validateHintTable(table));
  assert.deepEqual(
    table.map((row) => row.id),
    ["attack", "dodge-guard", "pistol", "ember-fire", "ember-matron"],
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

test("the pistol hint stays past 5 s until the pistol is collected or the player is 6 m away; other hints keep 5 s", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.pistol.collected = false;
  g.player.pos = { x: -0.85, z: -6 };
  assert.equal(hints.current(g), text("pistol"));
  assert.equal(run(hints, g, HINT_SECONDS * 4), text("pistol"), "still up after 20 s next to the pistol");
  g.player.pos = { x: -0.85 + 5, z: -6 };
  assert.equal(hints.current(g), text("pistol"), "still up 5 m away");
  g.player.pos = { x: -0.85 + 7, z: -6 };
  assert.equal(hints.current(g), "", "gone beyond 6 m");
  assert.equal(run(hints, g, HINT_SECONDS * 2), "", "does not come back once seen");
  const collected = createFirstTimeHints({ storage: memory() }),
    h = world();
  h.pistol.collected = false;
  h.player.pos = { x: -0.85, z: -6 };
  assert.equal(collected.current(h), text("pistol"));
  h.pistol.collected = true;
  assert.equal(collected.current(h), "", "collecting the pistol ends the hint at once");
  const other = createFirstTimeHints({ storage: memory() }),
    o = world({ enemies: [scavenger(2, 0)] });
  assert.equal(other.current(o), text("attack"));
  assert.equal(run(other, o, HINT_SECONDS + 1), "", "ordinary hints still run down after HINT_SECONDS");
});

test("stay conditions are validated and only the pistol row has one", () => {
  assert.throws(
    () => validateHintTable([{ id: "x", when: { tookHit: true }, stays: { nope: 1 }, text: "t" }]),
    /Unknown hint stay condition/,
  );
  assert.deepEqual(
    table.filter((row) => row.stays).map((row) => row.id),
    ["pistol"],
  );
});

test("the interact button drops its ' · G' suffix on touch devices and keeps it for keyboard players", async () => {
  const { keySuffix } = await import("../src/engine/key-hint.js");
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  try {
    globalThis.document = { body: { classList: { contains: (name) => name === "touch" && false } } };
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(keySuffix(), " · G");
    globalThis.matchMedia = (query) => ({ matches: query === "(pointer: coarse)" });
    assert.equal(keySuffix(), "");
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.document = { body: { classList: { contains: (name) => name === "touch" } } };
    assert.equal(keySuffix(), "");
  } finally {
    globalThis.document = previous.document;
    globalThis.matchMedia = previous.matchMedia;
  }
});

test("there is no map tip: the objective line already says it and an exit no longer starts a hint", () => {
  assert.ok(!table.some((row) => row.id === "map" || "nearExit" in row.when));
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.world.exitHint = () => "EXIT → EAST";
  assert.equal(hints.current(g), "");
});

test("the first-hit tip takes the line from the persistent pistol hint, which resumes after it", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.pistol.collected = false;
  g.player.pos = { x: -0.85, z: -6 };
  assert.equal(hints.current(g), text("pistol"));
  assert.equal(hints.overMessage, false);
  g.events = [{ type: "hit", actor: g.player, amount: 10 }];
  hints.observe(g);
  assert.equal(hints.current(g), text("dodge-guard"), "survival tip preempts the pistol hint");
  assert.equal(hints.overMessage, true);
  assert.equal(run(hints, g, HINT_SECONDS - 1), text("dodge-guard"));
  assert.equal(run(hints, g, 2), text("pistol"), "the pistol hint is back, still persistent");
  assert.equal(hints.overMessage, false);
  assert.equal(run(hints, g, 30), text("pistol"));
  g.pistol.collected = true;
  assert.equal(hints.current(g), "");
});

test("pistol hint, enemy within 6 m, first hit: DODGE shows, then ATTACK is not stolen and the pistol hint is back", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world();
  g.pistol.collected = false;
  g.player.pos = { x: -0.85, z: -6 };
  assert.equal(hints.current(g), text("pistol"), "spawn: the pistol hint");
  g.enemies = [scavenger(-0.85, -3)];
  assert.equal(run(hints, g, 2), text("pistol"), "an enemy within 6 m does not take the line");
  g.events = [{ type: "hit", actor: g.player, amount: 10 }];
  hints.observe(g);
  assert.equal(hints.current(g), text("dodge-guard"), "the first frame after the hit is the survival tip, not ATTACK");
  assert.equal(run(hints, g, 0.5), text("dodge-guard"));
  assert.equal(run(hints, g, HINT_SECONDS), text("pistol"), "after the tip the parked pistol hint is back");
  assert.equal(run(hints, g, 30), text("pistol"), "and stays while the pistol is on the ground nearby");
  g.pistol.collected = true;
  assert.equal(hints.current(g), text("attack"), "collecting ends it; the waiting attack tip shows next");
});

test("a persistent hint is only marked seen once it has ended", () => {
  const storage = memory();
  const hints = createFirstTimeHints({ storage });
  const g = world();
  g.pistol.collected = false;
  g.player.pos = { x: -0.85, z: -6 };
  assert.equal(hints.current(g), text("pistol"));
  assert.equal(storage.data.get(HINT_STORAGE_KEY) ?? "[]", "[]", "still running, so not stored yet");
  g.pistol.collected = true;
  hints.current(g);
  assert.match(storage.data.get(HINT_STORAGE_KEY), /pistol/);
});

test("the first-hit and Matron tips are one short line each", () => {
  for (const row of table) assert.ok(row.text.length <= 48 || row.id === "pistol", row.id);
});

test("only the first-hit tip may take the line over a live game message; every other hint still waits", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(2, 0)] });
  g.message = "LONDON · Hollow scavengers. Keep space, guard, then counter.";
  g.messageUntil = g.time + 60;
  assert.equal(hints.current(g), "", "an ordinary hint waits for the message");
  assert.equal(hints.overMessage, false);
  g.events = [{ type: "hit", actor: g.player, amount: 10 }];
  hints.observe(g);
  assert.equal(hints.current(g), text("dodge-guard"), "survival first: shown over the message");
  assert.equal(hints.overMessage, true);
  assert.equal(run(hints, g, 2), text("dodge-guard"), "keeps running while the message is up");
  assert.equal(run(hints, g, HINT_SECONDS), "", "and then runs down; the waiting hint is still held by the message");
  assert.equal(hints.overMessage, false);
  g.messageUntil = 0;
  assert.equal(hints.current(g), text("attack"), "the held hint starts once the message is gone");
  assert.equal(hints.overMessage, false);
});

test("the Ember Matron in view teaches that she carries a flamethrower", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(30, 0, { bossProfile: { name: "Ember Matron" } })] });
  assert.equal(hints.current(g), "");
  g.enemies[0].pos = { x: 12, z: 3 };
  assert.equal(hints.current(g), text("ember-matron"));
  const other = createFirstTimeHints({ storage: memory() });
  g.enemies[0].bossProfile.name = "Someone Else";
  assert.equal(other.current(g), "");
});

test("each hint shows once for a few seconds, then never again, even after a reload", () => {
  const storage = memory();
  const hints = createFirstTimeHints({ storage });
  const g = world({ enemies: [scavenger(2, 0)] });
  assert.equal(hints.current(g), text("attack"));
  assert.equal(run(hints, g, HINT_SECONDS - 0.5), text("attack"));
  assert.equal(run(hints, g, 1), "");
  assert.deepEqual(JSON.parse(storage.data.get(HINT_STORAGE_KEY)), ["attack"]);
  const reloaded = createFirstTimeHints({ storage });
  assert.equal(reloaded.current(g), "");
});

test("a live game message holds a hint back: it neither starts nor runs down underneath the message", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(2, 0)] });
  g.message = "LONDON · Hollow scavengers. Keep space, guard, then counter.";
  g.messageUntil = g.time + 5;
  assert.equal(run(hints, g, 4.5), "");
  assert.equal(hints.current(g), "", "not marked seen while hidden");
  assert.equal(run(hints, g, 1), text("attack"));
  assert.equal(run(hints, g, HINT_SECONDS - 1.5), text("attack"));
  g.messageUntil = g.time + 3;
  assert.equal(run(hints, g, 2.5), "");
  // One second of its five was left; the message hid it without using any of that up.
  assert.equal(run(hints, g, 0.5), text("attack"));
  assert.equal(run(hints, g, 1), "");
});

test("hints queue one at a time and wait for the current one to finish", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = world({ enemies: [scavenger(2, 0)] });
  g.flame = { equipped: true };
  assert.equal(hints.current(g), text("attack"));
  assert.equal(run(hints, g, 1), text("attack"));
  assert.equal(run(hints, g, HINT_SECONDS), text("ember-fire"));
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
  assert.match(loop, /s\.paused \|\| s\.traveling \? "" : hints\.current\(s\.game\)/);
  assert.match(loop, /s\.hud\.update\(s\.game, hint, hints\.overMessage\)/);
  const hud = readFileSync(new URL("../src/hud.js", import.meta.url), "utf8");
  assert.match(hud, /update\(g, hint = "", hintFirst = false\)/);
  assert.match(hud, /hintFirst && hint\s*\? hint\s*: g\.time < g\.messageUntil\s*\? g\.message\s*: hint \|\|/);
});

test("picking up the Ember flamethrower teaches how to fire it, once", () => {
  const storage = memory();
  const hints = createFirstTimeHints({ storage });
  const g = world();
  assert.equal(hints.current(g), "");
  g.flame = { equipped: true };
  assert.equal(hints.current(g), text("ember-fire"));
  // The in-reach pistol button reads its candidate label (pistol.js), and the hint names that same label.
  assert.ok(text("pistol").toUpperCase().includes(START_PISTOL_LABEL.toUpperCase()));
  run(hints, g, HINT_SECONDS + 1);
  assert.equal(createFirstTimeHints({ storage }).current(g), "");
});

test("the hint pop-up is gold in the route arrow's colour and only for hints", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const guidance = readFileSync(new URL("../src/engine/route-guidance.js", import.meta.url), "utf8");
  assert.match(guidance, /color: 0xf1d28c/);
  assert.match(css, /#notice\.hint \{[^}]*#f1d28c/);
  const hud = readFileSync(new URL("../src/hud.js", import.meta.url), "utf8");
  assert.match(hud, /classList\.toggle\("hint", gold\)/);
});
