import test from "node:test";
import assert from "node:assert/strict";
import { createDropMarker, markerGeometry } from "../src/engine/drop-marker.js";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { validateDropMarkerLayout } from "../src/engine/drop-marker-data.js";
import fs from "node:fs";

const style = GAME_DATA.visual.dropMarker;

// A document whose canvases record every 2D-context call and property write in order.
function withRecordingDocument(run) {
  const old = globalThis.document,
    canvases = [];
  globalThis.document = {
    createElement() {
      const log = [],
        canvas = {
          width: 0,
          height: 0,
          log,
          getContext: () =>
            new Proxy(
              {},
              {
                set: (_, key, value) => (log.push(["set", key, typeof value === "object" ? "gradient" : value]), true),
                get: (_, key) =>
                  key === "createRadialGradient"
                    ? (...args) => (log.push(["call", key, ...args]), { addColorStop: (...stop) => log.push(["stop", ...stop]) })
                    : (...args) => log.push(["call", key, ...args]),
              },
            ),
        };
      canvases.push(canvas);
      return canvas;
    },
  };
  try {
    return run(canvases);
  } finally {
    globalThis.document = old;
  }
}

test("the moved drop-marker numbers equal the old inline ones", () => {
  assert.deepEqual(style.label, { canvasWidth: 384, canvasHeight: 64, textY: 34, textMaxWidth: 360, opacityBase: 0.75, opacitySwing: 0.25 });
  assert.deepEqual(style.glow, { canvasPx: 256, groundY: 0.04, clearShare: 0.8, clearAlpha: 0.05, innerAlpha: 0.45, bandAlpha: 0.6, outerAlpha: 0.45, tailShare: 0.35, tailAlpha: 0.18 });
  assert.equal(style.ringY, 0.045);
  assert.equal(style.ringSegments, 48);
  assert.equal(384 / 64, 6, "the label sprite aspect was labelWidth / 6");
});

test("the label canvas and the glow gradient make the same 2D calls as before", () => {
  withRecordingDocument((canvases) => {
    const marker = createDropMarker("Ember Projector", { ...style, shape: "circle" });
    const [glowCanvas, labelCanvas] = canvases;
    assert.equal(labelCanvas.width, 384);
    assert.equal(labelCanvas.height, 64);
    const bars = labelCanvas.log.filter(([kind, name]) => kind === "call" && name === "fillRect").map(([, , ...a]) => a);
    assert.deepEqual(bars, [[0, 0, 384, 64], [0, 0, 384, 3], [0, 61, 384, 3], [0, 0, 3, 64], [381, 0, 3, 64]]);
    assert.deepEqual(labelCanvas.log.find(([kind, name]) => kind === "call" && name === "fillText"), ["call", "fillText", "EMBER PROJECTOR", 192, 34, 360]);
    assert.equal(glowCanvas.width, 256);
    assert.equal(glowCanvas.height, 256);
    assert.deepEqual(glowCanvas.log.find(([, name]) => name === "createRadialGradient"), ["call", "createRadialGradient", 128, 128, 0, 128, 128, 128]);
    assert.deepEqual(glowCanvas.log.find(([, name]) => name === "fillRect"), ["call", "fillRect", 0, 0, 256, 256]);
    const inner = style.ringInner / style.glowOuter,
      outer = style.ringOuter / style.glowOuter,
      stops = glowCanvas.log.filter(([kind]) => kind === "stop").map(([, at, colour]) => [at, Number(/,([\d.]+)\)$/.exec(colour)[1])]);
    assert.deepEqual(stops, [
      [0, 0],
      [inner * 0.8, 0.05],
      [inner, 0.45],
      [(inner + outer) / 2, 0.6],
      [outer, 0.45],
      [Math.min(1, outer + (1 - outer) * 0.35), 0.18],
      [1, 0],
    ]);
    assert.equal(marker.group.children.find((c) => c.isMesh && c.geometry.type === "PlaneGeometry").position.y, 0.04);
    assert.equal(marker.ring.position.y, 0.045);
    assert.equal(marker.sprite.scale.y, style.labelWidth / 6);
    marker.ring.onBeforeRender();
    const p = marker.sprite.material.opacity;
    assert.ok(p >= 0.75 + 0.25 * style.minOpacity - 1e-9 && p <= 1 + 1e-9, "label opacity swings 0.75 to 1");
  });
  assert.equal(markerGeometry({ ...style, shape: "circle" }).parameters.thetaSegments, 48);
});

test("the layout validator rejects bad rows", () => {
  assert.doesNotThrow(() => validateDropMarkerLayout(structuredClone(style)));
  const raw = () => JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url)));
  assert.doesNotThrow(() => validateVisual(raw()));
  for (const mutate of [
    (m) => (m.label.extra = 1),
    (m) => (m.label.textY = 99),
    (m) => (m.label.opacityBase = 0.9),
    (m) => (m.glow.clearShare = 2),
    (m) => (m.ringSegments = 2),
    (m) => delete m.ringY,
  ]) {
    const d = raw();
    mutate(d.dropMarker);
    assert.throws(() => validateVisual(d));
  }
});
