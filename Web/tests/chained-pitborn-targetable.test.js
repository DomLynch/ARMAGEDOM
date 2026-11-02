import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { make, collectPistol } from "./helpers/marked-fixture.js";
import { chainBreakState, sightPastStatue, chainedPitbornTarget, stepChainBreak } from "../src/engine/chain-break.js";
import { rangedTargets, resolveRangedAim, pistolCue, rangedPointerPoint } from "../src/pistol-targeting.js";
import { pickTouchTarget, selectedTouchTarget, applyTouchTarget, touchTargetCue } from "../src/engine/touch-target.js";
import { stepGame, attack } from "../src/combat.js";
import { PISTOL_RULES } from "../src/pistol.js";
import { createMobileAimState } from "../src/mobile-combat-aim.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// Dom, 28 Oct: the chained Pitborn on the Westminster steps could not be targeted or aimed at. It is a prop, so one stand-in (chainedPitbornTarget)
// is offered to every path that picks a body: ranged aim, the reticle, touch tap, mouse point, mobile auto-aim and the melee turn.
const ID = GAME_DATA.chainedPitborn.chainedTargets.aimTargetId;
const spawn = (p) => ({ id: 900, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
function armed() {
  const f = make();
  collectPistol(f);
  const g = f.g;
  g.world.safehouseData = null; // the fixture keeps a legacy Westminster safehouse; the shipped game has none
  g.world.layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url)));
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.pistol.equipped = true;
  const at = g.world.geometry.ground(GAME_DATA.chainedPitborn.at);
  return { g, at };
}
// Open ground within `max` metres of the Pitborn, with the statue as the only thing between it and the Pitborn.
function spot(g, at, { min = 3, max = 12 } = {}) {
  const w = g.world;
  for (let d = min; d <= max; d += 1)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2,
        o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (w.lineClear(o, o) && sightPastStatue(w, at, o)) return o;
    }
  throw Error("no spot");
}
const toward = (from, at, degrees = 0) => {
  const a = Math.atan2(at.z - from.z, at.x - from.x) + (degrees * Math.PI) / 180;
  return { x: Math.cos(a), z: Math.sin(a) };
};

test("the stand-in is a target only while chained, never an enemy, and is the same one chainedPitbornTarget gives", () => {
  const { g, at } = armed();
  assert.deepEqual(rangedTargets(g).map((t) => t.id), [ID]);
  assert.equal(rangedTargets(g, []).length, 1, "the view cull knows only real enemies, so it never hides the stand-in");
  assert.equal(g.enemies.length, 0, "it is not in the enemy list");
  assert.deepEqual(rangedTargets(g)[0].pos, at);
  chainBreakState(g).state = "snapping";
  assert.equal(chainedPitbornTarget(g), null);
  assert.equal(rangedTargets(g).length, 0, "once the chains are off it is no longer offered");
  chainBreakState(g).state = "chained";
  g.world.areaId = "east";
  assert.equal(rangedTargets(g).length, 0, "another area has none");
});

test("pistol, rifle and shotgun aim (resolveRangedAim) lock on it past the statue, with the reticle cue", () => {
  const { g, at } = armed();
  g.player.pos = spot(g, at);
  const aim = toward(g.player.pos, at, 8);
  for (const mode of ["pistol", "rifle", "shotgun"]) {
    g.pistol.equipped = mode === "pistol";
    g.rifle = { selected: mode === "rifle" };
    g.world.rifleData = { rules: PISTOL_RULES };
    g.bossEquipment = { shotgun: { selected: mode === "shotgun" } };
    g.world.bossEquipmentData = { shotgun: { rules: PISTOL_RULES } };
    const r = resolveRangedAim(g, aim);
    assert.equal(r.targetId, ID, mode);
    assert.equal(r.trace.targetId, ID, mode);
  }
  g.pistol.equipped = true;
  g.rifle = null;
  g.bossEquipment = null;
  g.player.facing = aim;
  const cue = pistolCue(g);
  assert.equal(cue.targetId, ID, "the reticle shows the lock");
  assert.deepEqual(cue.position, at);
});

