import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { KNIFE_MOVES } from "../src/donor/knife.js";
import { CREATURE_MOVES } from "../src/creature-moves.js";
import { validateTelegraph } from "../src/engine/game-data-telegraph.js";
import {
  collectTelegraphs,
  createTelegraphSet,
  growth,
  opacityAt,
  telegraphOn,
  telegraphProgress,
} from "../src/engine/telegraph.js";
import { createTelegraphView } from "../src/engine/telegraph-view.js";
import { arcKind, pointCapacity, shapePoints, signedArea, stripBuffers } from "../src/engine/telegraph-shape.js";

// Attack telegraphs (data/telegraph.json): a ground shape that fills as an enemy's wind-up runs and is whole when the hit lands. The
// shape numbers are the ones the damage check uses, the pool never grows past maxVisible, and reduced motion shows a static fill.
const RULES = GAME_DATA.telegraph;
const near = (a, b, why = "") => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);
const FRAME = 1 / 60;

let serial = 0;
const enemy = (x, z, extra = {}) => ({
  id: ++serial,
  hp: 50,
  pos: { x, z },
  facing: { x: 1, z: 0 },
  combatScale: 1,
  ...extra,
});
const swingOf = (def, start, dir = { x: 1, z: 0 }) => ({ def, start, dir, hitAt: start + def.windupTicks / 60 });
const game = (extra = {}) => ({
  time: 10,
  tick: 600,
  finished: false,
  player: { hp: 100, pos: { x: 0, z: 0 } },
  enemies: [],
  areaHazards: [],
  world: { areaId: "westminster" },
  ...extra,
});
const collect = (g) => collectTelegraphs(g, createTelegraphSet());

