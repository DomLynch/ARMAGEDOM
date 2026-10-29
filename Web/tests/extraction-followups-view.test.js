import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createAirdropView } from "../src/engine/airdrop-view.js";
import { createRunHudView } from "../src/engine/run-hud-view.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The hold-out's flare and the run HUD, on the shipped rows.
const AIR = GAME_DATA.airdrop,
  AREA = "east";

function airdropScene() {
  const scene = new T.Scene(),
    view = createAirdropView(scene, (point, height) => new T.Vector3(point.x, height, point.z)),
    [shadow, crate, flare, glow] = view.root.children;
  return { view, shadow, crate, flare, glow };
}
const game = (extra = {}) => ({ time: 100, world: { areaId: AREA }, airdrop: null, run: null, ...extra });

test("hold flare: a landed crate in the hold's area stays visible and in place while the flare stands at the hold", () => {
  const { view, crate, flare, glow } = airdropScene(),
    landed = { areaId: AREA, phase: "landed", crate: { x: 5, z: 7 }, startAt: 0, landAt: 10 },
    hold = { areaId: AREA, at: { x: 30, z: -12 } };
  view.update(game({ airdrop: landed }));
  assert.ok(crate.visible && flare.visible, "the crate and its own flare show without a hold");
  assert.deepEqual([flare.position.x, flare.position.z], [5, 7]);
  view.update(game({ airdrop: landed, run: { hold } }));
  assert.ok(view.root.visible && crate.visible, "the crate is still drawn during the hold");
  assert.deepEqual([crate.position.x, crate.position.z], [5, 7], "the crate stays where it landed");
  assert.ok(flare.visible && glow.visible);
  assert.deepEqual([flare.position.x, flare.position.z], [30, -12], "the flare stands at the hold");
  assert.deepEqual([glow.position.x, glow.position.z], [30, -12], "so does the glow");
  view.update(game({ airdrop: landed, run: { hold: { ...hold, areaId: "south" } } }));
  assert.deepEqual([flare.position.x, flare.position.z], [5, 7], "a hold in another area is ignored");
  view.dispose();
});

test("hold flare: a plane in the air still flies during the hold, and a hold alone shows only the flare", () => {
  const { view, shadow, crate, flare } = airdropScene(),
    hold = { areaId: AREA, at: { x: 3, z: 4 } },
    plane = { areaId: AREA, phase: "flying", startAt: 100 - AIR.plane.seconds / 2, from: { x: 0, z: 0 }, to: { x: 20, z: 0 } };
  view.update(game({ airdrop: plane, run: { hold } }));
  assert.ok(shadow.visible, "the plane shadow shows");
  assert.ok(Math.abs(shadow.position.x - 10) < 1e-9, "halfway across");
  assert.ok(!crate.visible && flare.visible, "no crate yet; the hold flare stands");
  view.update(game({ run: { hold } }));
  assert.ok(view.root.visible && flare.visible && !crate.visible && !shadow.visible);
  view.update(game());
  assert.ok(!view.root.visible, "nothing shows with no airdrop and no hold");
  view.dispose();
});

// A page of plain nodes that counts every lookup.
function page() {
  const nodes = {},
    lookups = { count: 0 };
  globalThis.document = {
    getElementById: (id) => {
      lookups.count++;
      return (nodes[id] ??= { id, hidden: false, textContent: "", addEventListener() {}, removeEventListener() {} });
    },
    createElement: () => ({ append() {} }),
  };
  return { nodes, lookups };
}

test("run HUD: with no run it hides the parts once, then only checks the start button, and looks each node up once", () => {
  const { nodes, lookups } = page(),
    s = { game: { run: null, world: { areaId: "elsewhere" }, player: { hp: 10 } }, contextLost: false, traveling: false },
    hud = createRunHudView(s);
  try {
    hud.update();
    assert.ok(nodes["run-hud"].hidden && nodes["run-banner"].hidden && nodes["run-results"].hidden && nodes["run-panel"].hidden);
    const after = lookups.count;
    for (let i = 0; i < 100; i++) hud.update();
    assert.equal(lookups.count, after, "no further getElementById calls once the nodes are cached");
    assert.equal(nodes["run-hud"].textContent, "", "the timer is never painted without a run");
  } finally {
    hud.dispose();
    delete globalThis.document;
  }
});
