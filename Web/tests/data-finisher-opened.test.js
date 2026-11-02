import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { openedValues } from "./helpers/opened-values.js";

// finisher-opened.js loses its tuning numbers: the bake's step budget, the cut and cap look, the search and floor-table resolution and the fall of
// the three pieces are appearance.json `finisherOpened`. The fixture is every value the module computed on the synthetic rig before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/opened-pre-data.json", import.meta.url)));
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every value the Opened cut computes equals the old one exactly", () => {
  const now = openedValues();
  for (const part of Object.keys(old)) assert.deepEqual(now[part], old[part], part);
  assert.equal(old.buffers.length, 7);
  assert.equal(Object.keys(old.poses).length, 41);
  assert.equal(old.budget.tight, "throws Opened vertex budget exceeded");
  assert.equal(old.budget.noClip, "throws Unsupported Opened foundation");
  assert(new Set(Object.values(old.start).map((s) => s[0])).size === 2, "the start check says both yes and no");
});

test("the numbers are frozen data read through game-data.js", () => {
  const o = GAME_DATA.appearance.finisherOpened;
  assert.equal(o.waistShare, 0.6);
  assert.equal(o.cutColor, "#501c20");
  assert.deepEqual(o.phases.fall, [0.2, 0.66]);
  assert.deepEqual(o.slides.weapon, [0.25, -0.35]);
  assert(Object.isFrozen(o));
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = rawAppearance();
    mutate(d.finisherOpened);
    validateAppearance(d);
  };
  assert.throws(broken((o) => delete o.waistShare));
  assert.throws(broken((o) => (o.waistShare = 2)));
  assert.throws(broken((o) => (o.chunkVertices = 2048.5)));
  assert.throws(broken((o) => (o.cutColor = "red")));
  assert.throws(broken((o) => (o.phases.fall = [0.5, 0.2])));
  assert.throws(broken((o) => (o.slides.upper = [9, 0])));
  assert.throws(broken((o) => (o.extra = 1)));
  assert.doesNotThrow(broken(() => {}));
});

test("the module has no tuning number left", () => {
  const text = fs.readFileSync(new URL("../src/finisher-opened.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
});