test("assist off or a hard turn away does not lock; the aim stays a plain bullet line", () => {
  const { g, at } = armed();
  g.player.pos = spot(g, at);
  g.mobileAssistEnabled = false;
  assert.notEqual(resolveRangedAim(g, toward(g.player.pos, at, 90))?.targetId, ID);
});

test("touch tap on its posed body selects it, aims and fires at it, and the first hit snaps the chains with no damage taken", () => {
  const { g, at } = armed();
  g.player.pos = spot(g, at, { min: 4, max: 9 });
  g.world.toRender = (p, y = 0) => new T.Vector3(p.x, y, -p.z);
  const root = new T.Group();
  root.add(new T.Mesh(new T.BoxGeometry(1, 2, 0.5), new T.MeshBasicMaterial()));
  root.position.set(at.x, 1, -at.z);
  const views = { get: (id) => (id === ID ? { root, model: root } : undefined) };
  const camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
  camera.position.set(at.x, 1, -at.z + 10);
  camera.lookAt(at.x, 1, -at.z);
  camera.updateMatrixWorld();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }) };
  g.mobileAim = createMobileAimState(0);
  const pick = pickTouchTarget(g, views, camera, canvas, { x: 200, y: 400 });
  assert.equal(pick?.id, ID);
  assert.equal(pick.key, ID);
  g.touchTarget = pick;
  assert.equal(selectedTouchTarget(g).id, ID);
  assert.equal(touchTargetCue(g).targetId, ID);
  const intent = applyTouchTarget(g, { mobile: true, touchTargetSelection: pick });
  assert.equal(intent.aimTargetId, ID);
  const shotsBefore = g.pistol.magazine;
  stepGame(g, { mobile: true, touchTargetSelection: pick });
  assert.equal(g.pistol.magazine, shotsBefore - 1, "the paid round went at it");
  const shot = g.events.find((e) => e.type === "shot");
  assert.equal(shot.targetId, ID);
  g.events = [shot]; // the hunter step (stepChainBreak) reads the tick's events
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "snapping");
  assert.equal(g.enemies.length, 0, "no damage, no enemy");
});

test("mobile auto-target: holding fire while moving near it locks it and the shot breaks the chains", () => {
  const { g, at } = armed();
  g.player.pos = spot(g, at, { min: 4, max: 9 });
  g.player.facing = toward(g.player.pos, at, 6); // a little off: only the lock turns the shot onto it
  g.mobileAim = createMobileAimState(Math.atan2(g.player.facing.x, g.player.facing.z));
  stepGame(g, { mobile: true, moveHeld: true, move: { x: 0, z: 0 }, held: ["fire"] });
  const shot = g.events.find((e) => e.type === "shot");
  assert(shot, "fired");
  assert.equal(shot.targetId, ID);
  g.events = [shot];
  stepChainBreak(g, spawn, true);
  assert.notEqual(chainBreakState(g).state, "chained", "the shot broke the chains");
});

test("mouse and keyboard pointer: aiming the cursor at its body gives an aim point on it and its id", () => {
  const { g, at } = armed();
  g.player.pos = spot(g, at, { min: 4, max: 9 });
  const camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
  camera.position.set(at.x, 1, -at.z + 10);
  camera.lookAt(at.x, 1, -at.z);
  camera.updateMatrixWorld();
  const ray = new T.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  g.world.ray = Object.assign(ray, { intersectObjects: () => [] });
  g.world.screenToGround = () => ({ x: at.x + 5, z: at.z + 5 });
  const views = { get: () => undefined };
  const point = rangedPointerPoint(g, views, 0, 0);
  assert.equal(point.targetId, ID);
  assert.deepEqual({ x: point.x, z: point.z }, { x: at.x, z: at.z });
});

test("melee: a swing that starts off to the side turns toward the shackled Pitborn", () => {
  const { g, at } = armed();
  g.pistol.equipped = false;
  g.player.weapon = "knife";
  g.player.pos = spot(g, at, { min: 1.5, max: 2 });
  g.player.ready = 0;
  const aim = toward(g.player.pos, at, 20);
  attack(g, "slash", aim);
  const face = g.player.facing,
    want = toward(g.player.pos, at);
  assert(face.x * want.x + face.z * want.z > 0.999, "the swing is aimed at it");
});
