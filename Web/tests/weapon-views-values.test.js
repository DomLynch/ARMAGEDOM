import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { createRocketView } from "../src/engine/rocket-view.js";
import { createFlamePickupView, createFlameView } from "../src/engine/flame-view.js";
import { initializeFlame } from "../src/engine/flame-runtime.js";
import { FLAME_PILOT_PROFILE } from "../src/engine/flame-fuel-state.js";

// Differential test: the rocket blast flash, the flame pickup display and the flame message timers are exactly what the inline numbers
// produced. The expected values were recorded from the code before the numbers moved to visual.json `weaponViews`
// (UPDATE_WEAPON_VIEWS_DIGEST=1 rewrites the fixture; only for an intended presentation change).
const digestPath = new URL("./fixtures/weapon-views-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;
const roundAll = (v) => (typeof v === "number" ? round(v) : Array.isArray(v) ? v.map(roundAll) : v);

function describe(object) {
  const material = object.material,
    parameters = object.geometry?.parameters;
  return {
    type: object.type,
    colour: material?.color?.getHex?.() ?? null,
    position: object.position.toArray().map(round),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round),
    scale: object.scale.toArray().map(round),
    geometry: parameters ? Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, roundAll(v)])) : null,
    opacity: material ? round(material.opacity) : null,
    transparent: material?.transparent ?? null,
    depthWrite: material?.depthWrite ?? null,
    depthTest: material?.depthTest ?? null,
    side: material?.side ?? null,
  };
}

function rocketSnapshot() {
  const scene = new T.Scene(),
    out = [];
  const s = { scene, actors: {}, world: { toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z) } };
  const view = createRocketView(s);
  const game = (time, extra) => ({
    time,
    finished: false,
    player: { hp: 10 },
    world: { areaId: "a", toRender: s.world.toRender },
    activeRockets: [],
    bossRockets: [],
    ...extra,
  });
  const blastRow = (id, time, radius) => ({ id, areaId: "a", time, radius, position: { x: 4, z: 2 } });
  const frame = (label, g) => {
    view.update(g);
    out.push({
      label,
      children: scene.children.map((root) => ({
        position: root.position.toArray().map(round),
        scale: root.scale.toArray().map(round),
        parts: root.children.map(describe),
      })),
    });
  };
  const player = blastRow("p1", 1, 2);
  const first = game(1, { bossEquipmentAction: { rocketLauncher: { lastBlast: player } } });
  frame("start", first);
  for (const t of [1.05, 1.2, 1.3, 1.34]) frame(`t${t}`, { ...first, time: t });
  frame("end", { ...first, time: 1.35 });
  const dflt = blastRow("p2", 5, undefined);
  frame("default-radius", game(5, { bossEquipmentAction: { rocketLauncher: { lastBlast: dflt } } }));
  frame("default-radius-mid", game(5.1, { bossEquipmentAction: { rocketLauncher: { lastBlast: dflt } } }));
  frame("stale", game(9, { bossEquipmentAction: { rocketLauncher: { lastBlast: blastRow("p3", 8.64, 2) } } }));
  frame("edge", game(10.35, { bossEquipmentAction: { rocketLauncher: { lastBlast: blastRow("p4", 10, 2) } } }));
  const boss = blastRow("boss-rocket:1", 20, 4);
  frame("boss", game(20.1, { bossRocketBlast: boss }));
  frame("boss-gone", game(20.2, {}));
  view.dispose();
  return out;
}

function flamePickupSnapshot() {
  const ring = createFlamePickupView(null),
    source = new T.Group();
  source.add(new T.Mesh(new T.BoxGeometry(2, 1, 3), new T.MeshStandardMaterial()));
  const small = new T.Group();
  small.add(new T.Mesh(new T.BoxGeometry(0.2, 0.3, 0.4), new T.MeshStandardMaterial()));
  const out = { ring: ring.root.children.map(describe) };
  for (const [name, scene] of [
    ["large", source],
    ["small", small],
  ]) {
    const view = createFlamePickupView({ scene }),
      display = view.root.children[0];
    out[name] = { scale: display.scale.toArray().map(round), position: display.position.toArray().map(round) };
    view.dispose();
  }
  ring.dispose();
  return out;
}

async function flameMessages() {
  class Element extends EventTarget {
    constructor() {
      super();
      this.attributes = new Map();
      this.hidden = false;
      this.style = {};
      this.textContent = "";
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    removeAttribute(k) {
      this.attributes.delete(k);
    }
  }
  const previous = globalThis.document,
    nodes = new Map(),
    el = (id) => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
  globalThis.document = { getElementById: el };
  const results = {};
  try {
    const make = (fuelUnits, actors) => {
      const g = {
        time: 100,
        events: [],
        player: { hp: 100, weapon: "pistol", pos: { x: 0, z: 0 }, ready: 0, hurtUntil: 0, dodgeUntil: 0 },
        world: {
          areaId: "westminster",
          lineClear: () => true,
          toRender: (p) => new T.Vector3(p.x, 0, -p.z),
          flameData: { ...FLAME_PILOT_PROFILE, areaId: "westminster", position: { x: 0, z: 0 } },
        },
      };
      initializeFlame(g);
      g.flameFuel = { version: 1, collected: true, fuelUnits };
      const s = { game: g, loaded: true, actors, scene: { add() {} }, input: { clear() {} }, hud: { update() {} } };
      return { g, s };
    };
    const run = async (name, fuelUnits, actors, persistence, act) => {
      const { g, s } = make(fuelUnits, actors),
        view = createFlameView(s, persistence);
      view.update();
      await act(view, g);
      results[name] = { message: g.message ?? null, until: g.messageUntil ?? null };
      view.dispose();
    };
    const ready = { flameReady: () => true, flameAsset: () => null };
    await run("empty", 0, ready, {}, (v) => v.equip());
    await run(
      "failed",
      500,
      { flameReady: () => false, flameAsset: () => null, ensureFlame: () => Promise.reject(new Error("x")) },
      {},
      (v) => v.equip(),
    );
    await run("ready", 500, ready, { persistRun: () => true }, (v) => v.equip());
    await run(
      "claim",
      500,
      ready,
      { persistRun: () => true, dispatchFlame: () => ({ ok: true, events: [] }) },
      async (v, g) => {
        g.flameFuel.collected = false;
        g.world.flameData.groundPickupEnabled = true;
        g.world.flameData.pickupRadius = 5;
        v.update();
        v.interact();
        await new Promise((r) => setTimeout(r, 0));
      },
    );
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  return results;
}

test("rocket blast, flame pickup and flame message timers are value-identical to the pre-data code", async () => {
  const got = JSON.parse(
    JSON.stringify({
      rocket: rocketSnapshot(),
      flamePickup: flamePickupSnapshot(),
      flameMessages: await flameMessages(),
    }),
  );
  if (process.env.UPDATE_WEAPON_VIEWS_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});
