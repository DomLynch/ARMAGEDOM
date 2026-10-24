// Alpha item 4 audit: find, pick up and switch between knife, pistol/rifle and flamethrower, and never lie about
// ammo or fuel. Rows that pass pin today's behaviour; rows marked todo are audited gaps (see combat-handoff.md).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { carriedWeaponTiles } from "../src/engine/weapon-tiles.js";
import { fixture } from "./helpers/rifle-fixture.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";

const seed = JSON.parse(fs.readFileSync(new URL("./fixtures/safehouse171-earned-v11.json", import.meta.url)));
const data = JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url)));
const make = () => {
  const f = fixture({
    areaId: "westminster",
    records: new Map([["armagedom:boss-equipment-run:v11", seed.rawV11]]),
    extraWorld: { bossEquipmentData: profiles, safehouseData: data.safehouse },
  });
  f.restore();
  assert(!f.g.runSaveInvalid);
  return f;
};
const row = (g, control) => carriedWeaponTiles(g).find((r) => r.control === control);

test("row 1: knife, pistol, rifle and flamethrower are all carried and exactly one is active", () => {
  const rows = carriedWeaponTiles(make().g);
  for (const control of ["melee-variant-knife", "rifle-equip"])
    assert(
      rows.some((r) => r.control === control),
      control,
    );
  assert(
    rows.some((r) => r.control.startsWith("variant-")),
    "pistol",
  );
  assert(
    rows.some((r) => r.control === "flame-equip" || r.control === "boss-equip-emberProjector"),
    "flamethrower",
  );
  assert.equal(rows.filter((r) => r.active).length, 1);
});

test("row 2: weapon switching has a keyboard binding (KeyC cycles; Digit1 stays Special)", () => {
  const src = fs.readFileSync(new URL("../src/input.js", import.meta.url), "utf8");
  assert.match(src, /Digit1: "special"/);
  assert.match(src, /event\.code === "KeyC"[\s\S]{0,200}cycleWeapon\(\)/, "KeyC calls cycleWeapon");
});

test("row 3: empty pistol, rifle and flame tiles say they are empty", () => {
  const f = make(),
    g = f.g;
  g.pistol = { ...g.pistol, magazine: 0, reserve: 0 };
  g.rifle = { ...g.rifle, magazine: 0, reserve: 0 };
  g.flameFuel = { ...g.flameFuel, fuelUnits: 0 };
  for (const control of ["rifle-equip", "flame-equip", "boss-equip-emberProjector"]) {
    const r = row(g, control);
    if (r) {
      assert.match(r.ammo, /empty/i, control);
      assert.equal(r.empty, true, control + " empty flag");
    }
  }
  const pistol = carriedWeaponTiles(g).find((r) => r.control.startsWith("variant-"));
  assert.match(pistol.ammo, /empty/i);
  assert.equal(pistol.empty, true);
  assert.equal(row(g, "melee-variant-knife").empty, false, "melee is never empty");
  // One round in the magazine or the reserve alone is not empty.
  g.pistol = { ...g.pistol, magazine: 0, reserve: 1 };
  assert.equal(carriedWeaponTiles(g).find((r) => r.control.startsWith("variant-")).empty, false);
});

test("row 4: tile ammo and fuel match the real state, never inventing rounds", () => {
  const g = make().g;
  g.pistol = { ...g.pistol, magazine: 2, reserve: 5 };
  g.rifle = { ...g.rifle, magazine: 3, reserve: 9 };
  assert.equal(carriedWeaponTiles(g).find((r) => r.control.startsWith("variant-")).ammo, "2/6 · 5");
  assert.match(row(g, "rifle-equip").ammo, /^3\/\d+ · 9$/);
  g.flameFuel = { ...g.flameFuel, fuelUnits: 1 };
  const flame = row(g, "flame-equip") ?? row(g, "boss-equip-emberProjector");
  assert.equal(flame.ammo, "1% fuel", "one unit of fuel is never shown as 0%");
  assert.equal(flame.empty, false);
  assert(
    carriedWeaponTiles(g).every((r) => typeof r.empty === "boolean"),
    "every row carries a boolean empty flag",
  );
});

test("row 5: equipping an empty flamethrower tells the player why and changes nothing else", async () => {
  const { createFlameView } = await import("../src/engine/flame-view.js");
  const f = make(),
    g = f.g;
  g.flameFuel = { ...g.flameFuel, fuelUnits: 0 };
  const before = JSON.stringify([g.flame, g.pistol, g.rifle, g.player.weapon]);
  class Element extends EventTarget {
    attributes = new Map();
    style = {};
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    toggleAttribute() {}
    removeAttribute() {}
  }
  const nodes = new Map(),
    previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => nodes.get(id) ?? nodes.set(id, new Element()).get(id),
  };
  const view = createFlameView(
    {
      game: g,
      loaded: true,
      actors: { flameReady: () => true },
      input: { clear() {} },
      hud: { update() {} },
      updateExpedition() {},
    },
    f.p,
  );
  try {
    await view.equip();
    assert.match(g.message ?? "", /out of fuel/i);
    assert.equal(JSON.stringify([g.flame, g.pistol, g.rifle, g.player.weapon]), before);
  } finally {
    view.dispose();
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

class Node extends EventTarget {
  constructor(tag = "") {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.scrollLeft = 0;
    this.style = { setProperty: (k, v) => (this.style[k] = v) };
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
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  querySelectorAll(sel) {
    return this.children.flatMap((n) => [
      ...(sel === "[data-weapon-id]" && n.dataset.weaponId ? [n] : sel === n.tagName.toLowerCase() ? [n] : []),
      ...n.querySelectorAll(sel),
    ]);
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0];
  }
  closest(sel) {
    return sel === "[data-weapon-id]" && this.dataset.weaponId ? this : null;
  }
  scrollTo({ left }) {
    this.scrollLeft = left;
    this.dispatchEvent(new Event("scroll"));
  }
}

test("row 5b: tapping an empty tile whose Gear control is disabled says it is empty; selection does not run", async () => {
  const { createWeaponTiles } = await import("../src/engine/weapon-tiles.js");
  const g = make().g,
    nodes = new Map(),
    previous = globalThis.document,
    el = (id) => nodes.get(id) ?? nodes.set(id, new Node()).get(id);
  g.flameFuel = { ...g.flameFuel, fuelUnits: 0 };
  const flame = carriedWeaponTiles(g).find((r) => /flame|emberProjector/.test(r.control));
  el(flame.control).disabled = true; // the Gear control is disabled at 0 fuel
  globalThis.document = { getElementById: el, createElement: (tag) => new Node(tag) };
  let selected = 0;
  const tiles = createWeaponTiles({ game: g, loaded: true, paused: false }, () => selected++);
  try {
    tiles.update();
    const track = el("weapon-tiles-track"),
      tile = track.querySelectorAll("[data-weapon-id]").find((b) => b.dataset.weaponId === flame.id);
    assert(tile && !tile.disabled, "an empty tile stays tappable");
    const click = new Event("click", { cancelable: true });
    Object.defineProperty(click, "target", { value: tile });
    track.dispatchEvent(click);
    assert.match(g.message, /Ember Projector is empty/);
    assert(g.messageUntil > g.time);
    assert.equal(selected, 0);
  } finally {
    tiles.dispose();
    globalThis.document = previous;
  }
});
