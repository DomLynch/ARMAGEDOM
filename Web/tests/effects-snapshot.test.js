// Snapshot differential for effects.js (phase 2b: effects.js 218 to 0). The golden file was recorded on main BEFORE any number moved,
// by running this same scenario against the unchanged effects.js. After the numbers moved into data, the scenario must produce the
// identical dump. To re-record (only when a visible change is intended and called out in the PR): EFFECTS_SNAPSHOT_UPDATE=1.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createEffects, createAudio } from "../src/effects.js";

const GOLDEN = new URL("./fixtures/effects-snapshot.json", import.meta.url);
const r = (n) => Math.round(n * 1e9) / 1e9;
const vec = (v) => [r(v.x), r(v.y), r(v.z)];

function camera() {
  const c = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
  c.position.set(0, 10, 20);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function makeWorld() {
  const cam = camera();
  return { camera: cam, areaId: "westminster", lineClear: () => true, toRender: (p, h = 0) => new THREE.Vector3(p.x, h, -p.z) };
}
function dumpNode(o) {
  const out = { type: o.type, name: o.name, visible: o.visible, pos: vec(o.position), quat: [r(o.quaternion.x), r(o.quaternion.y), r(o.quaternion.z), r(o.quaternion.w)], scale: vec(o.scale), order: o.renderOrder };
  const m = o.material;
  if (m && !Array.isArray(m))
    out.material = { type: m.type, color: m.color?.getHex?.() ?? null, opacity: r(m.opacity ?? 1), transparent: m.transparent, depthTest: m.depthTest, depthWrite: m.depthWrite };
  const g = o.geometry;
  if (g?.parameters) out.parameters = JSON.parse(JSON.stringify(g.parameters, (k, v) => (typeof v === "number" ? r(v) : v)));
  if (g?.attributes?.position && g.attributes.position.count < 120) out.verts = Array.from(g.attributes.position.array, r);
  if (o.isInstancedMesh) {
    out.instances = [];
    const mat = new THREE.Matrix4(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      c = new THREE.Color();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, mat);
      mat.decompose(p, q, s);
      let hex = null;
      if (o.instanceColor) {
        o.getColorAt(i, c);
        hex = c.getHex();
      }
      out.instances.push([vec(p), vec(s), hex, [r(q.x), r(q.y), r(q.z), r(q.w)]]);
    }
  }
  out.children = o.children.map(dumpNode);
  return out;
}
const dumpScene = (scene) => scene.children.map(dumpNode);

const actor = { id: 0, pos: { x: 0, z: 0 }, facing: { x: 0, z: 1 }, hp: 150, combatScale: 1.265 };
function game(extra = {}) {
  return { pilot: "donor-knife", time: 1, player: { ...actor }, pistol: { equipped: true, collected: true }, events: [], enemies: [], corpses: [], bolts: [], loot: [], ...extra };
}
function fresh(options = {}, asset = null) {
  const world = makeWorld(),
    scene = new THREE.Scene(),
    views = new Map(),
    marker = { hidden: true, style: {}, textContent: "" },
    fx = createEffects(scene, world, asset, () => null, { getView: (e) => views.get(e.id), hitMarker: marker, ...options });
  return { world, scene, views, marker, fx };
}
const snap = (f) => JSON.parse(JSON.stringify(f.fx.snapshot(), (k, v) => (typeof v === "number" ? r(v) : v)));
const shot = (extra = {}) => ({ type: "shot", actor, origin: { x: 0, z: 0 }, end: { x: 2, z: 3 }, direction: { x: 0, z: 1 }, ...extra });
const victimOf = (id = 1, extra = {}) => ({ id, pos: { x: 2, z: 3 }, facing: { x: 0, z: -1 }, hp: 40, kind: 0, ...extra });
const hit = (a, extra = {}) => ({ type: "hit", actor: a, position: a.pos, weapon: "pistol", amount: 25, impactDirection: { x: 1, z: 0 }, ...extra });
const strike = (a, extra = {}) => ({ type: "strike", actor: a, dir: { x: 0, z: 1 }, ...extra });

function pistolAsset() {
  const root = new THREE.Group(),
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  root.add(mesh);
  return { scene: root };
}

