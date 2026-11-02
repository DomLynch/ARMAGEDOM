import test from "node:test";
import assert from "node:assert/strict";
import { rigCapability, rigText } from "../src/rig-capabilities.js";

// Data move: combat.js picked the per-tick behaviour, the low knife pose, the bite and a few quirks by comparing rig names. They are
// rows of rig-capabilities.json now. The OLD comparisons below are copied verbatim from combat.js before the move; every rig
// value, including unknown ones and undefined, must resolve to the same answer.
const probes = [
  "original-rat",
  "original-dog",
  "original-roach",
  "giant-salamander",
  "original-wolf",
  "low-hover-drone",
  "original-human",
  "boss-butcher",
  "",
  undefined,
  null,
  "constructor",
];

// Old stepEnemy dispatch: drone, rat, dog-brain, else humanoid.
const oldBrain = (rig) =>
  rig === "low-hover-drone"
    ? "drone"
    : rig === "original-rat"
      ? "rat"
      : rig === "original-dog" || rig === "original-roach" || rig === "giant-salamander" || rig === "original-wolf"
        ? "dog"
        : "humanoid";
// Old low knife pose choice (inside the lowStrike branch).
const oldLowPose = (rig) =>
  rig === "low-hover-drone"
    ? "drone"
    : rig === "original-wolf" || rig === "giant-salamander"
      ? "dogMid"
      : rig === "original-dog"
        ? "dog"
        : rig === "original-roach"
          ? "roach"
          : "rat";
const newLowPose = (rig) =>
  rigText(rig, "brain") === "drone"
    ? "drone"
    : rigCapability(rig, "nativeSkeleton")
      ? "dogMid"
      : rigText(rig, "lowSwing") === "dog"
        ? "dog"
        : rigText(rig, "lowSwing") === "roach"
          ? "roach"
          : "rat";
const oldBite = (rig) =>
  rig === "original-wolf"
    ? "wolf"
    : rig === "giant-salamander"
      ? "salamander"
      : rig === "original-roach"
        ? "roach"
        : "dog";
const newBite = (rig) => rigText(rig, "biteMove") ?? "dog";

test("behaviour dispatch equals the old comparison chain for every rig", () => {
  for (const rig of probes) {
    assert.equal(rigText(rig, "brain") ?? "humanoid", oldBrain(rig), `brain ${rig}`);
    assert.equal(newLowPose(rig), rig === undefined || rig === null ? "rat" : oldLowPose(rig), `low pose ${rig}`);
    assert.equal(newBite(rig), oldBite(rig), `bite ${rig}`);
    assert.equal(rigCapability(rig, "areaPursuit"), rig === "giant-salamander", `areaPursuit ${rig}`);
    assert.equal(rigCapability(rig, "fireBreath"), rig === "giant-salamander", `fireBreath ${rig}`);
    assert.equal(rigCapability(rig, "calfContact"), rig === "original-roach", `calfContact ${rig}`);
    assert.equal(rigCapability(rig, "mouthAim"), rig === "original-wolf", `mouthAim ${rig}`);
    assert.equal(rigText(rig, "brain") === "drone", rig === "low-hover-drone", `drone ${rig}`);
  }
});

test("a flag is not a name and a name is not a flag", () => {
  assert.equal(rigText("original-dog", "animal"), undefined);
  assert.equal(rigCapability("original-dog", "brain"), false);
  assert.equal(rigText("original-human", "brain"), undefined);
});
