import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { carriedWeaponTiles, createWeaponTiles, activeTilePage } from "../src/engine/weapon-tiles.js";
import { WEAPON_TILES } from "../src/engine/weapon-tiles-data.js";
import { fixture } from "./helpers/rifle-fixture.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";

// The strip shows pageSize tiles at a time. A weapon that lands on a later page (an auto-equipping pickup) must
// bring its page into view, or Dom sees only KNIFE and PISTOL while FLAME is already in his hand.
const seed = JSON.parse(fs.readFileSync(new URL("./fixtures/safehouse171-earned-v11.json", import.meta.url)));
const data = JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url)));
const { pageSize: PAGE, pageWidthPx: STEP } = WEAPON_TILES;

function make() {
  const f = fixture({
    areaId: "westminster",
    records: new Map([["armagedom:boss-equipment-run:v11", seed.rawV11]]),
    extraWorld: { bossEquipmentData: profiles, safehouseData: data.safehouse },
  });
  f.restore();
  assert(!f.g.runSaveInvalid);
  return f;
}
class Element extends EventTarget {
  constructor(tag = "") {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.scrollLeft = 0;
    this.classList = { toggle() {} };
    this.style = { setProperty() {} };
  }
  append(...n) {
    this.children.push(...n);
  }
  replaceChildren(...n) {
    this.children = [...n];
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  querySelectorAll(s) {
    return this.children.flatMap((n) => [
      ...((s === "[data-weapon-id]" && n.dataset.weaponId) || s === n.tagName.toLowerCase() ? [n] : []),
      ...n.querySelectorAll(s),
    ]);
  }
  querySelector(s) {
    return this.querySelectorAll(s)[0];
  }
  scrollTo({ left }) {
    this.scrollLeft = left;
    this.dispatchEvent(new Event("scroll"));
  }
}
function view(f) {
  const old = globalThis.document,
    nodes = new Map(),
    el = (id) => (nodes.has(id) ? nodes.get(id) : nodes.set(id, new Element()).get(id));
  globalThis.document = { getElementById: el, createElement: (tag) => new Element(tag) };
  const v = createWeaponTiles({ get game() { return f.g; }, loaded: true, paused: false }, () => {});
  return {
    v,
    el,
    track: el("weapon-tiles-track"),
    dispose() {
      v.dispose();
      globalThis.document = old;
    },
  };
}
const activeIndex = (g) => carriedWeaponTiles(g).findIndex((r) => r.active);
const restingPage = (t) => Math.round(t.track.scrollLeft / STEP);
const selectOnly = (g, kind) => {
  g.flame.equipped = kind === "flame";
  for (const b of Object.values(g.bossEquipment)) b.selected = false;
  g.rifle.selected = false;
  g.pistol.equipped = kind === "pistol";
};

test("activeTilePage is the page of the first non-companion active tile", () => {
  const rows = (n, at) => Array.from({ length: n }, (_, i) => ({ id: "w" + i, active: i === at }));
  assert.equal(activeTilePage(rows(5, 0)), 0);
  assert.equal(activeTilePage(rows(5, PAGE)), 1);
  assert.equal(activeTilePage(rows(6, 5)), Math.floor(5 / PAGE));
  assert.equal(activeTilePage(rows(3, -1)), 0, "nothing active rests on the first page");
});

test("an auto-equipped flamethrower on a later page brings its page into view (fails without the follow)", () => {
  const f = make(),
    g = f.g;
  selectOnly(g, "pistol");
  const t = view(f);
  try {
    t.v.update();
    assert.equal(restingPage(t), activeTilePage(carriedWeaponTiles(g)));
    selectOnly(g, "flame");
    t.v.update();
    const rows = carriedWeaponTiles(g),
      at = activeIndex(g);
    assert(at >= PAGE, "the flame tile sits past the first page, which is the reported case");
    assert.equal(rows[at].id, "ember-flamethrower-v1");
    assert.equal(restingPage(t), Math.floor(at / PAGE));
    assert.equal(t.el("weapon-tiles-track").querySelectorAll("[data-weapon-id]")[at].attributes.get("aria-pressed"), "true");
  } finally {
    t.dispose();
  }
});

test("two pickups in a row: the strip follows each new equipped weapon", () => {
  const f = make(),
    g = f.g;
  selectOnly(g, "knife");
  const t = view(f);
  try {
    t.v.update();
    assert.equal(restingPage(t), 0);
    selectOnly(g, "pistol");
    g.rifle.selected = false;
    t.v.update();
    const first = restingPage(t);
    assert.equal(first, Math.floor(activeIndex(g) / PAGE));
    selectOnly(g, "flame");
    t.v.update();
    assert.equal(restingPage(t), Math.floor(activeIndex(g) / PAGE));
    assert(restingPage(t) > 0);
  } finally {
    t.dispose();
  }
});

test("browsing by arrow is not undone by the next frame; a new weapon still wins", () => {
  const f = make(),
    g = f.g;
  selectOnly(g, "flame");
  const t = view(f);
  try {
    t.v.update();
    t.track.scrollLeft = 0; // the player browsed back
    t.v.update();
    assert.equal(t.track.scrollLeft, 0, "no change in weapon, no snap");
    selectOnly(g, "pistol");
    t.v.update();
    assert.equal(restingPage(t), Math.floor(activeIndex(g) / PAGE));
  } finally {
    t.dispose();
  }
});

test("reload and un-pause rest on the equipped weapon's page", () => {
  const f = make(),
    g = f.g;
  selectOnly(g, "flame");
  const first = view(f);
  first.dispose();
  const t = view(f); // a fresh strip over the restored run
  try {
    t.v.update();
    assert.equal(restingPage(t), Math.floor(activeIndex(g) / PAGE));
    t.track.scrollLeft = 0; // a hidden (paused) strip loses its scroll position
    t.el("weapon-tiles").hidden = false;
    f.g.finished = true;
    t.v.update();
    f.g.finished = false;
    t.v.update();
    assert.equal(restingPage(t), Math.floor(activeIndex(g) / PAGE));
  } finally {
    t.dispose();
  }
});

test("a weapon lost on death leaves the strip pointing at the weapon that is equipped now", () => {
  const f = make(),
    g = f.g;
  selectOnly(g, "flame");
  const t = view(f);
  try {
    t.v.update();
    selectOnly(g, "knife");
    g.uniqueReward.selectedMeleeVariant = "knife";
    t.v.update();
    assert.equal(restingPage(t), Math.floor(activeIndex(g) / PAGE));
    assert.equal(restingPage(t), 0);
  } finally {
    t.dispose();
  }
});
