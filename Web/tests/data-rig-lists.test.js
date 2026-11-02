import test from "node:test";
import assert from "node:assert/strict";
import { rigCapability } from "../src/rig-capabilities.js";

// Data move: combat.js tested six rig-name lists inline (the five animals, the five animals plus the drone, the wolf and salamander).
// They are now the capabilities animal, lowStrike and nativeSkeleton. The OLD lists below are copied verbatim from combat.js before
// the move; every rig value, including unknown ones and undefined, must answer the same.
const ANIMALS = ["original-rat", "original-dog", "original-roach", "giant-salamander", "original-wolf"];
const LOW = [...ANIMALS, "low-hover-drone"];
const NATIVE = ["giant-salamander", "original-wolf"];
const probes = [
  ...LOW,
  "original-human",
  "boss-butcher",
  "original-rat ",
  "",
  undefined,
  null,
  "constructor",
  "__proto__",
];

test("each capability answers exactly as the old inline list did", () => {
  for (const rig of probes) {
    assert.equal(rigCapability(rig, "animal"), ANIMALS.includes(rig), `animal ${rig}`);
    assert.equal(rigCapability(rig, "lowStrike"), LOW.includes(rig), `lowStrike ${rig}`);
    assert.equal(rigCapability(rig, "nativeSkeleton"), NATIVE.includes(rig), `nativeSkeleton ${rig}`);
  }
});
