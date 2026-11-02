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
  assert.equal(p.tick(row.slowSeconds * 0.5).timeScale, row.timeScale);
  assert.equal(p.tick(row.slowSeconds * 0.4).timeScale, row.timeScale);
  assert.equal(p.tick(row.slowSeconds * 0.1 + row.easeBackSeconds * 0.5).active, true);
  assert.equal(p.tick(row.easeBackSeconds).active, false);
  assert.equal(p.tick(1).timeScale, 1);
});

test("chained deaths inside the cooldown never restart the effect; after it they may", () => {
  const p = createDeathPresentation(row, true);
  let slow = 0;
  const run = (seconds, again) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      if (again) p.observe(death(boss));
      const s = p.tick(1 / 60);
      if (s.active) slow += 1 / 60;
    }
  };
  p.observe(death(boss));
  run(row.retriggerCooldownSeconds - 0.2, true); // a death every frame during the burst
  assert.ok(slow <= row.maxTotalSlowSeconds, `slow ${slow}`);
  assert.ok(slow <= row.slowSeconds + row.easeBackSeconds + 0.05);
  assert.equal(p.active(), false);
  run(0.5, false);
  p.observe(death(hunter));
  assert.equal(p.tick(0.01).active, true);
});

test("maxTotalSlowSeconds hard-caps one window", () => {
  const capped = { ...row, slowSeconds: 2, easeBackSeconds: 0.5, maxTotalSlowSeconds: 1, retriggerCooldownSeconds: 6 };
  const p = createDeathPresentation(capped, true);
  p.observe(death(boss));
  let t = 0;
  while (p.tick(0.05).active && t < 100) t += 0.05;
  assert.ok(t <= 1.05);
  assert.equal(p.tick(0.05).timeScale, 1);
});

test("reset clears effect, scale and focus; a dt spike resets too", () => {
  const p = createDeathPresentation(row, true);
  p.observe(death(boss));
  assert.equal(p.tick(0.1).active, true);
  p.reset();
  const s = p.tick(0.1);
  assert.equal(s.timeScale, 1);
  assert.equal(s.focus, undefined);
  p.observe(death(boss));
  p.tick(0.1);
  const spike = p.tick(row.dtSpikeSeconds + 0.1);
  assert.equal(spike.timeScale, 1);
  assert.equal(spike.zoomMul, 1);
  assert.equal(p.active(), false);
});

test("off switch ?deathcam=0 disables, default is on", () => {
  assert.equal(deathcamEnabled(row, "?deathcam=0"), false);
  assert.equal(deathcamEnabled(row, ""), true);
  assert.equal(deathcamEnabled(row, "?deathcam=1"), true);
  const p = createDeathPresentation(row, deathcamEnabled(row, "?deathcam=0"));
  p.observe(death(boss));
  assert.equal(p.tick(0.1).timeScale, 1);
});
