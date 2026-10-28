import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateBurnPresentation } from "../src/engine/burn-presentation-data.js";
import { burnEnabled, createBurnPresentation, newBurnState, startsBurn, stepBurn } from "../src/engine/burn-presentation.js";

const row = GAME_DATA.burnPresentation;
const clone = () => structuredClone(row);

test("validator accepts the shipped row and rejects bad rows", () => {
  validateBurnPresentation(clone());
  const bad = (patch) => assert.throws(() => validateBurnPresentation(patch(clone())), TypeError);
  bad((d) => ((d.maxActors = 0), d));
  bad((d) => ((d.living.maxChar = 2), d));
  bad((d) => ((d.tint.sootColour = "red"), d));
  bad((d) => ((d.flame.heightMin = 0.9), d));
  bad((d) => ((d.flame.palette = []), d));
  bad((d) => ((d.smoke.reducedPuffs = 99), d));
  bad((d) => ((d.defaultOn = "yes"), d));
  bad((d) => ((d.texture.renderOrder = 1.5), d));
  assert.throws(() => validateBurnPresentation({ ...clone(), extra: 1 }));
});

test("default on, ?burn=0 turns it off, other values leave it on", () => {
  assert.equal(row.flagParam, "burn");
  assert.equal(burnEnabled(row, ""), true);
  assert.equal(burnEnabled(row, "?burn=0"), false);
  assert.equal(burnEnabled(row, "?burn=1&x=2"), true);
});

test("a living target chars while the flame holds, then cools and the state ends", () => {
  const e = { hp: 40, flameBurnUntil: 0 },
    s = newBurnState();
  let time = 0;
  for (let i = 0; i < 120; i++) {
    time += 1 / 60;
    e.flameBurnUntil = time + 0.35;
    stepBurn(row, s, e, time, 1 / 60);
  }
  assert.ok(s.char > 0 && s.char <= row.living.maxChar);
  assert.equal(s.heat, 1);
  assert.equal(s.smoke > 0, true);
  const peak = s.char;
  for (let i = 0; i < 60 * 8; i++) {
    time += 1 / 60;
    stepBurn(row, s, e, time, 1 / 60);
  }
  assert.equal(s.char, 0);
  assert.equal(s.heat, 0);
  assert.equal(peak > s.char, true);
});

test("a fire kill keeps burning and smoking, then only the char holds; a non-fire death does not start a burn", () => {
  const e = { hp: 0, flameBurnUntil: 10.2 },
    s = newBurnState();
  assert.equal(startsBurn(row, e, 10), true);
  stepBurn(row, s, e, 10, 0);
  assert.equal(s.dead && s.fireKill, true);
  assert.equal(s.heat, 1);
  stepBurn(row, s, e, 10 + row.dying.charSeconds, 0.1);
  assert.equal(s.char, row.dying.maxChar);
  assert.ok(s.heat < 1 && s.smoke > 0);
  stepBurn(row, s, e, 10 + row.dying.smokeSeconds + 1, 0.1);
  assert.equal(s.heat, 0);
  assert.equal(s.smoke, 0);
  assert.equal(s.char, row.dying.maxChar, "the corpse stays charred");
  const cold = { hp: 0, flameBurnUntil: 1 };
  assert.equal(startsBurn(row, cold, 50), false);
  assert.equal(startsBurn(row, { hp: 5 }, 50), false);
});

