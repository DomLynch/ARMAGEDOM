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

test("row 2: weapon switching has a keyboard binding", { todo: "no key switches weapons; Digit1 is Special" }, () => {
  const src = fs.readFileSync(new URL("../src/input.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /Digit1: "special"/, "Digit1 is taken by Special, not weapon switch");
  assert.match(src, /weapon-(next|prev|switch)|cycleWeapon|selectWeapon/, "a weapon-switch key exists");
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
  assert(carriedWeaponTiles(g).every((r) => typeof r.empty === "boolean"), "every row carries a boolean empty flag");
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
