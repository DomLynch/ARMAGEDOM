import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { GAME_DATA, buildGameData } from "../src/engine/game-data.js";
import { validateLootBeams } from "../src/engine/game-data-loot-beams.js";
import { createLootStore } from "../src/engine/loot.js";
import { beamStyle, lootBeamsOn, queueBeam, strongestRarity } from "../src/engine/loot-beams.js";
import { createLootBeamsView } from "../src/engine/loot-beams-view.js";

// The loot beams (data/lootBeams.json): a light column and ground ring by rarity, none for common, at most maxBeams at once, off with ?nobeams=1.
const RULES = GAME_DATA.lootBeams,
  LOOT = GAME_DATA.loot,
  copy = () => structuredClone(RULES),
  run = (time = 10) => ({
    time,
    message: "",
    messageUntil: 0,
    world: { areaId: "yard" },
    player: { pos: { x: 1, z: 2 } },
  }),
  stage = (areaId = "yard") => ({ THREE: T, group: new T.Group(), areaId });

test("the shipped data passes its validator and is on by default", () => {
  assert.doesNotThrow(() => validateLootBeams(copy()));
  assert.equal(RULES.enabled, true);
  assert.equal(lootBeamsOn(RULES, ""), true);
  assert.equal(lootBeamsOn(RULES, "?nobeams=1"), false);
  assert.equal(lootBeamsOn(RULES, "?nobeams=0"), true);
  assert.equal(lootBeamsOn({ ...RULES, enabled: false }, ""), false);
  assert.ok(buildGameData().lootBeams);
});

test("the validator rejects bad data", () => {
  const bad = (edit, why) => {
    const d = copy();
    edit(d);
    assert.throws(() => validateLootBeams(d), why);
  };
  bad((d) => (d.extra = 1), /Invalid/);
  bad((d) => (d.schema_version = 2), /schema_version/);
  bad((d) => (d.maxBeams = 0), /maxBeams/);
  bad((d) => (d.maxBeams = 99), /maxBeams/);
  bad((d) => (d.offSwitch.param = "No Beams"), /offSwitch/);
  bad((d) => (d.pulse.depth = 2), /pulse.depth/);
  bad((d) => (d.styles = {}), /styles/);
  bad((d) => (d.styles.rare.colour = "56b4e"), /colour/);
  bad((d) => (d.styles.rare.colour = "#56b4e9"), /colour/);
  bad((d) => (d.styles.rare.opacity = 1.5), /opacity/);
  bad((d) => (d.styles.rare.seconds = 0.5), /seconds/);
  bad((d) => (d.styles.rare.beamHeight = -1), /beamHeight/);
  bad((d) => (d.styles.rare.beamSides = 2), /beamSides/);
  bad((d) => (d.styles.rare.ringSegments = 2), /ringSegments/);
  bad((d) => (d.styles.rare.rings = []), /rings/);
  bad((d) => (d.styles.rare.rings = [[0.9, 0.5]]), /inner/);
  bad((d) => (d.styles.rare.rings = [[0.5]]), /rings/);
  bad((d) => (d.styles.rare.unknown = 1), /Invalid/);
  bad((d) => delete d.styles.rare.colour, /Invalid/);
  bad((d) => (d.styles.Epic = d.styles.epic), /style name/);
});

test("every style names a loot rarity, common has none, and the palette is distinct with growing size", () => {
  const names = Object.keys(RULES.styles);
  for (const name of names) assert.ok(Object.hasOwn(LOOT.rarities, name), `${name} is a loot rarity`);
  assert.equal(beamStyle("common"), null);
  assert.equal(beamStyle("nonsense"), null);
  assert.equal(beamStyle("__proto__"), null);
  const ranked = LOOT.rarityOrder.filter((name) => names.includes(name)).map((name) => RULES.styles[name]);
  assert.equal(ranked.length, names.length);
  for (let i = 1; i < ranked.length; i++) {
    const [lo, hi] = [ranked[i - 1], ranked[i]];
    assert.ok(hi.beamHeight > lo.beamHeight, "taller with rarity");
    assert.ok(hi.beamRadius > lo.beamRadius, "wider with rarity");
    assert.ok(hi.ringRadius > lo.ringRadius, "bigger ring with rarity");
    assert.ok(hi.opacity > lo.opacity, "brighter with rarity");
    assert.ok(hi.seconds > lo.seconds, "lasts longer with rarity");
    assert.ok(hi.rings.length >= lo.rings.length, "no fewer rings with rarity");
  }
  assert.equal(new Set(names.map((n) => RULES.styles[n].colour)).size, names.length, "colours differ");
  // The ground shape (sides of the ring, count of bands) tells rarities apart without colour.
  assert.equal(
    new Set(names.map((n) => `${RULES.styles[n].ringSegments}/${RULES.styles[n].rings.length}`)).size,
    names.length,
  );
});