function fixture({ search = "", reduced = false } = {}) {
  const scene = new THREE.Scene(),
    world = { areaId: "area8", camera: new THREE.PerspectiveCamera() },
    mats = () => [new THREE.MeshStandardMaterial({ color: 0x806040, roughness: 0.5 })],
    makeView = () => {
      const material = mats()[0];
      return {
        flashMaterials: [
          {
            material,
            color: material.color.clone(),
            emissive: material.emissive.clone(),
            intensity: material.emissiveIntensity,
            roughness: material.roughness,
          },
        ],
      };
    },
    views = new Map(),
    g = { time: 5, player: { hp: 100, pos: { x: 0, z: 0 } }, enemies: [], corpses: [] },
    enemy = (id, x) => {
      const e = { id, hp: 30, pos: { x, z: 2 }, rig: "hollow-scavenger", mobSize: 1, flameBurnUntil: 0 };
      views.set(e, makeView());
      return e;
    },
    burn = createBurnPresentation({
      THREE,
      scene,
      world,
      getView: (e) => views.get(e),
      reducedMotion: () => reduced,
      enabled: burnEnabled(row, search),
    });
  return { scene, world, g, burn, enemy, views };
}
const run = (f, seconds, each = () => {}) => {
  for (let i = 0; i < seconds * 60; i++) {
    f.g.time += 1 / 60;
    each();
    f.burn.update(f.g);
  }
};

test("a burning living target gets soot and ember tint and pooled puffs; a cold target is untouched", () => {
  const f = fixture(),
    hot = f.enemy(1, 0),
    cold = f.enemy(2, 3);
  f.g.enemies = [hot, cold];
  const base = f.views.get(hot).flashMaterials[0].color.getHex();
  run(f, 1.5, () => (hot.flameBurnUntil = f.g.time + 0.35));
  const m = f.views.get(hot).flashMaterials[0].material;
  assert.notEqual(m.color.getHex(), base);
  assert.ok(m.emissiveIntensity > 0);
  assert.equal(f.views.get(cold).flashMaterials[0].material.color.getHex(), base);
  const snap = f.burn.snapshot();
  assert.equal(snap.tracked, 1);
  assert.ok(snap.smokePuffs > 0);
  hot.flameBurnUntil = 0;
  run(f, row.living.afterburnSeconds / 2);
  assert.ok(f.burn.snapshot().flamePuffs > 0, "afterburn licks continue after the flame leaves");
  run(f, row.living.afterburnSeconds * 2);
  assert.equal(f.burn.snapshot().flamePuffs, 0, "and end with the afterburn window");
});

test("the pool is bounded by maxActors and capacity, with at most two draw calls", () => {
  const f = fixture();
  f.g.enemies = Array.from({ length: 12 }, (_, i) => f.enemy(i + 1, i));
  run(f, 1, () => f.g.enemies.forEach((e) => (e.flameBurnUntil = f.g.time + 0.35)));
  f.g.enemies.forEach((e) => (e.flameBurnUntil = 0));
  f.burn.update(f.g);
  const s = f.burn.snapshot();
  assert.equal(s.actors, row.maxActors);
  assert.ok(s.flamePuffs <= row.maxActors * row.flame.puffs);
  assert.ok(s.smokePuffs <= row.maxActors * row.smoke.puffs);
  assert.ok(s.drawCalls <= 2);
  assert.equal(f.scene.children.filter((n) => n.isLight).length, 0);
});

test("reduced motion draws fewer puffs", () => {
  const full = fixture(),
    light = fixture({ reduced: true });
  for (const f of [full, light]) {
    const e = f.enemy(1, 0);
    f.g.enemies = [e];
    run(f, 1, () => (e.flameBurnUntil = f.g.time + 0.35));
    e.flameBurnUntil = 0;
    f.burn.update(f.g);
  }
  assert.ok(light.burn.snapshot().smokePuffs < full.burn.snapshot().smokePuffs);
});

test("a fire-killed corpse keeps burning, then is released when the corpse is removed", () => {
  const f = fixture(),
    e = f.enemy(1, 0);
  f.g.enemies = [e];
  run(f, 0.5, () => (e.flameBurnUntil = f.g.time + 0.35));
  e.hp = 0;
  f.g.enemies = [];
  f.g.corpses = [e];
  run(f, 3);
  const m = f.views.get(e).flashMaterials[0].material;
  assert.equal(f.burn.snapshot().tracked, 1);
  assert.ok(f.burn.snapshot().smokePuffs > 0);
  assert.ok(m.color.r < f.views.get(e).flashMaterials[0].color.r, "charred darker than the base");
  assert.equal(e.hp, 0, "presentation never writes simulation state");
  f.g.corpses = [];
  f.burn.update(f.g);
  const s = f.burn.snapshot();
  assert.equal(s.tracked, 0);
  assert.equal(s.smokePuffs + s.flamePuffs, 0);
  assert.equal(s.drawCalls, 0);
});

