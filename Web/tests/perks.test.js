import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validatePerks } from "../src/engine/game-data-perks.js";
import { cursedDamage } from "../src/engine/cursed-relic.js";
import { TRASH_WAVE, onWaveKill, stepTrashWave } from "../src/engine/trash-wave.js";
import { createGame, receiveHit, stepGame } from "../src/combat.js";
import {
  PERKS,
  createPerkPicker,
  perkAbsorb,
  perkDamage,
  perkDropRoll,
  perkMove,
  perkOnClear,
  perkPistol,
  perkReload,
  perkShot,
  perksEnabled,
  pickPerk,
  stepPerks,
} from "../src/engine/perks.js";
import { make } from "./helpers/marked-fixture.js";

const ON = "?waves=1";
const OFF = "";
const EVERY = PERKS.everyWaves;
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/perks.json", import.meta.url))));
const game = (extra = {}) => ({
  time: 0,
  finished: false,
  message: "",
  messageUntil: 0,
  player: { hp: 60, maxHP: 100, staminaRegen: 1 },
  ...extra,
});
const byId = (id) => PERKS.perks.find((p) => p.id === id);
// Opens an offer made of exactly `id` and takes it, through the real pick path.
function give(g, id) {
  stepPerks(g, EVERY * ((g.perks?.granted ?? 0) + 1), 0, PERKS, ON);
  g.perks.offer = { ids: [id], left: PERKS.autoPickSeconds, total: PERKS.autoPickSeconds };
  assert.equal(pickPerk(g, id), true, id);
}

test("data: eight perks with names and texts, a validator that refuses bad rows", () => {
  validatePerks(raw());
  assert.ok(PERKS.perks.length >= 8);
  for (const p of PERKS.perks) assert.ok(p.name && p.text && p.name.length <= 24 && p.text.length <= 48, p.id);
  assert.equal(PERKS.everyWaves, 3);
  assert.equal(PERKS.choices, 3);
  assert.equal(PERKS.autoPickSeconds, 8);
  const bad = (edit) => {
    const d = raw();
    edit(d);
    assert.throws(() => validatePerks(d));
  };
  bad((d) => (d.perks[1].id = d.perks[0].id));
  bad((d) => (d.perks[0].stat = "luck"));
  bad((d) => (d.choices = 4));
  bad((d) => (d.perks = d.perks.slice(0, 2)));
  bad((d) => (d.perks[0].value = 1));
  bad((d) => (d.perks[0].maxStacks = 0));
  bad((d) => (d.perks[0].name = ""));
  bad((d) => (d.stats.damage.mode = "pow"));
  bad((d) => (d.extra = true));
  assert.ok(GAME_DATA.perks === PERKS, "registered with the other data files");
});

test("flag off: perks are never offered and no state is created", () => {
  const g = game();
  for (const search of [OFF, "?waves=0", "?x=1"]) {
    assert.equal(perksEnabled(search), false);
    assert.equal(stepPerks(g, EVERY * 10, 1, PERKS, search), null);
  }
  assert.equal("perks" in g, false, "no perk state at all");
  assert.equal(perkDamage(g, 10), 10);
  assert.equal(perkMove(g), 1);
  assert.equal(perkReload(g, 2), 2);
  assert.equal(perkAbsorb(g, 7), 7);
  assert.equal(perkOnClear(g), 1);
  assert.equal(perkDropRoll(g), false);
  const profile = { reload: 1.5 };
  assert.equal(perkPistol(g, profile), profile, "the very same profile object");
  const result = { state: { magazine: 3 }, events: [{ type: "shot" }] };
  perkShot(g, 4, result);
  assert.equal(result.state.magazine, 3);
  assert.equal(g.player.staminaRegen, 1);
  assert.equal(perksEnabled(ON), true);
});

test("flag on but no third clear yet: still no state", () => {
  const g = game();
  for (let cleared = 0; cleared < EVERY; cleared++) assert.equal(stepPerks(g, cleared, 1, PERKS, ON), null);
  assert.equal("perks" in g, false);
  const state = stepPerks(g, EVERY, 0, PERKS, ON);
  assert.equal(state.offer.ids.length, PERKS.choices);
});