// Point inside a polygon of x, z pairs (ray casting).
function inside(points, count, x, z) {
  let hit = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[2 * i],
      zi = points[2 * i + 1],
      xj = points[2 * j],
      zj = points[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
const polar = (reach, degrees) => [
  Math.sin((degrees * Math.PI) / 180) * reach,
  Math.cos((degrees * Math.PI) / 180) * reach,
];

test("the shipped data is valid and a bad row is refused", () => {
  assert.equal(RULES.enabled, true);
  assert.equal(RULES.offSwitch.param, "notelegraph");
  validateTelegraph(structuredClone(RULES));
  const edits = [
    (d) => (d.enabled = "yes"),
    (d) => (d.maxVisible = 0),
    (d) => (d.maxVisible = 33),
    (d) => (d.extra = 1),
    (d) => delete d.fill,
    (d) => (d.fill.endOpacity = d.fill.startOpacity / 2),
    (d) => (d.fill.reducedOpacity = 0),
    (d) => (d.edge.startOpacity = 1.5),
    (d) => (d.colours.fill = "red"),
    (d) => (d.colours.edge = "#fff1d6"),
    (d) => (d.colours.extra = "ffffff"),
    (d) => (d.pattern.gapOpacity = 1),
    (d) => (d.pattern.solidShare = 1),
    (d) => (d.pattern.periodMetres = 0),
    (d) => (d.turnSegments = 4),
    (d) => (d.minArcSegments = d.turnSegments + 1),
    (d) => (d.fullArcDegrees = 90),
    (d) => (d.minGrowth = 1),
    (d) => (d.edgeMetres = 0),
    (d) => (d.haloMetres = 1),
    (d) => (d.miterLimit = 0.5),
    (d) => (d.groundHeight = 1),
    (d) => (d.offSwitch.param = "No Telegraph"),
    (d) => (d.schema_version = 2),
  ];
  for (const edit of edits) {
    const copy = structuredClone(RULES);
    edit(copy);
    assert.throws(() => validateTelegraph(copy), /telegraph|Invalid/);
  }
});

test("on by default, off with ?notelegraph=1 and by the data switch", () => {
  assert.equal(telegraphOn(RULES, ""), true);
  assert.equal(telegraphOn(RULES, "?x=1"), true);
  assert.equal(telegraphOn(RULES, "?notelegraph=0"), true);
  assert.equal(telegraphOn(RULES, "?notelegraph=1"), false);
  assert.equal(telegraphOn({ ...RULES, enabled: false }, ""), false);
  const scene = new T.Scene(),
    off = createTelegraphView({ game: game(), scene, loaded: true }, { search: "?notelegraph=1" });
  off.update();
  off.dispose();
  assert.equal(scene.children.length, 0);
});

test("progress is elapsed over wind-up, 0 to 1, and a wind-up of no length is complete", () => {
  near(telegraphProgress(0, 0.5), 0);
  near(telegraphProgress(0.25, 0.5), 0.5);
  near(telegraphProgress(0.5, 0.5), 1);
  near(telegraphProgress(0.9, 0.5), 1);
  near(telegraphProgress(-0.1, 0.5), 0);
  near(telegraphProgress(0.1, 0), 1);
  near(growth(0, RULES), RULES.minGrowth);
  near(growth(1, RULES), 1);
  near(growth(0.5, RULES), RULES.minGrowth + (1 - RULES.minGrowth) / 2);
  near(opacityAt(0, 0.2, 0.9), 0.2);
  near(opacityAt(1, 0.2, 0.9), 0.9);
  near(opacityAt(0.5, 0.2, 0.9), 0.55);
  near(opacityAt(0.5, 0.2, 0.9, 0.4), 0.4);
});

test("a melee swing is a cone of the hit check's reach and arc, filling over its wind-up and held through the active frames", () => {
  const heavy = KNIFE_MOVES.heavy_overhead,
    e = enemy(3, 4, { combatScale: 1.25, swing: swingOf(heavy, 10) }),
    g = game({ enemies: [e] });
  let set = collect(g);
  assert.equal(set.count, 1);
  let r = set.rows[0];
  assert.deepEqual([r.owner, r.source, r.kind], [e.id, "swing", "cone"]);
  near(r.reach, heavy.range * 1.25, "reach is range times combat scale, as the hit check tests");
  near(r.arc, heavy.arc, "arc");
  assert.deepEqual([r.x, r.z, r.dx, r.dz], [3, 4, 1, 0]);
  near(r.progress, 0);
  const windup = heavy.windupTicks / 60;
  for (const share of [0.25, 0.5, 0.99]) {
    g.time = 10 + windup * share;
    near(collect(g).rows[0].progress, share, `progress at ${share}`);
  }
  g.time = 10 + windup;
  near(collect(g).rows[0].progress, 1, "whole when the hit lands");
  g.time = 10 + windup + (heavy.activeTicks - 1) / 60;
  near(collect(g).rows[0].progress, 1, "held full while the hit is live");
  g.time = 10 + windup + heavy.activeTicks / 60;
  assert.equal(collect(g).count, 0, "gone once the active frames end");
  g.time = 10;
  e.swing = null;
  assert.equal(collect(g).count, 0, "a staggered enemy loses its swing and its telegraph");
  e.swing = swingOf(heavy, 10);
  e.hp = 0;
  assert.equal(collect(g).count, 0, "a dead enemy shows none");
  e.hp = 50;
  g.player.hp = 0;
  assert.equal(collect(g).count, 0, "nothing shows once the player is down");
});

test("every knife and creature move reaches exactly as far as its data says", () => {
  const moves = { ...KNIFE_MOVES, ...CREATURE_MOVES };
  let seen = 0;
  for (const [name, def] of Object.entries(moves)) {
    if (!(def.windupTicks > 0) || !(def.range > 0)) continue;
    const animal = def.ratBite || def.ratLow,
      e = enemy(0, 2, { combatScale: 1.5, swing: swingOf(def, 10) }),
      r = collect(game({ enemies: [e] })).rows[0];
    near(r.reach, def.range * (animal ? 1 : 1.5), `${name} reach`);
    near(r.arc, def.arc ?? 90, `${name} arc`);
    assert.equal(r.kind, arcKind(def.arc ?? 90, RULES), `${name} kind`);
    seen++;
  }
  assert.ok(seen >= 8, `checked ${seen} moves`);
  // An animal with a mouth contact reach is drawn out to that reach, the distance its bite is tested from.
  const dog = enemy(0, 2, { contactGoalReach: 1.4, swing: swingOf(CREATURE_MOVES.dog_bite, 10) });
  near(collect(game({ enemies: [dog] })).rows[0].reach, 1.4);
});

test("a full-turn swing is a circle, a narrower one a cone", () => {
  const spin = { ...KNIFE_MOVES.heavy_overhead, arc: 360 },
    r = collect(game({ enemies: [enemy(0, 2, { swing: swingOf(spin, 10) })] })).rows[0];
  assert.equal(r.kind, "circle");
  assert.equal(arcKind(RULES.fullArcDegrees - 1, RULES), "cone");
  assert.equal(arcKind(RULES.fullArcDegrees, RULES), "circle");
});

test("a cone outline holds exactly the points the hit check accepts", () => {
  const points = new Float32Array(2 * pointCapacity(RULES));
  for (const [reach, arc] of [
    [1.5, 90],
    [3.2, 120],
    [2.2, 60],
    [6, 12],
    [4.86, 30],
    [2, 270],
  ]) {
    const n = shapePoints("cone", reach, arc, 0, points, RULES);
    assert.ok(n <= pointCapacity(RULES));
    assert.ok(signedArea(points, n) !== 0);
    const half = arc / 2;
    assert.ok(inside(points, n, 0, 0.01), "just ahead of the apex");
    // The arc is drawn as chords, so the rim is checked a little inside the reach.
    const rim = Math.cos(Math.PI / RULES.turnSegments);
    for (const frac of [-0.9, -0.5, 0, 0.5, 0.9]) {
      const [x, z] = polar(reach * rim * 0.97, half * frac);
      assert.ok(inside(points, n, x, z), `inside at ${frac} of the half arc, reach ${reach}, arc ${arc}`);
    }
    for (const outsideAt of [polar(reach * 1.03, 0), polar(reach * 0.9, half + 2), polar(reach * 0.9, -half - 2)])
      assert.ok(!inside(points, n, ...outsideAt), `outside ${outsideAt}, reach ${reach}, arc ${arc}`);
    for (let i = 1; i < n; i++)
      assert.ok(Math.hypot(points[2 * i], points[2 * i + 1]) <= reach + 1e-5, "no point beyond the reach");
  }
});

test("a circle is the radius all round and a line is its length and width", () => {
  const points = new Float32Array(2 * pointCapacity(RULES)),
    n = shapePoints("circle", 2, RULES.fullArcDegrees, 0, points, RULES);
  assert.equal(n, RULES.turnSegments);
  for (let i = 0; i < n; i++) near(Math.hypot(points[2 * i], points[2 * i + 1]), 2, `circle point ${i}`);
  assert.ok(inside(points, n, -1.9, 0) && inside(points, n, 0, 1.9) && !inside(points, n, 2.1, 0));
  const m = shapePoints("line", 12, 0, 3, points, RULES);
  assert.equal(m, 4);
  assert.ok(
    inside(points, m, 0, 11.9) &&
      inside(points, m, 1.4, 0.1) &&
      !inside(points, m, 1.6, 5) &&
      !inside(points, m, 0, 12.1),
  );
});

test("the outline strip keeps its width inside the shape", () => {
  const points = new Float32Array(2 * pointCapacity(RULES)),
    positions = new Float32Array(6 * pointCapacity(RULES)),
    index = new Uint16Array(6 * pointCapacity(RULES)),
    n = shapePoints("circle", 3, RULES.fullArcDegrees, 0, points, RULES),
    used = stripBuffers(points, n, RULES.edgeMetres, 0, RULES.miterLimit, positions, index);
  assert.equal(used, 6 * n);
  for (let i = 0; i < n; i++) {
    near(Math.hypot(positions[6 * i + 3], positions[6 * i + 5]), 3, "outer edge on the rim");
    near(
      Math.hypot(positions[6 * i], positions[6 * i + 2]),
      3 - RULES.edgeMetres / Math.cos(Math.PI / n),
      "inner edge one width in",
    );
  }
  assert.ok(index.slice(0, used).every((v) => v < 2 * n));
  // A thin line keeps the same width along its sides.
  const m = shapePoints("line", 12, 0, 3, points, RULES);
  stripBuffers(points, m, RULES.edgeMetres, 0, RULES.miterLimit, positions, index);
  const widths = [0, 1, 2, 3].map((i) =>
    Math.hypot(positions[6 * i + 3] - positions[6 * i], positions[6 * i + 5] - positions[6 * i + 2]),
  );
  for (const w of widths)
    assert.ok(w >= RULES.edgeMetres - 1e-6 && w <= RULES.edgeMetres * RULES.miterLimit + 1e-6, `corner width ${w}`);
});

test("a flame warning fills over its wind-up ticks in the profile's cone", () => {
  const profile = GAME_DATA.creatures.salamanderBreath,
    e = enemy(1, 1, { bossWeapon: { phase: "warning", profile, startTick: 600, direction: { x: 0, z: 1 } } }),
    g = game({ enemies: [e] });
  g.tick = 600 + profile.windupTicks / 2;
  const r = collect(g).rows[0];
  assert.deepEqual(
    [r.source, r.kind, r.reach, r.arc, r.dx, r.dz],
    ["flame", "cone", profile.range, profile.coneDegrees, 0, 1],
  );
  near(r.progress, 0.5);
  e.bossWeapon.phase = "active";
  assert.equal(collect(g).count, 0, "gone when the flame starts");
});

test("a saw wind-up fills until its active phase starts", () => {
  const weapon = { kind: "saw", windupTicks: 60, range: 1.6, coneDegrees: 38 },
    e = enemy(0, 3, { bossProfile: { weapon }, sawPhase: { phase: "windup", until: 10.75 } }),
    g = game({ enemies: [e] }),
    r = collect(g).rows[0];
  assert.deepEqual([r.source, r.kind, r.reach, r.arc], ["saw", "cone", 1.6, 38]);
  near(r.progress, 0.25);
  e.sawPhase.phase = "active";
  assert.equal(collect(g).count, 0);
});

test("a boss shotgun is its pellet fan and a rocket its flight line as wide as the blast", () => {
  const rules = GAME_DATA.weapons.bossRanged,
    fan = GAME_DATA.bossRangedExtra.shotgun,
    ranged = (rig) => ({ phase: "warning", start: 10, releaseAt: 10 + rules[rig].warning, bearing: { x: 0, z: 1 } }),
    gun = enemy(0, 5, { rig: "boss-south-nightborn", bossRanged: ranged("boss-south-nightborn") }),
    launcher = enemy(0, 6, { rig: "boss-butcher", bossRanged: ranged("boss-butcher") }),
    g = game({ enemies: [gun, launcher] });
  g.time = 10 + rules["boss-south-nightborn"].warning / 2;
  const set = collect(g),
    a = set.rows.find((r) => r.owner === gun.id),
    b = set.rows.find((r) => r.owner === launcher.id);
  assert.deepEqual([a.kind, a.reach, a.arc], ["cone", rules["boss-south-nightborn"].range, 2 * fan.spreadDegrees]);
  near(a.progress, 0.5);
  assert.deepEqual([b.kind, b.reach, b.width], ["line", rules["boss-butcher"].range, 2 * rules["boss-butcher"].radius]);
  near(b.progress, rules["boss-south-nightborn"].warning / 2 / rules["boss-butcher"].warning);
});

test("a poison patch is a circle of its radius that fills over its warning", () => {
  const config = { warning: 1, radius: 0.9, duration: 2, interval: 1, damage: 2 },
    boss = enemy(0, 4, { bossProfile: { hazard: config } }),
    g = game({
      enemies: [boss],
      areaHazards: [
        { ownerId: boss.id, areaId: "westminster", position: { x: 2, z: 3 }, radius: 0.9, startsAt: 11, expiresAt: 13 },
      ],
    });
  g.time = 10.25;
  const r = collect(g).rows[0];
  assert.deepEqual([r.source, r.kind, r.x, r.z, r.reach], ["hazard", "circle", 2, 3, 0.9]);
  near(r.progress, 0.25);
  g.time = 11;
  assert.equal(collect(g).count, 0, "the active patch has its own view");
  g.time = 10.5;
  g.areaHazards[0].areaId = "other";
  assert.equal(collect(g).count, 0, "another area's patch is not shown");
});

test("at most maxVisible are kept, and they are the nearest to the player", () => {
  const def = KNIFE_MOVES.light_right,
    enemies = Array.from({ length: 20 }, (_, i) => enemy(i + 1, 0, { swing: swingOf(def, 10) })),
    set = collect(game({ enemies }));
  assert.equal(set.count, RULES.maxVisible);
  assert.deepEqual(
    set.rows.map((r) => r.x).sort((a, b) => a - b),
    Array.from({ length: RULES.maxVisible }, (_, i) => i + 1),
  );
  const reversed = collect(game({ enemies: [...enemies].reverse() }));
  assert.deepEqual(
    reversed.rows.map((r) => r.x).sort((a, b) => a - b),
    Array.from({ length: RULES.maxVisible }, (_, i) => i + 1),
  );
});

// A scene, a fake game of swinging enemies and a view over them.
function rig({ reduced = false, count = 1 } = {}) {
  const def = KNIFE_MOVES.heavy_overhead,
    enemies = Array.from({ length: count }, (_, i) => enemy(i + 1, 0, { swing: swingOf(def, 10) })),
    g = game({ enemies }),
    scene = new T.Scene(),
    s = { game: g, scene, loaded: true, contextLost: false, traveling: false },
    view = createTelegraphView(s, { search: "", matchMedia: () => ({ matches: reduced }) });
  return { g, s, scene, view, def, enemies, shown: () => view.slots.filter((slot) => slot.root.visible) };
}

test("the fill grows to the whole shape and the outline brightens exactly as the hit lands", () => {
  const { g, view, def, shown } = rig();
  const windup = def.windupTicks / 60;
  view.update();
  let slot = shown()[0];
  near(slot.fill.material.opacity, RULES.fill.startOpacity);
  near(slot.edge.material.opacity, RULES.edge.startOpacity);
  near(slot.fill.scale.x, RULES.minGrowth);
  g.time = 10 + windup / 2;
  view.update();
  slot = shown()[0];
  near(slot.fill.scale.x, growth(0.5, RULES));
  near(slot.fill.material.opacity, opacityAt(0.5, RULES.fill.startOpacity, RULES.fill.endOpacity));
  g.time = 10 + windup;
  view.update();
  slot = shown()[0];
  near(slot.fill.scale.x, 1);
  near(slot.fill.scale.z, 1);
  near(slot.fill.material.opacity, RULES.fill.endOpacity);
  near(slot.edge.material.opacity, RULES.edge.endOpacity);
  near(slot.halo.material.opacity, RULES.haloOpacity);
  g.time = 10 + windup + def.activeTicks / 60;
  view.update();
  assert.equal(shown().length, 0, "vanishes after the hit");
  assert.equal(view.slots.length, 1, "the slot is kept for the next attack");
  view.dispose();
});

test("the shape sits at the attacker and points along the swing, in render coordinates", () => {
  const { g, view, enemies, shown } = rig();
  enemies[0].pos = { x: 3, z: 4 };
  enemies[0].swing.dir = { x: 0, z: -1 };
  g.time = 10.1;
  view.update();
  const root = shown()[0].root;
  near(root.position.x, 3);
  near(root.position.z, -4);
  near(root.position.y, RULES.groundHeight);
  const ahead = new T.Vector3(0, 0, 1).applyEuler(root.rotation);
  near(ahead.x, 0);
  near(ahead.z, 1, "sim -z is render +z, the way the effects outline points");
  view.dispose();
});

test("reduced motion shows a static striped fill at one opacity", () => {
  const { g, view, def, shown } = rig({ reduced: true });
  for (const share of [0, 0.5, 1]) {
    g.time = 10 + (def.windupTicks / 60) * share;
    view.update();
    const slot = shown()[0];
    near(slot.fill.scale.x, 1, `whole shape at ${share}`);
    near(slot.fill.material.opacity, RULES.fill.reducedOpacity);
    near(slot.edge.material.opacity, RULES.edge.endOpacity);
    assert.ok(slot.fill.material.map, "the stripes stay");
  }
  view.dispose();
});

test("the fill is striped and the outline is a separate bright colour, so colour is never the only cue", () => {
  const { view, shown } = rig();
  view.update();
  const slot = shown()[0],
    map = slot.fill.material.map,
    alphas = new Set();
  for (let i = 3; i < map.image.data.length; i += 4) alphas.add(map.image.data[i]);
  assert.equal(alphas.size, 2, "solid and lighter bands");
  assert.ok(Math.min(...alphas) < Math.max(...alphas));
  assert.notEqual(slot.fill.material.color.getHex(), slot.edge.material.color.getHex());
  assert.ok(
    slot.edge.material.color.getHSL({}).l > slot.fill.material.color.getHSL({}).l,
    "outline is the lighter of the two",
  );
  assert.ok(
    slot.halo.material.color.getHSL({}).l < slot.fill.material.color.getHSL({}).l,
    "halo is the darker of the two",
  );
  view.dispose();
});

test("the pool never grows past maxVisible and a steady run makes no new meshes", () => {
  const { g, scene, view, enemies, shown } = rig({ count: 30 });
  for (let i = 0; i < 120; i++) {
    g.time = 10 + i * FRAME;
    for (const e of enemies) e.swing.start = g.time - (i % 20) * FRAME;
    view.update();
    assert.ok(shown().length <= RULES.maxVisible);
  }
  assert.equal(view.slots.length, RULES.maxVisible);
  assert.equal(scene.children.length, RULES.maxVisible);
  const geometries = view.slots.map((slot) => slot.fill.geometry);
  for (let i = 0; i < 60; i++) {
    g.time += FRAME;
    view.update();
  }
  assert.equal(scene.children.length, RULES.maxVisible);
  assert.deepEqual(
    view.slots.map((slot) => slot.fill.geometry),
    geometries,
    "the same buffers are reused",
  );
  view.dispose();
  assert.equal(scene.children.length, 0, "dispose takes every mesh out of the scene");
});

test("a slot is rebuilt only when its shape changes, and a freed slot is reused by the next attack", () => {
  const { g, view, enemies, shown } = rig({ count: 2 });
  view.update();
  const ids = shown().map((slot) => slot.fill.geometry.id);
  g.time += FRAME;
  const before = shown().map((slot) => slot.reach);
  view.update();
  assert.deepEqual(
    shown().map((slot) => slot.fill.geometry.id),
    ids,
  );
  assert.deepEqual(
    shown().map((slot) => slot.reach),
    before,
  );
  enemies[0].swing = null;
  view.update();
  assert.equal(shown().length, 1);
  enemies[0].swing = swingOf(KNIFE_MOVES.thrust, g.time);
  view.update();
  assert.equal(shown().length, 2);
  assert.equal(view.slots.length, 2, "the freed slot was reused");
  view.dispose();
});

test("nothing is drawn while traveling, before load, after the context is lost or when the run is over", () => {
  for (const patch of [{ traveling: true }, { loaded: false }, { contextLost: true }]) {
    const { s, view, shown } = rig();
    Object.assign(s, patch);
    view.update();
    assert.equal(shown().length, 0, JSON.stringify(patch));
    view.dispose();
  }
  const { g, view, shown } = rig();
  view.update();
  assert.equal(shown().length, 1);
  g.finished = true;
  view.update();
  assert.equal(shown().length, 0);
  view.dispose();
});
