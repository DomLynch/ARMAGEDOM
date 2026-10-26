import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";

// Differential test: the boss-equipment view's grenade flight, landing ring, blast flash, status-message timings and the pickup model's
// fit (engine/pickup-model-view.js) are exactly what the inline numbers produced. The expected digest was recorded from the code before
// the numbers moved to visual.json `bossEquipmentView` and `pickupModel` (UPDATE_BOSS_EQUIPMENT_VIEW_DIGEST=1 rewrites it; only for an
// intended presentation change).
const digestPath = new URL("./fixtures/boss-equipment-view-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;

function fakeElement() {
  const el = {
    children: [],
    hidden: false,
    style: {},
    listeners: {},
    append(...c) {
      el.children.push(...c);
    },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

function describe(root) {
  const out = [];
  root.traverse((o) => {
    if (o.name.startsWith("Explosion ")) return; // the shared explosion's own meshes: covered by explosion-effect.test.js
    const m = o.material,
      p = o.geometry?.parameters;
    out.push({
      type: o.type,
      name: o.name,
      position: o.position.toArray().map(round),
      rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(round),
      scale: o.scale.toArray().map(round),
      geometry: p ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])) : null,
      colour: m?.color?.getHex?.() ?? null,
      opacity: m?.opacity ?? null,
    });
  });
  return out;
}

const model = (name, size) => {
  const group = new T.Group();
  group.name = name;
  group.add(new T.Mesh(new T.BoxGeometry(...size), new T.MeshStandardMaterial({ color: 0x808080 })));
  return group;
};

async function snapshot() {
  const panel = fakeElement();
  globalThis.document = { getElementById: (id) => (id === "boss-equipment" ? panel : null), createElement: fakeElement };
  const { createBossEquipmentView } = await import("../src/engine/boss-equipment-view.js");
  const scene = new T.Scene();
  const profile = (itemId, family, extra = {}) => ({
    itemId,
    name: `Item ${itemId}`,
    family,
    weaponKey: "knife",
    source: { placementKey: `place-${itemId}`, areaId: "a" },
    rules: { pickupRadius: 1.3 },
    ...extra,
  });
  const grenadeScene = new T.Group();
  grenadeScene.add(model("Grenade", [0.2, 0.3, 0.6]));
  const assets = {
    grenade: { gltf: { scene: grenadeScene } },
    shotgun: { gltf: { scene: model("Shotgun", [3, 0.2, 0.4]) }, description: { pose: { root: null } } },
  };
  // The owned grenade's card text is built from its payload (weapons.json), so the fixture carries the real grenade payload.
  const { GRENADE_PROFILE } = await import("../src/engine/weapon-catalog.js");
  const data = {
    grenade: profile("g1", "grenades", { payload: GRENADE_PROFILE.payload }),
    shotgun: profile("s1", "shotguns"),
    rifle: profile("r1", "rifles"),
  };
  const g = {
    time: 10,
    finished: false,
    runSaveInvalid: false,
    message: "",
    messageUntil: 0,
    events: [],
    player: { hp: 10, swing: null, ready: 0, hurtUntil: 0, dodgeUntil: 0, pos: { x: 0, z: 0 } },
    pistol: { magazine: 6, reserve: 0 },
    flameFuel: { fuelUnits: 0 },
    activeGrenades: [],
    bossEquipment: {
      grenade: { status: "owned", magazine: 1, reserve: 0 },
      shotgun: { status: "pending", dropPosition: { x: 0.5, z: 0.5 } },
      rifle: { status: "pending", selected: true, dropPosition: { x: 40, z: 40 } },
    },
    world: {
      areaId: "a",
      bossEquipmentData: data,
      bossData: { placements: [], profiles: {} },
      toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z),
      lineClear: () => true,
    },
  };
  const s = {
    loaded: true,
    contextLost: false,
    traveling: false,
    paused: false,
    scene,
    game: g,
    world: g.world,
    input: { clear() {} },
    updateExpedition() {},
    actors: {
      equipmentReady: (f) => f !== "rifle",
      ensureEquipment: () => Promise.reject(new Error("no asset")),
      equipmentAsset: (f) => assets[f],
    },
  };
  const commands = [];
  const view = createBossEquipmentView(s, (game, command) => {
    commands.push(command);
    return { ok: true, events: [] };
  });
  const out = { frames: [] };
  const intent = (id, detonateAt) => ({ id, areaId: "a", detonateAt, position: { x: 3, z: -2 } });
  const frame = (label) => out.frames.push({ label, time: g.time, scene: describe(scene) });

  view.update();
  frame("drops");
  await new Promise((r) => setTimeout(r, 0));
  out.loadFailure = { message: g.message, untilOffset: round(g.messageUntil - g.time) };
  g.message = "";
  g.messageUntil = 0;
  const pickup = view.interaction().find((row) => row.id === "s1");
  pickup.run();
  out.claim = { commands, message: g.message, untilOffset: round(g.messageUntil - g.time) };

  g.activeGrenades = [{ intent: intent("n1", 11), mode: "standard", origin: { x: 1, z: 1 } }];
  for (const t of [10, 10.2, 10.5, 10.9, 11.2]) {
    g.time = t;
    view.update();
    frame(`flight ${t}`);
  }
  g.activeGrenades = [{ intent: intent("n2", 12), mode: "sticky", surfacePosition: { x: 2, y: 0.5, z: -1 }, origin: { x: 1, z: 1 } }];
  g.time = 11.5;
  view.update();
  frame("sticky");
  g.activeGrenades = [];
  g.events.push({ type: "grenade-blast", id: "n2" });
  for (const t of [11.6, 11.7, 11.8, 11.95, 12.1]) {
    g.time = t;
    view.update();
    frame(`blast ${t}`);
  }
  g.activeGrenades = [{ intent: intent("n3", 13), mode: "standard", origin: { x: 1, z: 1 } }];
  g.time = 12.5;
  view.update();
  g.activeGrenades = [];
  g.events.length = 0;
  g.time = 12.6;
  view.update();
  frame("removed without blast");
  view.dispose();
  return JSON.parse(JSON.stringify(out));
}

test("boss-equipment view is value-identical to the pre-data code", async () => {
  const got = await snapshot();
  if (process.env.UPDATE_BOSS_EQUIPMENT_VIEW_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});
