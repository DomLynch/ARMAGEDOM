import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { createDropMarker, createMarkerOnlyDrop, dropPulse, markDrop } from "../src/engine/drop-marker.js";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";

const style = GAME_DATA.visual.dropMarker;
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url))));

test("the pulse runs between minOpacity and 1 over pulseSeconds", () => {
  assert.equal(dropPulse(0), 1);
  assert.ok(Math.abs(dropPulse(style.pulseSeconds / 2) - style.minOpacity) < 1e-9);
  for (let t = 0; t < 3; t += 0.1) assert.ok(dropPulse(t) >= style.minOpacity - 1e-9 && dropPulse(t) <= 1 + 1e-9);
});

test("the marker is a gold ground ring sized from data; rendering it pulses the ring and the drop root, and dispose is idempotent", () => {
  const marker = createDropMarker("Ember Projector"),
    root = new THREE.Group();
  root.add(marker.group);
  const { parameters } = marker.ring.geometry;
  assert.equal(parameters.innerRadius, style.ringInner);
  assert.equal(parameters.outerRadius, style.ringOuter);
  assert.equal(marker.ring.material.color.getHexString(), style.ringColour);
  assert.ok(Math.abs(marker.ring.rotation.x + Math.PI / 2) < 1e-9, "flat on the ground");
  marker.ring.onBeforeRender();
  assert.ok(marker.ring.material.opacity >= style.minOpacity - 1e-9 && marker.ring.material.opacity <= 1);
  const scale = root.scale.x;
  assert.ok(Math.abs(scale - 1) <= style.itemPulse / 2 + 1e-9, "the item pulses by at most itemPulse");
  assert.ok(Math.abs(marker.group.scale.x * scale - 1) < 1e-9, "the marker takes the item's scale back off");
  assert.ok(marker.ring.scale.x >= 1 && marker.ring.scale.x <= 1 + style.ringPulse + 1e-9, "the ring swells by at most ringPulse");
  assert.ok(style.ringOuter >= 1.5 && style.ringOuter - style.ringInner >= 0.4, "a wide, thick band, like the hub storage marker");
  marker.dispose();
  marker.dispose();
  assert.equal(marker.group.parent, null);
});

test("markDrop adds the marker to the view root and takes it down with the view; a marker-only drop needs no model", () => {
  let disposed = 0;
  const view = markDrop({ root: new THREE.Group(), dispose: () => disposed++ }, "Bridge Rifle");
  assert.ok(view.root.children.includes(view.marker.group));
  view.dispose();
  assert.equal(disposed, 1);
  assert.equal(view.marker.group.parent, null);
  const bare = createMarkerOnlyDrop("Pitborn Cleaver");
  assert.equal(bare.root.children.length, 1, "just the marker");
  bare.dispose();
  assert.equal(bare.marker.group.parent, null);
});

test("the loader rejects an unknown, missing or out-of-range dropMarker field", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateVisual(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.dropMarker.extra = 1; }));
  assert.throws(broken((d) => { delete d.dropMarker.ringInner; }));
  assert.throws(broken((d) => { d.dropMarker.ringColour = "gold"; }));
  assert.throws(broken((d) => { d.dropMarker.ringOuter = d.dropMarker.ringInner; }));
  assert.throws(broken((d) => { d.dropMarker.minOpacity = 2; }));
  assert.throws(broken((d) => { d.dropMarker.itemPulse = 0.9; }));
  assert.throws(broken((d) => { d.dropMarker.glowOuter = d.dropMarker.ringOuter; }));
  assert.throws(broken((d) => { d.dropMarker.ringPulse = 2; }));
  assert.throws(broken((d) => { d.dropMarker.labelBacking = "black"; }));
});

test("every ground weapon or reward drop view carries the marker", () => {
  const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(src("../src/engine/boss-equipment-view.js"), /markDrop\(\s*createPickupModel/);
  assert.match(src("../src/engine/boss-equipment-view.js"), /createMarkerOnlyDrop\(profile\.name\)/);
  assert.match(src("../src/engine/rifle-view.js"), /createDropMarker\(/);
  assert.match(src("../src/engine/rifle-view.js"), /createMarkerOnlyDrop\(/);
  assert.match(src("../src/unique-reward-view.js"), /markers\.markDrop\(createMeleePickupView/);
  assert.match(src("../src/engine/run-views.js"), /\{ markDrop, createMarkerOnlyDrop \}/);
  assert.match(src("../src/engine/flame-view.js"), /markDrop\(createFlamePickupView/);
  assert.match(src("../src/effects.js"), /createDropMarker\("Starting pistol"\)/);
});
