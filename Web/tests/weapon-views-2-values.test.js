import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { createRifleView } from "../src/engine/rifle-view.js";
import { createUniqueRewardView, createMeleePickupView } from "../src/unique-reward-view.js";
import { UNIQUE_REWARDS, CLEAVER_ITEM_ID } from "../src/engine/unique-reward-runtime.js";

// Differential test: the Rifle drop display and message timers, and the unique-reward (Pitborn Cleaver) pickup display, message
// timers and pickup reach are exactly what the inline numbers produced. The expected values were recorded from the code before the
// numbers moved to visual.json `weaponViews` (UPDATE_WEAPON_VIEWS_DIGEST=1 rewrites the fixture; only for an intended presentation
// change). The marked head-total hold (2.5 s) is pinned at its 3.49 / 3.5 boundary by marked-head-total.test.js.
const digestPath = new URL("./fixtures/weapon-views-2-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;
const flush = () => new Promise(setImmediate);

class Element extends EventTarget {
  constructor() {
    super();
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.children = [];
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  append(child) {
    this.children.push(child);
  }
  remove() {}
}

async function withDocument(body) {
  const previous = {
      document: globalThis.document,
      innerWidth: globalThis.innerWidth,
      innerHeight: globalThis.innerHeight,
    },
    nodes = new Map(),
    el = (id) => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
  globalThis.document = { getElementById: el, createElement: () => new Element() };
  globalThis.innerWidth = 393;
  globalThis.innerHeight = 852;
  try {
    return await body(el);
  } finally {
    for (const [k, v] of Object.entries(previous))
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
  }
}

const meshGroup = (name, box) => {
  const group = new T.Group();
  group.name = name;
  group.add(new T.Mesh(new T.BoxGeometry(...box), new T.MeshStandardMaterial()));
  return group;
};
const placed = (object) => ({
  scale: object.scale.toArray().map(round),
  position: object.position.toArray().map(round),
});

async function rifleSnapshot() {
  return withDocument(async (el) => {
    const out = {};
    for (const [name, box] of [
      ["large", [2, 0.4, 3]],
      ["small", [0.2, 0.1, 0.3]],
    ]) {
      const gltf = { scene: new T.Group() };
      gltf.scene.add(meshGroup("Rifle", box));
      const world = {
          areaId: "east-bridge",
          rifleData: {
            name: "Bridge Rifle",
            itemId: "rifle",
            source: { areaId: "east-bridge" },
            rules: { damage: 45, capacity: 8, pickupRadius: 1.3 },
          },
          toRender: (p) => new T.Vector3(p.x, 0, p.z),
          lineClear: () => true,
        },
        g = {
          world,
          events: [],
          rifle: { status: "pending", dropPosition: { x: 0, z: 0 }, magazine: 8, reserve: 0 },
          player: { hp: 150, pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0 },
          time: 10,
        },
        scene = new T.Scene(),
        s = {
          scene,
          world,
          game: g,
          loaded: true,
          input: { clear() {} },
          actors: { rifleReady: () => true, rifleAsset: () => ({ gltf, description: { pose: { root: "Rifle" } } }) },
        },
        view = createRifleView(s, () => ({ ok: true, events: [] }));
      view.update();
      const drop = scene.children[0];
      out[name] = { display: { ...placed(drop.children[0]), rotation: drop.children[0].rotation.z } };
      if (name === "large") {
        el("rifle-pickup").dispatchEvent(new Event("click"));
        out.claim = { message: g.message, until: g.messageUntil };
      }
      view.dispose();
    }
    const g = {
        world: {
          areaId: "east-bridge",
          rifleData: {
            name: "Bridge Rifle",
            itemId: "rifle",
            source: { areaId: "east-bridge" },
            rules: { damage: 45, capacity: 8 },
          },
        },
        events: [],
        rifle: { status: "pending", dropPosition: { x: 0, z: 0 }, magazine: 8, reserve: 0 },
        player: { hp: 150, pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0 },
        time: 20,
      },
      s = {
        scene: new T.Scene(),
        world: { toRender: (p) => new T.Vector3(p.x, 0, p.z) },
        game: g,
        loaded: true,
        actors: { rifleReady: () => false, ensureRifle: () => Promise.reject(new Error("x")), rifleAsset: () => null },
      },
      view = createRifleView(s, () => ({ ok: true, events: [] }));
    view.update();
    await flush();
    out.loadFailed = { message: g.message, until: g.messageUntil };
    view.dispose();
    return out;
  });
}

async function uniqueSnapshot() {
  return withDocument(async (el) => {
    const out = {},
      data = UNIQUE_REWARDS[CLEAVER_ITEM_ID];
    for (const [name, box] of [
      ["large", [2, 0.5, 3]],
      ["small", [0.05, 0.2, 0.05]],
    ]) {
      const weapon = meshGroup("WeaponDrawn", box);
      weapon.userData.contact = { from: 0.14, to: 0.86 };
      const scene = new T.Group();
      scene.add(weapon);
      const pickup = createMeleePickupView({ equipment: { scene } }, data);
      out[name] = placed(pickup.root.children[0]);
      pickup.dispose();
    }
    const weapon = meshGroup("WeaponDrawn", [0.2, 0.9, 0.05]);
    weapon.userData.contact = { from: 0.14, to: 0.86 };
    const equipment = new T.Group();
    equipment.add(weapon);
    let source = { equipment: { scene: equipment } },
      reject = false;
    const g = {
        time: 1,
        finished: false,
        events: [],
        player: { hp: 100, weapon: "knife", pos: { x: 0, z: 0 }, hurtUntil: 0, dodgeUntil: 0 },
        uniqueReward: {
          version: 1,
          status: "pending",
          dropPosition: { x: 0, z: 0 },
          rewardReceipt: null,
          selectedMeleeVariant: "knife",
        },
        world: {
          areaId: "east",
          uniqueRewardData: data,
          lineClear: () => true,
          toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z),
        },
      },
      s = {
        game: g,
        scene: new T.Scene(),
        loaded: true,
        paused: false,
        actors: {
          meleeVariantSource: () => source,
          async ensureMeleeVariant() {
            if (reject) throw Error("asset failure");
          },
        },
        input: { clear() {} },
      },
      view = createUniqueRewardView(s, () => ({ ok: true, events: [] }));
    view.update();
    out.reach = [];
    for (const x of [1.2, 1.29999, 1.3, 1.3 + 5e-9, 1.3 + 1e-8, 1.3 + 2e-8, 1.31]) {
      g.player.pos.x = x;
      out.reach.push([x, view.interaction() !== null]);
    }
    g.player.pos.x = 0;
    view.interact();
    out.claim = { message: g.message, until: g.messageUntil };
    g.time = 50;
    g.uniqueReward.status = "pending";
    source = null;
    reject = true;
    view.update();
    await flush();
    view.update();
    el("melee-choices")
      .children.find((b) => b.id === `melee-variant-${CLEAVER_ITEM_ID}`)
      .dispatchEvent(new Event("click"));
    await flush();
    out.loadFailed = { message: g.message, until: g.messageUntil };
    view.dispose();
    return out;
  });
}

test("rifle and unique-reward pickup displays, message timers and reach are value-identical to the pre-data code", async () => {
  const got = JSON.parse(JSON.stringify({ rifle: await rifleSnapshot(), unique: await uniqueSnapshot() }));
  if (process.env.UPDATE_WEAPON_VIEWS_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});