test("an offer is three different perks from the data", () => {
  const g = game();
  const { offer } = stepPerks(g, EVERY, 0, PERKS, ON);
  assert.equal(new Set(offer.ids).size, PERKS.choices);
  assert.ok(offer.ids.every((id) => byId(id)));
  assert.equal(offer.left, PERKS.autoPickSeconds);
  const again = game();
  assert.deepEqual(
    stepPerks(again, EVERY, 0, PERKS, ON).offer.ids,
    offer.ids,
    "the same day and offer number draw the same cards",
  );
});

test("a draw never repeats a card and never offers a perk that is at its stack limit", () => {
  const g = game();
  const capacity = PERKS.perks.reduce((n, p) => n + p.maxStacks, 0);
  const seen = new Set();
  for (let n = 1; n <= capacity; n++) {
    const { offer } = stepPerks(g, EVERY * n, 0, PERKS, ON);
    assert.ok(offer, `offer ${n}`);
    assert.equal(new Set(offer.ids).size, offer.ids.length, `offer ${n} repeats a card`);
    for (const id of offer.ids) assert.ok((g.perks.picks[id] ?? 0) < byId(id).maxStacks, `${id} is maxed`);
    for (const id of offer.ids) seen.add(id);
    assert.equal(pickPerk(g, offer.ids[0]), true);
  }
  assert.equal(seen.size, PERKS.perks.length, "every perk shows up over a run");
  const done = stepPerks(g, EVERY * (capacity + 1), 0, PERKS, ON);
  assert.equal(done.offer, null, "nothing left to offer");
  assert.equal(g.perks.picks.medic, 1);
});

test("one offer at a time: later clears wait until the open one is answered", () => {
  const g = game();
  const first = stepPerks(g, EVERY, 0, PERKS, ON).offer;
  const still = stepPerks(g, EVERY * 2, 0, PERKS, ON).offer;
  assert.equal(still, first, "same open offer");
  pickPerk(g, first.ids[1]);
  const next = stepPerks(g, EVERY * 2, 0, PERKS, ON).offer;
  assert.notEqual(next, first);
  assert.ok(next, "the owed offer opens after the answer");
  stepPerks(g, EVERY * 2, 0, PERKS, ON);
  pickPerk(g, next.ids[0]);
  assert.equal(stepPerks(g, EVERY * 2, 0, PERKS, ON).offer, null, "two clears of three owed: nothing more");
});

test("an ignored offer takes the first card after eight seconds, and never before", () => {
  const g = game({ time: 100 });
  const { offer } = stepPerks(g, EVERY, 0, PERKS, ON);
  const first = offer.ids[0];
  for (let i = 0; i < 79; i++) stepPerks(g, EVERY, 0.1, PERKS, ON);
  assert.equal(g.perks.offer, offer, "7.9 seconds in: still open");
  assert.equal(g.perks.picks[first], undefined);
  stepPerks(g, EVERY, 0.0, PERKS, ON);
  stepPerks(g, EVERY, 0.2, PERKS, ON);
  assert.equal(g.perks.offer, null);
  assert.equal(g.perks.picks[first], 1);
  assert.match(g.message, new RegExp(byId(first).name));
  assert.equal(g.messageUntil, 100 + PERKS.messageSeconds);
  stepPerks(g, EVERY, 30, PERKS, ON);
  assert.equal(g.perks.picks[first], 1, "no second pick from the timer");
});

test("a held game (dt 0) does not run the timer", () => {
  const g = game();
  const { offer } = stepPerks(g, EVERY, 0, PERKS, ON);
  for (let i = 0; i < 50; i++) stepPerks(g, EVERY, 0, PERKS, ON);
  assert.equal(offer.left, PERKS.autoPickSeconds);
});

