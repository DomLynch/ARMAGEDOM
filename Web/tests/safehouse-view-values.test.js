import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { safehouseCueOpacity, createSafehouseView } from "../src/engine/safehouse-view.js";

// Differential test: the safehouse view's cue pulse, painted patch, contour lines (registered and fallback silhouettes), line style
// and locker amount text are exactly what the inline numbers produced. The expected digest was recorded from the code before the
// numbers moved to visual.json `safehouseView` (UPDATE_SAFEHOUSE_VIEW_DIGEST=1 rewrites it; only for an intended presentation change).
const digestPath = new URL("./fixtures/safehouse-view-values.json", import.meta.url);
const area = JSON.parse(fs.readFileSync(new URL("../public/world/area-content.json", import.meta.url))).safehouse;
const round = (n) => Math.round(n * 1e9) / 1e9;
const roundAll = (a) => Array.from(a, round);

function cueGrid() {
  const rows = [];
  const modes = [{}, { near: true }, { selected: true }, { near: true, selected: true }, { reduced: true }, { period: 2, phase: 0.25 }];
  for (const time of [0, 0.4375, 0.875, 1.3, 1.75, 2.625, 3.5, 4.1, 17.77])
    for (const mode of modes) rows.push([time, JSON.stringify(mode), round(safehouseCueOpacity(time, mode))]);
  rows.push(["default", round(safehouseCueOpacity(1.1))]);
  return rows;
}

function buildView(content) {
  const label = () => ({ style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} });
  const previous = globalThis.document;
  globalThis.document = { createElement: label, body: { append() {} }, getElementById: () => null };
  const geometry = new T.BufferGeometry().setAttribute(
      "position",
      new T.Float32BufferAttribute([-5, -2.5, 0, 5, -2.5, 0, 5, 2.5, 0, -5, 2.5, 0], 3),
    ),
    group = new T.Group(),
    world = {
      THREE: { ...T, TextureLoader: class { load(url, done) { done(new T.Texture()); } } },
      backdrop: { geometry },
      layout: { exposure: 0.8 },
      baseUrl: "http://test/",
      areaId: "westminster",
      group,
      safehouseData: content,
      geometry: { ground: (p) => ({ x: p.x, z: p.y }) },
      lineClear: () => true,
    },
    game = { world, time: 0, player: { hp: 100, pos: { x: 100, z: 100 }, radius: 0.4 } },
    view = createSafehouseView(
      { world, game, camera: new T.PerspectiveCamera(), canvas: { getBoundingClientRect: () => ({ width: 393, height: 852 }) }, loaded: true },
      () => {},
    );
  const realNow = performance.now;
  performance.now = () => 123456.789; // the contour pulse reads the wall clock
  view.update();
  performance.now = realNow;
  const out = group.children.map((n) => {
    const m = n.material,
      p = n.geometry.attributes;
    return {
      type: n.type,
      name: n.name,
      renderOrder: n.renderOrder,
      frustumCulled: n.frustumCulled,
      material: {
        type: m.type,
        opacity: m.opacity,
        transparent: m.transparent,
        depthTest: m.depthTest,
        depthWrite: m.depthWrite,
        toneMapped: m.toneMapped,
        side: m.side,
        colour: m.color.getHex(),
        rgb: roundAll(m.color.toArray()),
        linewidth: m.linewidth ?? null,
        worldUnits: m.worldUnits ?? null,
      },
      positions: p.position ? roundAll(p.position.array) : null,
      uv: p.uv ? roundAll(p.uv.array) : null,
      index: n.geometry.index ? Array.from(n.geometry.index.array) : null,
      itemSizes: p.position ? p.position.itemSize : null,
      lineStart: p.instanceStart ? roundAll(p.instanceStart.data.array) : null,
    };
  });
  view.dispose();
  geometry.dispose();
  if (previous === undefined) delete globalThis.document;
  else globalThis.document = previous;
  return out;
}

function panelText() {
  class El {
    constructor() {
      this.children = [];
      this.style = {};
      this.textContent = "";
    }
    setAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    remove() {}
    append(...n) {
      this.children.push(...n);
    }
    replaceChildren(...n) {
      this.children = [...n];
    }
  }
  const previous = globalThis.document,
    panel = new El(),
    status = new El();
  globalThis.document = { createElement: () => new El(), body: { append() {} }, getElementById: (id) => (id === "locker-items" ? panel : status) };
  const g = {
    world: { areaId: "elsewhere" },
    player: { hp: 10, pos: { x: 0, z: 0 } },
    pistol: { collected: true, reserve: 3.14159 },
    rifle: { reserve: 2.71828 },
    flameFuel: { collected: true, fuelUnits: 7.456 },
    locker: { ammo: { "pistol-reserve": 1.23456, "flame-fuel": 9.8765 } },
  };
  const view = createSafehouseView(
    {
      game: g,
      world: {
        areaId: "westminster",
        safehouseData: area,
        baseUrl: "http://test/",
        THREE: { TextureLoader: class { load(_url, _done, _progress, fail) { fail(); } } },
      },
      loaded: true,
      canvas: { getBoundingClientRect: () => ({ width: 1, height: 1 }) },
    },
    () => ({ ok: true }),
  );
  view.update();
  const texts = panel.children.map((row) => row.children.map((c) => c.textContent ?? "").join("|"));
  const inputs = panel.children.map((row) => row.children.filter((c) => c.type === "number").map((c) => [c.min, c.step, c.value, c.max]));
  view.dispose();
  globalThis.document = previous;
  return { texts, inputs };
}

function snapshot() {
  const withOutlines = structuredClone(area),
    fallback = structuredClone(area);
  for (const prop of fallback.props) delete prop.outlines;
  return { cue: cueGrid(), registered: buildView(withOutlines), fallback: buildView(fallback), panel: panelText() };
}

test("safehouse view numbers match the digest recorded from the pre-data code", () => {
  const now = JSON.parse(JSON.stringify(snapshot()));
  if (process.env.UPDATE_SAFEHOUSE_VIEW_DIGEST) fs.writeFileSync(digestPath, JSON.stringify(now, null, 1) + "\n");
  const expected = JSON.parse(fs.readFileSync(digestPath, "utf8"));
  assert.equal(expected.registered.length, 4);
  assert.equal(expected.fallback.length, 4);
  assert.deepEqual(now, expected);
});
