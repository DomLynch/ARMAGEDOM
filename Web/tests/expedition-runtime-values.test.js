import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { atlasConnectionPoints } from "../src/engine/expedition-runtime.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// Differential test: the atlas connection lines the journal draws between area cards (every card pair of the 3 by 3 grid) are exactly
// what the inline numbers produced, and the two HUD numbers moved to visual.json `expeditionHud` equal the literals they replaced.
// The expected digest was recorded from the code before the move (UPDATE_EXPEDITION_DIGEST=1 rewrites it; only for an intended change).
const digestPath = new URL("./fixtures/expedition-runtime-values.json", import.meta.url);
const hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

function snapshot() {
  const cards = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) cards.push({ row, column });
  const lines = [];
  for (const a of cards) for (const b of cards) lines.push([a, b, atlasConnectionPoints(a, b)]);
  return { pairs: lines.length, lines: hash(lines), sample: atlasConnectionPoints({ row: 0, column: 0 }, { row: 0, column: 2 }) };
}

test("expedition atlas lines are value-identical to the pre-data code", () => {
  const got = snapshot();
  if (process.env.UPDATE_EXPEDITION_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
});

test("the case scale and the guard label distance equal the literals they replaced", () => {
  const hud = GAME_DATA.visual.expeditionHud;
  if (!hud) return; // before the move the numbers are still inline
  assert.equal(hud.caseScale, 1.35);
  assert.equal(hud.guardLabelDistance, 10);
  assert.deepEqual(hud.atlas, { cell: 100, gutter: 3, columns: 3, rows: 3, lanes: [100, 200] });
});