test("the strongest rarity in a drop is picked by the loot order", () => {
  const order = LOOT.rarityOrder;
  assert.equal(strongestRarity(["common", "epic", "rare"], order), "epic");
  assert.equal(strongestRarity(["legendary", "common"], order), "legendary");
  assert.equal(strongestRarity(["rare"], order), "rare");
  assert.equal(strongestRarity(["mystery", "common"], order), "common");
  assert.equal(strongestRarity([], order), null);
});

test("queueBeam styles the row by rarity, skips common and the off switch, and holds at most maxBeams", () => {
  const g = run();
  assert.equal(queueBeam(g, { x: 3, z: 4 }, "common", RULES, ""), null);
  assert.equal(g.loot, undefined);
  assert.equal(queueBeam(g, { x: 3, z: 4 }, "epic", RULES, "?nobeams=1"), null);
  const row = queueBeam(g, { x: 3, z: 4 }, "epic", RULES, "");
  assert.deepEqual(row, { x: 3, z: 4, area: "yard", rarity: "epic", from: 10, until: 10 + RULES.styles.epic.seconds });
  assert.deepEqual(g.loot.beams, [row]);
  for (let i = 0; i < RULES.maxBeams * 3; i++) queueBeam(g, { x: i, z: 0 }, "rare", RULES, "");
  assert.equal(g.loot.beams.length, RULES.maxBeams);
  assert.deepEqual(
    g.loot.beams.map((r) => r.x),
    Array.from({ length: RULES.maxBeams }, (_, i) => RULES.maxBeams * 2 + i),
    "the newest rows stay",
  );
});

test("a kill credit's loot queues a beam for its best rarity", () => {
  const g = run(),
    store = createLootStore({ api: null });
  store.receive(
    g,
    [
      { item_id: "roach-mandibles", qty: 1 },
      { item_id: "drone-chip", qty: 1 },
    ],
    { x: 5, z: 6 },
  );
  assert.equal(g.loot.beams.length, 1);
  assert.equal(g.loot.beams[0].rarity, "epic");
  assert.deepEqual([g.loot.beams[0].x, g.loot.beams[0].z], [5, 6]);
  assert.equal(g.loot.glints.length, 1, "the glint ring is unchanged");
  store.receive(g, [{ item_id: "hunter-cpu", qty: 1 }], { x: 1, z: 1 });
  assert.equal(g.loot.beams.at(-1).rarity, "rare");
});

test("the view draws one beam and ring per row from shared looks, in world coordinates, and never exceeds the pool cap", () => {
  const world = stage(),
    view = createLootBeamsView(world, { search: "", matchMedia: () => ({ matches: false }) }),
    g = run();
  assert.equal(world.group.children.length, 1);
  view.sync(g); // nothing queued: nothing built
  assert.equal(view.group.children.length, 0);
  for (let i = 0; i < RULES.maxBeams + 4; i++) queueBeam(g, { x: i, z: 1 }, i % 2 ? "rare" : "legendary", RULES, "");
  g.time += RULES.riseSeconds;
  view.sync(g);
  const meshes = view.group.children;
  assert.equal(meshes.length, RULES.maxBeams * 2);
  assert.ok(meshes.every((m) => m.visible));
  const geometries = new Set(meshes.map((m) => m.geometry)),
    materials = new Set(meshes.map((m) => m.material));
  assert.equal(materials.size, 2, "one material per rarity, shared by every beam of it");
  assert.ok(geometries.size <= 4, "one beam and one ring geometry per rarity");
  const first = meshes[0];
  assert.equal(first.position.z, -g.loot.beams[0].z, "the world's z is flipped");
  assert.equal(first.position.x, g.loot.beams[0].x);
  assert.ok(Math.abs(first.scale.y - 1) < 1e-9, "full height once risen");
  // Many more rows than the cap never add meshes.
  for (let i = 0; i < 50; i++) queueBeam(g, { x: i, z: 1 }, "epic", RULES, "");
  g.time += RULES.riseSeconds;
  view.sync(g);
  assert.equal(view.group.children.length, RULES.maxBeams * 2);
  assert.equal(view.group.children.filter((m) => m.visible).length, RULES.maxBeams * 2);
  view.dispose();
  assert.equal(world.group.children.length, 0);
});