test("death drops an open offer; a pick that arrives late changes nothing", () => {
  const g = game();
  const { offer } = stepPerks(g, EVERY, 0, PERKS, ON);
  g.player.hp = 0;
  stepPerks(g, EVERY, 1, PERKS, ON);
  assert.equal(g.perks.offer, null);
  assert.equal(pickPerk(g, offer.ids[0]), false);
});

test("a tap, a key and the timer arriving together count once; a card that was not offered is refused", () => {
  const g = game();
  const { offer } = stepPerks(g, EVERY, 0, PERKS, ON);
  const stranger = PERKS.perks.map((p) => p.id).find((id) => !offer.ids.includes(id));
  assert.equal(pickPerk(g, stranger), false);
  assert.equal(pickPerk(g, offer.ids[2]), true);
  assert.equal(pickPerk(g, offer.ids[2]), false);
  assert.equal(pickPerk(g, offer.ids[0]), false);
  stepPerks(g, EVERY, 30, PERKS, ON);
  assert.equal(
    Object.values(g.perks.picks).reduce((a, b) => a + b, 0),
    1,
  );
});

test("effects are applied once: damage, speed, reload, stamina", () => {
  const g = game();
  give(g, "damage");
  assert.equal(perkDamage(g, 10), 11.5);
  assert.equal(pickPerk(g, "damage"), false);
  assert.equal(perkDamage(g, 10), 11.5, "a second pick call does not stack");
  give(g, "damage");
  assert.ok(Math.abs(perkDamage(g, 10) - 10 * 1.15 * 1.15) < 1e-9, "taken again, it stacks");
  give(g, "speed");
  assert.ok(Math.abs(perkMove(g) - 1.1) < 1e-9);
  give(g, "hands");
  assert.ok(Math.abs(perkReload(g, 2) - 1.6) < 1e-9);
  give(g, "wind");
  assert.ok(Math.abs(g.player.staminaRegen - 1.2) < 1e-9, "the player's own multiplier, once");
  assert.equal(pickPerk(g, "wind"), false);
  assert.ok(Math.abs(g.player.staminaRegen - 1.2) < 1e-9);
  give(g, "wind");
  assert.ok(Math.abs(g.player.staminaRegen - 1.44) < 1e-9);
  assert.equal(g.player.maxHP, 100, "max HP is left alone");
});

test("bonus HP: the pick heals, the bonus takes hits before health and refills on a wave clear", () => {
  const g = game();
  give(g, "hide");
  assert.equal(g.player.hp, 85, "healed 25");
  assert.equal(g.player.maxHP, 100);
  assert.equal(g.perks.shield, 25);
  assert.equal(perkAbsorb(g, 10), 0);
  assert.equal(g.perks.shield, 15);
  assert.equal(perkAbsorb(g, 20), 5, "the rest goes to health");
  assert.equal(g.perks.shield, 0);
  assert.equal(perkAbsorb(g, 8), 8);
  assert.equal(perkOnClear(g), 1);
  assert.equal(g.perks.shield, 25, "refilled");
  give(g, "hide");
  assert.equal(g.player.hp, 100, "a heal never passes max HP");
  assert.equal(g.perks.shield, 50);
});

test("pistol magazine perk: a quarter more shots, never a fuller magazine than the saved one allows", () => {
  const g = game();
  give(g, "drum");
  let magazine = 12,
    spent = 0,
    shots = 0;
  for (; shots < 20; shots++) {
    const before = magazine,
      result = { state: { magazine: magazine - 1 }, events: [{ type: "shot" }] };
    perkShot(g, before, result);
    assert.ok(result.state.magazine <= before, "never above where it started");
    spent += before - result.state.magazine;
    magazine = result.state.magazine;
    if (magazine < 12 - 3) magazine = 12; // reload
  }
  assert.equal(spent, 16, "20 shots cost 16 rounds: one in five is free");
  const dry = { state: { magazine: 0 }, events: [{ type: "dry" }] };
  perkShot(g, 0, dry);
  assert.equal(dry.state.magazine, 0, "a dry click earns nothing");
});

