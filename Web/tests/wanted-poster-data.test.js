import test from "node:test";
import assert from "node:assert/strict";
import { paintWanted } from "../src/engine/wanted-projection.js";
import { createWantedMesh } from "../src/engine/wanted-projection.js";
import { validateWantedPoster } from "../src/engine/wanted-poster-data.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// The painter exactly as it was before its numbers moved into visual.json (wanted-projection.js 41 to 0).
function paintWantedBefore(canvas, portrait, bounty) {
  const c = canvas.getContext("2d");
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#e5e5df";
  c.textAlign = "center";
  c.font = "700 82px monospace";
  c.fillText("WANTED", 192, 100);
  c.globalAlpha = 0.86;
  c.drawImage(portrait, 64, 170, 256, 320);
  c.globalAlpha = 1;
  const amount = "$" + bounty.toLocaleString("en-US");
  c.font = "700 92px monospace";
  const width = c.measureText(amount).width;
  if (width > 300) c.font = `700 ${Math.floor((92 * 300) / width)}px monospace`;
  c.fillText(amount, 192, 625);
  c.globalAlpha = 0.4;
  c.fillRect(40, 125, 304, 2);
  c.fillRect(64, 655, 256, 2);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "destination-out";
  for (let n = 0; n < 140; n++) {
    const x = (n * 193 + 31) % 384,
      y = (n * 271 + 67) % 700;
    c.fillStyle = `rgba(0,0,0,${0.1 + (n % 4) * 0.06})`;
    c.fillRect(x, y, 1 + (n % 3), 1);
  }
  for (let n = 0; n < 9; n++) {
    c.fillStyle = "rgba(0,0,0,.12)";
    c.fillRect(25 + ((n * 71) % 250), 140 + n * 51, 45 + (n % 4) * 9, 1);
  }
  c.globalCompositeOperation = "source-over";
}

// A context that records every property write and call in order.
const recorder = (log, textWidth) => ({
  getContext: () =>
    new Proxy(
      {},
      {
        set: (_, key, value) => (log.push(["set", key, value]), true),
        get: (_, key) =>
          key === "measureText"
            ? (text) => (log.push(["call", key, text]), { width: textWidth })
            : (...args) => log.push(["call", key, ...args]),
      },
    ),
  width: 384,
  height: 768,
});

test("the poster paints exactly the same calls after its numbers moved into data", () => {
  for (const [bounty, textWidth] of [[500, 250], [12500, 300], [100000, 480], [9, 90]]) {
    const before = [],
      after = [];
    const portrait = { tag: "portrait" };
    paintWantedBefore(recorder(before, textWidth), portrait, bounty);
    paintWanted(recorder(after, textWidth), portrait, bounty);
    assert.ok(before.length > 300, "the wear loops ran");
    assert.deepEqual(after, before, `bounty ${bounty}`);
  }
});

test("poster mesh colour and render order are the old values; canvas, flicker and the validator hold", () => {
  const P = GAME_DATA.visual.wantedPoster;
  assert.equal(Number("0x" + P.meshColour), 0xdce2ca);
  assert.equal(P.renderOrder, -95);
  assert.deepEqual(P.canvas, { width: 384, height: 768 });
  assert.deepEqual(P.flickerHz, [17, 43]);
  assert.doesNotThrow(() => validateWantedPoster(structuredClone(P)));
  for (const mutate of [
    (p) => (p.extra = 1),
    (p) => (p.portrait.alpha = 2),
    (p) => (p.specks.spanX = 0),
    (p) => (p.meshColour = "DCE2CA"),
    (p) => (p.flickerHz = [17]),
    (p) => (p.amount.maxWidth = 0),
  ]) {
    const bad = structuredClone(P);
    mutate(bad);
    assert.throws(() => validateWantedPoster(bad));
  }
  assert.equal(typeof createWantedMesh, "function");
});