test("a beam rises, holds and shrinks away, its row is dropped when spent, and the ring leaves with it", () => {
  const world = stage(),
    view = createLootBeamsView(world, { search: "", matchMedia: () => ({ matches: false }) }),
    g = run(),
    row = queueBeam(g, { x: 0, z: 0 }, "rare", RULES, "");
  view.sync(g);
  const [b, r] = view.group.children;
  assert.equal(b.scale.y, 0, "starts at nothing");
  g.time = row.from + RULES.riseSeconds / 2;
  view.sync(g);
  assert.ok(b.scale.y > 0 && b.scale.y < 1, "half risen");
  g.time = row.from + RULES.riseSeconds + 1;
  view.sync(g);
  assert.equal(b.scale.y, 1);
  assert.equal(r.scale.x, RULES.styles.rare.ringRadius);
  g.time = row.until - RULES.fadeSeconds / 2;
  view.sync(g);
  assert.ok(b.scale.y > 0 && b.scale.y < 1, "shrinking");
  g.time = row.until;
  view.sync(g);
  assert.equal(g.loot.beams.length, 0, "a spent row leaves the run");
  assert.equal(b.visible || r.visible, false);
  view.dispose();
});

test("reduced motion shows the beam at once, holds it still and cuts it at the end", () => {
  const view = createLootBeamsView(stage(), { search: "", matchMedia: () => ({ matches: true }) }),
    g = run(),
    row = queueBeam(g, { x: 0, z: 0 }, "legendary", RULES, ""),
    [beam] = (view.sync(g), view.group.children);
  assert.equal(beam.scale.y, 1, "no rise");
  const opacity = beam.material.opacity;
  assert.equal(opacity, RULES.styles.legendary.opacity);
  g.time += 1.3;
  view.sync(g);
  assert.equal(beam.material.opacity, opacity, "no pulse");
  g.time = row.until - RULES.fadeSeconds / 2;
  view.sync(g);
  assert.equal(beam.scale.y, 1, "no shrink");
  g.time = row.until;
  view.sync(g);
  assert.equal(beam.visible, false);
});

test("the pulse stays within its depth", () => {
  const view = createLootBeamsView(stage(), { search: "", matchMedia: () => ({ matches: false }) }),
    g = run();
  queueBeam(g, { x: 0, z: 0 }, "rare", RULES, "");
  const [beam] = (view.sync(g), view.group.children),
    top = RULES.styles.rare.opacity;
  for (let t = 0; t < 4; t += 0.1) {
    g.time = 10 + t;
    view.sync(g);
    assert.ok(beam.material.opacity <= top + 1e-9 && beam.material.opacity >= top * (1 - RULES.pulse.depth) - 1e-9);
  }
});

test("a beam waits for its own area and the view builds nothing with the switch off", () => {
  const g = run();
  queueBeam(g, { x: 0, z: 0 }, "epic", RULES, "");
  const other = createLootBeamsView(stage("cellar"), { search: "" });
  other.sync(g);
  assert.equal(other.group.children.filter((m) => m.visible).length, 0);
  const off = createLootBeamsView(stage(), { search: "?nobeams=1" });
  off.sync(g);
  assert.equal(off.group, null);
  off.dispose();
  other.dispose();
  const ruleOff = createLootBeamsView(stage(), { rules: { ...RULES, enabled: false }, search: "" });
  assert.equal(ruleOff.group, null);
});

test("each rarity builds geometry of its own height with a fading colour column", () => {
  const world = stage(),
    view = createLootBeamsView(world, { search: "", matchMedia: () => ({ matches: false }) }),
    g = run();
  for (const name of Object.keys(RULES.styles)) queueBeam(g, { x: 0, z: 0 }, name, RULES, "");
  g.time += RULES.riseSeconds;
  view.sync(g);
  const beams = view.group.children.filter((_, i) => i % 2 === 0);
  Object.keys(RULES.styles).forEach((name, i) => {
    const geometry = beams[i].geometry;
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.max.y - RULES.styles[name].beamHeight) < 1e-6, `${name} height`);
    assert.ok(Math.abs(geometry.boundingBox.min.y) < 1e-6, "stands on the ground");
    const colour = geometry.attributes.color;
    let low = 1,
      high = 0;
    for (let v = 0; v < colour.count; v++) {
      low = Math.min(low, colour.getX(v));
      high = Math.max(high, colour.getX(v));
    }
    assert.ok(Math.abs(high - 1) < 1e-6, "bright at the foot");
    assert.ok(low < 1e-6, "gone at the top");
  });
  view.dispose();
});