test("reload perk scales the pistol profile once and reuses the copy", () => {
  const g = game();
  const profile = { reload: 2, damage: 5 };
  assert.equal(perkPistol(g, profile), profile);
  give(g, "hands");
  const scaled = perkPistol(g, profile);
  assert.notEqual(scaled, profile);
  assert.ok(Math.abs(scaled.reload - 1.6) < 1e-9);
  assert.equal(scaled.damage, 5);
  assert.equal(profile.reload, 2, "the shared profile is untouched");
  assert.equal(perkPistol(g, profile), scaled, "same copy while the perk is unchanged");
  give(g, "hands");
  assert.ok(Math.abs(perkPistol(g, profile).reload - 1.28) < 1e-9);
});

test("coin drop perk: a seeded stream at the perk's chance, nothing without it", () => {
  const a = game(),
    b = game();
  assert.equal(perkDropRoll(a), false);
  give(a, "luck");
  give(b, "luck");
  const run = (g) => Array.from({ length: 1000 }, () => perkDropRoll(g));
  const first = run(a);
  assert.deepEqual(run(b), first, "the same stream for the same day");
  const hits = first.filter(Boolean).length;
  assert.ok(hits > 100 && hits < 200, `about 15% of 1000, got ${hits}`);
});

test("cursedDamage carries the damage perk, and the relic still multiplies on top", () => {
  const g = game({ cursed: null, world: { cursedRelicData: { damageMultiplier: 2 } } });
  assert.equal(cursedDamage(g, 10), 10);
  give(g, "damage");
  assert.equal(cursedDamage(g, 10), 11.5);
  g.cursed = { active: true };
  assert.equal(cursedDamage(g, 10), 23);
});

const stub = {
  spawn: { x: 0, z: 0 },
  layout: { characterScale: 1 },
  move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
  lineClear: () => true,
};

test("combat: a hit on the player is taken by the bonus HP first (real receiveHit)", () => {
  const g = createGame(stub, { pilot: "donor-knife" });
  const start = g.player.hp;
  give(g, "hide");
  g.player.hp = start - 40;
  receiveHit(g, { amount: 10, origin: { x: 0, z: 1 } });
  assert.equal(g.player.hp, start - 40, "no health lost while the bonus HP lasts");
  assert.equal(g.perks.shield, 15);
  assert.ok(
    g.events.some((e) => e.type === "hit" && e.amount === 10),
    "the hit still shows and still staggers",
  );
  receiveHit(g, { amount: 30, origin: { x: 0, z: 1 } });
  assert.equal(g.perks.shield, 0);
  assert.equal(g.player.hp, start - 40 - 15, "the rest hurt");
});

test("combat: move speed perk moves the player further per second (real stepGame)", () => {
  const walk = (perks) => {
    const g = createGame(stub, { pilot: "donor-knife" });
    if (perks) give(g, "speed");
    for (let i = 0; i < 120; i++) stepGame(g, { move: { x: 1, z: 0 } }, 1 / 60);
    return g.player.pos.x;
  };
  const plain = walk(false),
    fast = walk(true);
  assert.ok(plain > 0);
  assert.ok(fast > plain * 1.05 && fast < plain * 1.15, `${plain} -> ${fast}`);
});

test("rewards: the wave-clear heal doubles with the Field Medic perk, and the bonus HP refills", () => {
  const clear = (perked) => {
    const g = make({ areaId: "east" }).g;
    g.enemies = [];
    g.corpses = [];
    g.player.maxHP = 100;
    g.player.hp = 10;
    stepTrashWave(g, 0.1, { pointOnScreen: () => false }, TRASH_WAVE, ON);
    g.trashWave.wave = 1;
    if (perked) {
      give(g, "medic");
      give(g, "hide");
      g.perks.shield = 0;
      g.player.hp = 10;
    }
    const mob = { id: 9001, waveMob: true, waveId: 1, elite: false, hp: 0, pos: { x: 3, z: 3 } };
    onWaveKill(g, mob, TRASH_WAVE, ON);
    return g;
  };
  const plain = clear(false),
    perked = clear(true);
  const heal = GAME_DATA.combatRules.legacy.waveClearHeal;
  assert.equal(plain.player.hp, 10 + heal);
  assert.equal(perked.player.hp, 10 + heal * 2);
  assert.equal(perked.perks.shield, 25);
  assert.equal("perks" in plain, false, "no perk state without a perk");
});

