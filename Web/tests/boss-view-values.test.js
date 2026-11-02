import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";

// Differential test: the boss view's name-label range and the area-hazard patch (ring and disc geometry, colours, opacities, warning
// pulse, height) are exactly what the inline numbers produced. The expected digest was recorded from the code before the numbers moved
// to visual.json `bossView` (UPDATE_BOSS_VIEW_DIGEST=1 rewrites it; only for an intended presentation change).
const digestPath = new URL("./fixtures/boss-view-values.json", import.meta.url);
const round = (n) => Math.round(n * 1e9) / 1e9;

const fakeElement = () => ({
  children: [],
  hidden: false,
  style: {},
  dataset: {},
  textContent: "",
  className: "",
  append(...c) {
    this.children.push(...c);
  },
  remove() {},
  getBoundingClientRect: () => ({ width: 60, height: 20 }),
});

const describe = (root) => {
  const out = [];
  root.traverse((o) => {
    const m = o.material,
      p = o.geometry?.parameters;
    out.push({
      type: o.type,
      name: o.name,
      visible: o.visible,
      position: o.position.toArray().map(round),
      rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(round),
      scale: o.scale.toArray().map(round),
      geometry: p ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])) : null,
      colour: m?.color?.getHex?.() ?? null,
      opacity: m ? round(m.opacity) : null,
      transparent: m?.transparent ?? null,
      depthWrite: m?.depthWrite ?? null,
      side: m?.side ?? null,
    });
  });
  return out;
};

async function snapshot() {
  const host = fakeElement();
  globalThis.document = { getElementById: (id) => (id === "boss-labels" ? host : null), createElement: fakeElement };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 450;
  const { createBossView } = await import("../src/engine/boss-view.js");
  const camera = new T.PerspectiveCamera(50, 800 / 450, 0.1, 100);
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld(true);
  const model = new T.Group(),
    head = new T.Bone();
  head.name = "Head";
  head.position.set(0, 1, 0);
  model.add(head);
  model.updateMatrixWorld(true);
  const scene = new T.Scene();
  const enemy = (id, x, extra = {}) => ({ id, pos: { x, z: 0 }, hp: 5, bossProfile: {}, bossName: `Boss ${id}`, placementKey: `k${id}`, ...extra });
  const g = {
    time: 5,
    player: { hp: 10, pos: { x: 0, z: 0 } },
    enemies: [enemy("a", 11.9), enemy("b", 12.1), enemy("h", 3, { bossProfile: null, markedHunter: true })],
    areaHazards: [
      { ownerId: "a", areaId: "x", startsAt: 6, expiresAt: 20, position: { x: 4, z: 2 }, radius: 2.5 },
      { ownerId: "b", areaId: "x", startsAt: 1, expiresAt: 20, position: { x: -4, z: 2 }, radius: 3 },
    ],
  };
  const s = {
    game: g,
    loaded: true,
    contextLost: false,
    traveling: false,
    camera,
    scene,
    world: { areaId: "x", toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z) },
    actors: { views: new Map(["a", "b", "h"].map((id) => [id, { model }])) },
  };
  const view = createBossView(s);
  const out = { frames: [] };
  for (const t of [5, 5.4, 5.8, 6.1, 7, 21]) {
    g.time = t;
    view.update();
    out.frames.push({
      time: t,
      labels: host.children.map((el) => ({ text: el.textContent, cls: el.className, hidden: el.hidden, left: el.style.left, top: el.style.top })),
      scene: describe(scene),
    });
  }
  g.player.pos.x = 30;
  view.update();
  out.far = host.children.map((el) => el.hidden);
  view.dispose();
  return JSON.parse(JSON.stringify(out));
}

test("boss view is value-identical to the pre-data code", async () => {
  const got = await snapshot();
  if (process.env.UPDATE_BOSS_VIEW_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});
