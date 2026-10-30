import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createAirdropView } from "../src/engine/airdrop-view.js";
import { createRunHudView } from "../src/engine/run-hud-view.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { webText } from "../src/engine/web-text.js";

// The hold-out's flare and the run HUD, on the shipped rows.
const AIR = GAME_DATA.airdrop,
  AREA = "east";

function airdropScene() {
  const scene = new T.Scene(),
    view = createAirdropView(scene, (point, height) => new T.Vector3(point.x, height, point.z)),
    [shadow, crate, flare, glow] = view.root.children;
  return { view, shadow, crate, flare, glow };
}
const game = (extra = {}) => ({ time: 100, world: { areaId: AREA }, player: { pos: { x: 0, z: 0 } }, airdrop: null, run: null, ...extra });

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

const EXTRACTION = GAME_DATA.apocalypseRun.extraction;

test("hold circle: drawn at the hold, as wide as the hold, bright inside and dim outside, gone with the hold", () => {
  const { view } = airdropScene(),
    ring = view.root.children[4],
    hold = { areaId: AREA, at: { x: 30, z: -12 } },
    look = EXTRACTION.view.ring;
  view.update(game());
  assert.ok(!ring.visible, "no circle without a hold");
  view.update(game({ player: { pos: { x: 30, z: -12 } }, run: { hold } }));
  assert.ok(ring.visible);
  assert.deepEqual([ring.position.x, ring.position.z], [30, -12]);
  assert.equal(ring.geometry.parameters.outerRadius, EXTRACTION.holdRadius, "the circle is the hold's radius");
  assert.equal(ring.material.opacity, look.opacity, "full strength with the player inside");
  view.update(game({ player: { pos: { x: 30 + EXTRACTION.holdRadius + 1, z: -12 } }, run: { hold } }));
  assert.equal(ring.material.opacity, look.opacity * look.outsideShare, "dimmer outside the circle");
  view.update(game({ player: { pos: { x: 0, z: 0 } }, run: { hold: { ...hold, areaId: "south" } } }));
  assert.ok(!ring.visible, "a hold in another area draws nothing here");
  view.dispose();
});

// A page of nodes that keep attributes, styles and the data set the progress ring writes.
function ringPage() {
  const nodes = {};
  const node = (id) => ({
    id,
    hidden: false,
    textContent: "",
    style: {},
    dataset: {},
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getElementsByTagName: () => [node(`${id}-svg`)],
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.document = { getElementById: (id) => (nodes[id] ??= node(id)), createElement: () => ({ append() {} }) };
  return nodes;
}

test("progress ring: shows with the zone, fills with the hold, says to stay in the circle, hides with the run", () => {
  const nodes = ringPage(),
    look = EXTRACTION.view.hud,
    run = { stage: 2, startAt: 0, outcome: null, dismissed: false, picks: { hazard: { label: "x" } }, hold: null, extracted: null },
    s = { game: { time: 10, run, world: { areaId: AREA }, player: { hp: 10 } }, contextLost: false, traveling: false },
    hud = createRunHudView(s);
  try {
    hud.update();
    assert.ok(nodes["extraction-ring"].hidden, "no ring before a hold");
    run.hold = { areaId: AREA, progress: 0.5 };
    hud.update();
    const ring = nodes["extraction-ring"];
    assert.equal(ring.hidden, false);
    assert.equal(nodes["extraction-ring-percent"].textContent, "50%");
    assert.equal(ring.style.top, `${look.topPercent}%`, "position comes from the row");
    assert.equal(nodes["extraction-ring-fill"].attrs.stroke, `#${look.fillColour}`);
    const circumference = Number(nodes["extraction-ring-fill"].dataset.circumference);
    assert.ok(Math.abs(Number(nodes["extraction-ring-fill"].attrs["stroke-dashoffset"]) - circumference / 2) < 1e-9, "half the circle is filled");
    assert.equal(nodes["extraction-ring-text"].textContent, webText("extraction.ringLabel"));
    run.outcome = "escaped";
    hud.update();
    assert.ok(ring.hidden, "the ring goes with the run's end");
  } finally {
    hud.dispose();
    delete globalThis.document;
  }
});