test("a flame-finisher corpse and a restored corpse are left to the existing flame code", () => {
  const f = fixture(),
    a = f.enemy(1, 0),
    b = f.enemy(2, 2);
  a.hp = b.hp = 0;
  a.flameBurnUntil = b.flameBurnUntil = f.g.time + 0.2;
  a.finisher = { recipeId: "flame-charred-collapse" };
  f.views.get(b).restoredCorpse = true;
  f.g.corpses = [a, b];
  run(f, 1);
  assert.equal(f.burn.snapshot().tracked, 0);
});

test("?burn=0 builds nothing, touches nothing and leaves the scene empty", () => {
  const f = fixture({ search: "?burn=0" }),
    e = f.enemy(1, 0);
  f.g.enemies = [e];
  const base = f.views.get(e).flashMaterials[0].material.color.getHex();
  run(f, 1, () => (e.flameBurnUntil = f.g.time + 0.35));
  assert.equal(f.views.get(e).flashMaterials[0].material.color.getHex(), base);
  assert.equal(f.scene.children.length, 0);
  assert.equal(f.burn.snapshot().enabled, false);
});

test("a flamed live drone keeps its own eye colour (its view is not restored per frame)", () => {
  const f = fixture(),
    e = f.enemy(1, 0),
    view = f.views.get(e),
    eye = view.flashMaterials[0].material.color;
  view.drone = {};
  eye.setHex(0xffb000);
  f.g.enemies = [e];
  run(f, 1.5, () => (e.flameBurnUntil = f.g.time + 0.35));
  assert.equal(eye.getHex(), 0xffb000);
  assert.ok(f.burn.snapshot().smokePuffs > 0, "the fire look itself still draws");
});

test("the pooled draws are built only when something first burns", () => {
  const f = fixture(),
    e = f.enemy(1, 0);
  f.g.enemies = [e];
  run(f, 1);
  assert.equal(f.scene.children.length, 0, "no fire, no scene objects");
  e.flameBurnUntil = f.g.time + 0.35;
  f.burn.update(f.g);
  assert.equal(f.scene.children.length, 2);
});

test("an area change or reset clears every look; dispose frees the pooled draws once", () => {
  const f = fixture(),
    e = f.enemy(1, 0);
  f.g.enemies = [e];
  run(f, 1, () => (e.flameBurnUntil = f.g.time + 0.35));
  assert.equal(f.burn.snapshot().tracked, 1);
  e.flameBurnUntil = 0;
  f.world.areaId = "area9";
  f.burn.update(f.g);
  assert.equal(f.burn.snapshot().tracked, 0);
  e.flameBurnUntil = f.g.time + 0.35;
  f.burn.update(f.g);
  f.burn.reset();
  assert.equal(f.burn.snapshot().tracked, 0);
  let geometries = 0;
  f.scene.children[0].geometry.addEventListener("dispose", () => geometries++);
  f.burn.dispose();
  f.burn.dispose();
  assert.equal(geometries, 1);
  assert.equal(f.scene.children.length, 0);
});

test("paused time does not advance the look", () => {
  const f = fixture(),
    e = f.enemy(1, 0);
  f.g.enemies = [e];
  run(f, 1, () => (e.flameBurnUntil = f.g.time + 0.35));
  const before = f.burn.snapshot().tracked;
  for (let i = 0; i < 10; i++) {
    f.g.time += 1;
    f.burn.update(f.g, { paused: true });
  }
  assert.equal(f.burn.snapshot().tracked, before);
});