function scenarios() {
  const out = {};
  // 0. A fresh effects object: every owned mesh, geometry and material at rest, with and without a pistol asset.
  out.construct = dumpScene(fresh().scene);
  out.constructAsset = dumpScene(fresh({}, pistolAsset()).scene);

  // 1. Shots in each feedback mode and with reduced motion.
  for (const mode of ["high", "low", "off"]) {
    const f = fresh(),
      g = game();
    f.fx.configureFeedback(mode);
    g.events = [shot(), shot({ weapon: "shotgun", pellets: [{ end: { x: 1, z: 4 } }, { end: { x: -1, z: 4 } }] })];
    f.fx.events(g);
    f.fx.update(g);
    const frames = [];
    for (let i = 0; i < 4; i++) {
      f.fx.advance(0.016);
      frames.push({ snap: snap(f), recoil: r(f.fx.pistolRecoil(g)), scene: dumpScene(f.scene) });
    }
    out[`shots_${mode}`] = { snap: snap(f), frames };
  }
  {
    let reduced = true;
    const f = fresh({ reducedMotion: () => reduced }),
      g = game();
    g.events = [shot()];
    f.fx.events(g);
    f.fx.update(g);
    f.fx.advance(0.02);
    out.shots_reduced = { snap: snap(f), scene: dumpScene(f.scene) };
    reduced = false;
    f.fx.advance(0.02);
    out.shots_reducedOff = snap(f);
  }

  // 2. Hits and kills, in each mode, with rig height rows, mob sizes and the hit marker.
  for (const mode of ["high", "low", "off"])
    for (const killed of [false, true]) {
      const f = fresh(),
        v = victimOf(1, { mobSize: 1.4 }),
        g = game({ enemies: [v] });
      f.fx.configureFeedback(mode);
      g.events = killed ? [hit(v), { type: "death", actor: v }] : [hit(v)];
      f.fx.events(g);
      f.fx.update(g);
      const frames = [];
      for (let i = 0; i < 4; i++) {
        f.fx.advance(0.03);
        frames.push({ snap: snap(f), marker: { hidden: f.marker.hidden, transform: f.marker.style.transform, text: f.marker.textContent }, scene: dumpScene(f.scene) });
      }
      out[`hit_${mode}_${killed ? "kill" : "hurt"}`] = { snap: snap(f), frames };
    }
  for (const rig of ["rat", "dog", "roach", "boss-westminster-witch", "low-hover-drone", "hero", "unknown"]) {
    const f = fresh({ getView: () => ({ root: { scale: { y: 1.67 }, position: { y: 2.2 } } }) }),
      v = victimOf(1, { rig, mobSize: 1.2 }),
      g = game({ enemies: [v] });
    g.events = [hit(v), shot({ targetId: 1 })];
    f.fx.events(g);
    f.fx.update(g);
    f.fx.advance(0.02);
    out[`rigHeights_${rig}`] = { snap: snap(f), scene: dumpScene(f.scene), marker: f.marker.style.transform };
  }

  // 3. Every strike line and shape.
  {
    const variants = [];
    const add = (name, a, ev, g = {}) => variants.push([name, a, ev, g]);
    const base = (extra = {}) => victimOf(2, { combatScale: 1.265, ...extra });
    for (const moveId of ["rat_low", "rat_bite", "dog_low", "dog_bite", "roach_low", "roach_bite", "drone_low"]) {
      add(`${moveId}`, base(), strike(base(), { moveId }));
      add(`${moveId}_reach`, base({ contactGoalReach: 0.77, swing: { calfGoal: { y: 0.44 } } }), strike(base({ contactGoalReach: 0.77, swing: { calfGoal: { y: 0.44 } } }), { moveId }));
      add(`${moveId}_midslash`, base({ swing: { clip: "DogMidSlash" } }), strike(base({ swing: { clip: "DogMidSlash" } }), { moveId }));
    }
    for (const action of ["slash", "stab", "heavy", "special", "pommel"]) {
      for (const mobSize of [1, 1.3]) {
        const a = base({ kind: 1, mobSize });
        add(`${action}_${mobSize}`, a, strike(a, { action }));
      }
    }
    for (const [name, a, ev] of variants) {
      const f = fresh(),
        g = game({ enemies: [a] });
      f.fx.events({ ...g, events: [ev] });
      out[`strike_${name}`] = dumpScene(f.scene);
    }
    // Legacy (non-donor) pilot strike and special.
    {
      const f = fresh(),
        a = base({ kind: 1 }),
        g = game({ pilot: "knife-legacy", enemies: [a] });
      f.fx.events({ ...g, events: [strike(a, { action: "special" })] });
      out.strike_legacySpecial = dumpScene(f.scene);
    }
  }

  // 4. Other events: railgun, warnings, enemy attacks, defence cues, saw contact, holster.
  {
    const f = fresh(),
      boss = victimOf(5, { kind: 3, swing: { hitAt: 2.5 }, bossRanged: true }),
      g = game({ enemies: [boss] });
    g.events = [
      { type: "railgun-shot", actor, origin: { x: 0, y: 1, z: 0 }, end: { x: 3, y: 1.2, z: 4 } },
      { type: "boss-ranged-warning", actor: boss, dir: { x: 0, z: 1 }, range: 8, arc: 30, until: 3 },
      { type: "enemy-attack", actor: boss, dir: { x: 1, z: 0 }, range: 2.5, arc: 90 },
      { type: "enemy-attack", actor: { ...boss, kind: 1 }, dir: { x: 1, z: 0 }, range: 2.5, arc: 90 },
      { type: "parry", actor, position: { x: 1, z: 1 } },
      { type: "block", actor, position: { x: -1, z: 1 } },
      { type: "guard-break", actor, position: { x: 0, z: 2 } },
      { type: "saw-contact", actor, targetId: 5, position: { x: 1, z: 2 } },
    ];
    f.fx.events(g);
    f.fx.update(g);
    out.otherEvents = { scene: dumpScene(f.scene), snap: snap(f) };
    f.fx.advance(0.05);
    out.otherEventsAdvanced = { scene: dumpScene(f.scene), snap: snap(f) };
    g.events = [{ type: "holster", actor }];
    f.fx.events(g);
    out.afterHolster = dumpScene(f.scene);
    const legacy = fresh(),
      lg = game({ pilot: "legacy" });
    lg.events = [{ type: "parry", actor, position: { x: 1, z: 1 } }, { type: "block", actor }, { type: "guard-break", actor }];
    legacy.fx.events(lg);
    out.legacyDefence = dumpScene(legacy.scene);
  }

  // 5. The aim cue, edge clamping, pickup pulse and loot gems.
  {
    const asset = pistolAsset();
    for (const [name, width, height, pos] of [
      ["phone", 393, 852, { x: 0, z: 4 }],
      ["wide", 852, 393, { x: 0, z: 4 }],
      ["edge", 393, 852, { x: 40, z: 60 }],
    ]) {
      const f = fresh({ getView: (e) => ({ root: { scale: { y: 1.67 * (e.mobSize ?? 1) } } }) }, asset),
        g = game({ enemies: [{ id: 1, hp: 40, pos, radius: 0.4, mobSize: 1.15 }], loot: [{ id: 7, kind: 0, pos: { x: 1, z: 1 } }, { id: 8, kind: 1, pos: { x: -2, z: 2 }, height: 0.9 }] });
      g.world = f.world;
      g.player.dodgeUntil = g.player.hurtUntil = 0;
      Object.assign(g.pistol, { magazine: 6, nextFireAt: 0, reloadingUntil: 0, collected: false, pickupPos: { x: 1.5, z: 0.5 }, pickupAreaId: "westminster" });
      const frames = [];
      for (let i = 0; i < 3; i++) {
        g.time = 1 + i * 0.13;
        f.fx.update(g, { visibleIds: [1], viewportHeight: height, viewportWidth: width });
        frames.push(dumpScene(f.scene));
      }
      g.pistol.magazine = 0;
      f.fx.update(g, { visibleIds: [1], viewportHeight: height, viewportWidth: width });
      frames.push(dumpScene(f.scene));
      out[`cue_${name}`] = frames;
    }
  }

  // 6. Boss flame warning line.
  {
    const f = fresh(),
      witch = victimOf(9, { hp: 100, rig: "boss-westminster-witch", bossProfile: { weapon: { kind: "flame", range: 6, coneDegrees: 50, windupTicks: 30 } }, bossWeapon: { phase: "warning", direction: { x: 0, z: 1 }, startTick: 60 } }),
      other = { ...witch, id: 10, rig: "other-boss", pos: { x: 3, z: 3 } },
      g = game({ enemies: [witch, other] });
    f.fx.update(g);
    out.bossWarning = dumpScene(f.scene);
    g.time = 100;
    f.fx.update(g);
    out.bossWarningExpired = dumpScene(f.scene);
  }

  // 7. Finisher bursts: a recipe each of ordinary, opened, split-crown, decapitation, run-through; reduced and off.
  for (const recipeId of ["opened", "split-crown", "decapitation", "run-through", "pistol-decapitation", "ordinary"]) {
    const f = fresh(),
      body = { id: 3, hp: 0, pos: { x: 10, z: 20 }, finisher: { recipeId, damageType: recipeId === "run-through" ? "piercing" : "cutting", impactDirection: { x: 1, z: 0 } } },
      anchor = { x: 10, y: 2, z: -20 },
      g = game({ corpses: [body] });
    f.views.set(3, { root: new THREE.Group(), finisherStarted: true, finisherAge: 0.1, restoredCorpse: false, finisher: { impactAnchors: () => ({ head: { ...anchor }, body: { ...anchor }, trails: [{ ...anchor }, { x: 11, y: 2.5, z: -20 }] }), stats: () => ({ expired: false }) } });
    f.fx.update(g);
    const frames = [{ snap: snap(f), scene: dumpScene(f.scene), events: f.fx.takeSeverEvents() }];
    for (let i = 0; i < 5; i++) {
      f.fx.advance(0.04);
      f.fx.update(g);
      frames.push({ snap: snap(f), scene: dumpScene(f.scene) });
    }
    out[`finisher_${recipeId}`] = frames;
  }

  // 8. The small tone synth: every event's frequency, duration and gain ramp.
  {
    const calls = [],
      node = () => ({ connect() {}, disconnect() {}, start: (t) => calls.push(["start", r(t)]), stop: (t) => calls.push(["stop", r(t)]), frequency: { setValueAtTime: (...a) => calls.push(["freq", ...a.map(r)]), exponentialRampToValueAtTime: (...a) => calls.push(["freqRamp", ...a.map(r)]) }, gain: { setValueAtTime: (...a) => calls.push(["gain", ...a.map(r)]), exponentialRampToValueAtTime: (...a) => calls.push(["gainRamp", ...a.map(r)]) } }),
      previous = globalThis.window;
    globalThis.window = {
      AudioContext: class {
        constructor() {
          this.currentTime = 5;
          this.state = "running";
          this.destination = {};
        }
        resume() {
          return Promise.resolve();
        }
        suspend() {}
        createOscillator() {
          const n = node();
          return new Proxy(n, { set: (t, k, v) => (k === "type" ? calls.push(["type", v]) : (t[k] = v), true) });
        }
        createGain() {
          return node();
        }
      },
    };
    const audio = createAudio();
    out.audioPending = audio.unlock().then(() => {
      audio.play(["attack", "hit", "parry", "block", "dodge", "loot", "death", "wave", "none"].map((type) => ({ type })));
      globalThis.window = previous;
      return calls;
    });
  }
  return out;
}

test("effects.js produces the recorded snapshot (numbers moved to data, nothing visible changed)", async () => {
  const dump = scenarios();
  dump.audio = await dump.audioPending;
  delete dump.audioPending;
  // The golden file holds one SHA-256 per scenario (the full dumps are megabytes). To see what differs, dump the full JSON on main and on
  // the branch with EFFECTS_SNAPSHOT_DUMP=<file> and diff the two files.
  if (process.env.EFFECTS_SNAPSHOT_DUMP) fs.writeFileSync(process.env.EFFECTS_SNAPSHOT_DUMP, JSON.stringify(dump, null, 1));
  const hashes = Object.fromEntries(Object.entries(dump).map(([key, value]) => [key, createHash("sha256").update(JSON.stringify(value)).digest("hex")]));
  if (process.env.EFFECTS_SNAPSHOT_UPDATE === "1") {
    fs.mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(hashes, null, 1) + "\n");
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(Object.keys(hashes), Object.keys(golden), "same scenarios");
  const changed = Object.keys(golden).filter((key) => golden[key] !== hashes[key]);
  assert.deepEqual(changed, [], `scenarios whose output changed: ${changed.join(", ")}`);
});
