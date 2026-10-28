import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateDeathPresentation } from "../src/engine/game-data-hunters.js";
import {
  createDeathPresentation,
  deathcamEnabled,
  eligible,
  presentationAt,
} from "../src/engine/death-presentation.js";

const row = GAME_DATA.deathPresentation;
const death = (actor) => [{ type: "death", actor }];
const hunter = { markedHunter: true, pos: { x: 3, z: 4 } };
const boss = { bossProfile: {}, pos: { x: 1, z: 2 } };
const trash = { pos: { x: 0, z: 0 } };

test("validator accepts the shipped row and rejects bad rows", () => {
  validateDeathPresentation(structuredClone(row));
  const bad = (patch) =>
    assert.throws(() => validateDeathPresentation({ ...structuredClone(row), ...patch }), TypeError);
  bad({ timeScale: 0 });
  bad({ timeScale: 1.5 });
  bad({ slowSeconds: 0 });
  bad({ slowSeconds: 3, easeBackSeconds: 1 });
  bad({ zoomPushPct: 90 });
  bad({ focusShare: 2 });
  bad({ eligibleFlags: [] });
  bad({ defaultOn: "yes" });
  bad({ note: "" });
  assert.throws(() => validateDeathPresentation({ ...structuredClone(row), extra: 1 }));
});

test("trash kinds are not eligible and get time scale 1 and no zoom", () => {
  assert.equal(eligible(row, trash), false);
  const p = createDeathPresentation(row, true);
  p.observe(death(trash));
  const s = p.tick(0.1);
  assert.equal(s.timeScale, 1);
  assert.equal(s.zoomMul, 1);
  assert.equal(s.active, false);
});

test("boss and marked hunter get the row values", () => {
  for (const actor of [hunter, boss]) {
    assert.equal(eligible(row, actor), true);
    const p = createDeathPresentation(row, true);
    p.observe(death(actor));
    const s = p.tick(row.pushInSeconds);
    assert.equal(s.timeScale, row.timeScale);
    assert.ok(Math.abs(s.zoomMul - (1 + row.zoomPushPct / 100)) < 1e-9);
    assert.deepEqual(s.focus, { x: actor.pos.x, z: actor.pos.z });
    assert.ok(Math.abs(s.share - row.focusShare) < 1e-9);
  }
});

test("easing is monotone and returns exactly to 1", () => {
  const end = row.slowSeconds + row.easeBackSeconds;
  let prevScale = 0,
    prevWeight = 0,
    weightPeaked = false;
  for (let age = row.slowSeconds; age <= end; age += end / 500) {
    const p = presentationAt(row, age);
    assert.ok(p.timeScale >= prevScale - 1e-12);
    prevScale = p.timeScale;
  }
  for (let age = 0; age <= end; age += end / 1000) {
    const { weight, timeScale } = presentationAt(row, age);
    assert.ok(timeScale >= row.timeScale - 1e-12 && timeScale <= 1);
    if (age < row.pushInSeconds) assert.ok(weight >= prevWeight - 1e-12);
    if (age > row.slowSeconds) assert.ok(weight <= prevWeight + 1e-12);
    if (age >= row.pushInSeconds && age <= row.slowSeconds) weightPeaked = true;
    prevWeight = weight;
  }
  assert.ok(weightPeaked);
  const last = presentationAt(row, end);
  assert.equal(last.timeScale, 1);
  assert.equal(last.zoomMul, 1);
  assert.equal(presentationAt(row, end + 5).timeScale, 1);
});

test("runtime goes idle after the window in real seconds", () => {
  const p = createDeathPresentation(row, true);
  p.observe(death(boss));
  assert.equal(p.tick(row.slowSeconds - 0.01).timeScale, row.timeScale);
  assert.equal(p.tick(row.easeBackSeconds + 0.1).active, false);
  assert.equal(p.tick(1).timeScale, 1);
});

test("off switch ?deathcam=0 disables, default is on", () => {
  assert.equal(deathcamEnabled(row, "?deathcam=0"), false);
  assert.equal(deathcamEnabled(row, ""), true);
  assert.equal(deathcamEnabled(row, "?deathcam=1"), true);
  const p = createDeathPresentation(row, deathcamEnabled(row, "?deathcam=0"));
  p.observe(death(boss));
  assert.equal(p.tick(0.1).timeScale, 1);
});