// A page with the pick overlay: just enough DOM for the pooled cards.
function overlay() {
  const node = (tag = "div") => {
    const e = {
      tag,
      hidden: true,
      textContent: "",
      className: "",
      children: [],
      props: {},
      onclick: null,
      style: { setProperty: (k, v) => (e.props[k] = v) },
      append: (...n) => e.children.push(...n),
    };
    return e;
  };
  const ids = Object.fromEntries(
    ["perk-pick", "perk-heading", "perk-cards", "perk-bar", "perk-status"].map((id) => [id, node()]),
  );
  const listeners = [];
  const doc = { getElementById: (id) => ids[id] ?? null, createElement: node };
  const listen = (target, type, handler, options) => listeners.push({ target, type, handler, options });
  return { ids, doc, listen, listeners };
}

test("the pick overlay: pooled cards show the offer, a tap takes a card, the status line follows", () => {
  const o = overlay();
  const picker = createPerkPicker({ doc: o.doc, listen: o.listen });
  const cards = o.ids["perk-cards"].children;
  assert.equal(cards.length, PERKS.choices, "cards built once");
  const g = game();
  picker.frame(g);
  assert.equal(o.ids["perk-pick"].hidden, true, "hidden with no offer");
  stepPerks(g, EVERY, 0, PERKS, ON);
  picker.frame(g);
  assert.equal(o.ids["perk-pick"].hidden, false);
  const names = cards.map((c) => c.children[1].textContent);
  assert.deepEqual(
    names,
    g.perks.offer.ids.map((id) => byId(id).name),
  );
  assert.deepEqual(
    cards.map((c) => c.children[2].textContent),
    g.perks.offer.ids.map((id) => byId(id).text),
  );
  assert.equal(o.ids["perk-bar"].props["--left"], "1");
  assert.equal(cards[0].children[0].textContent, "1");
  const second = g.perks.offer.ids[1];
  cards[1].onclick();
  assert.equal(g.perks.picks[second], 1);
  picker.frame(g);
  assert.equal(o.ids["perk-pick"].hidden, true);
  assert.equal(o.ids["perk-status"].hidden, false);
  assert.equal(o.ids["perk-status"].textContent.startsWith("Perks 1"), true);
  assert.equal(cards.length, PERKS.choices, "no new cards for the next offer");
  stepPerks(g, EVERY * 2, 0, PERKS, ON);
  picker.frame(g);
  assert.equal(cards.length, PERKS.choices);
});

test("the 1-2-3 keys pick while an offer is open and are left alone otherwise", () => {
  const o = overlay();
  const picker = createPerkPicker({ doc: o.doc, listen: o.listen });
  const key = o.listeners.find((l) => l.type === "keydown");
  assert.equal(key.options.capture, true, "runs before the weapon keys");
  const g = game();
  picker.frame(g);
  const press = (k) => {
    const e = {
      key: k,
      repeat: false,
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
    };
    key.handler(e);
    return e;
  };
  assert.equal(press("2").stopped, false, "no offer: the weapon key passes through");
  stepPerks(g, EVERY, 0, PERKS, ON);
  picker.frame(g);
  const ids = g.perks.offer.ids;
  assert.equal(press("5").stopped, false, "other keys pass through");
  const e = press("3");
  assert.equal(e.stopped && e.prevented, true);
  assert.equal(g.perks.picks[ids[2]], 1);
  picker.frame(g);
  assert.equal(press("1").stopped, false, "answered: the digits are weapons again");
});

test("reduced setup: a page without the overlay gets an inert picker", () => {
  const picker = createPerkPicker({ doc: { getElementById: () => null } });
  picker.frame(game());
  picker.dispose();
});
