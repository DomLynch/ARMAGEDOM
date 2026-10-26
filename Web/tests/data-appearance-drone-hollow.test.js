import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { DRONE_SUPPORT, DRONE_VISUAL_SCALE } from "../src/low-hover-drone.js";
import { DRONE_RULES } from "../src/drone-mechanics.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: the Crooked Hollow bone list and the drone's support row moved into Web/src/data/appearance.json.
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));
const text = (file) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));

test("the Crooked Hollow bone list equals the old in-code list", () => {
  assert.deepEqual(GAME_DATA.appearance.crookedHollow.bones, [
    "pelvis", "spine_01", "spine_02", "neck_01", "clavicle_l", "clavicle_r",
    "upperarm_l", "lowerarm_l", "hand_l", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
  ]);
  assert(Object.isFrozen(GAME_DATA.appearance.crookedHollow.bones));
});

test("the drone support row equals the old in-code row, with the same key order, and is frozen", () => {
  assert.deepEqual(DRONE_SUPPORT, {
    id: "low-hover-watcher",
    procedural: true,
    rig: null,
    clips: [],
    states: ["idle", "patrol", "alert", "attack", "death"],
    hoverHeight: DRONE_RULES.hoverHeight,
    bodyBand: [DRONE_RULES.hoverHeight - 0.21 * DRONE_VISUAL_SCALE, DRONE_RULES.hoverHeight + 0.19 * DRONE_VISUAL_SCALE],
    movementRadius: DRONE_RULES.radius,
    attackWarningSeconds: 0.6,
    deathSeconds: 0.8,
    finisher: "native-weapon-cosmetic",
    melee: "Requires Combat actual blade/body validation; no immunity or headshot claim",
  });
  assert.deepEqual(Object.keys(DRONE_SUPPORT), ["id", "procedural", "rig", "clips", "states", "hoverHeight", "bodyBand", "movementRadius", "attackWarningSeconds", "deathSeconds", "finisher", "melee"]);
  assert(Object.isFrozen(DRONE_SUPPORT) && Object.isFrozen(DRONE_SUPPORT.states) && Object.isFrozen(DRONE_SUPPORT.bodyBand));
});

test("the loader rejects a broken crookedHollow or droneSupport block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAppearance(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.crookedHollow; }));
  assert.throws(broken((d) => { d.crookedHollow.extra = 1; }));
  assert.throws(broken((d) => { d.crookedHollow.bones.push(d.crookedHollow.bones[0]); }));
  assert.throws(broken((d) => { d.crookedHollow.bones = []; }));
  assert.throws(broken((d) => { delete d.droneSupport; }));
  assert.throws(broken((d) => { d.droneSupport.extra = 1; }));
  assert.throws(broken((d) => { d.droneSupport.states.push("idle"); }));
  assert.throws(broken((d) => { d.droneSupport.bodyBandOffsets = [0.2, -0.2]; }));
  assert.throws(broken((d) => { d.droneSupport.bodyBandOffsets = [-0.2]; }));
  assert.throws(broken((d) => { d.droneSupport.deathSeconds = 0; }));
  assert.throws(broken((d) => { d.droneSupport.melee = ""; }));
});

test("the finisher presentation reads the head mesh names from the face data instead of its own list", () => {
  const source = text("finisher-presentation.js");
  assert.deepEqual(GAME_DATA.appearance.faceMesh.headNames, ["Photo", "PhotoEyes", "PhotoTeeth"]);
  assert.equal(countConstantTables(source), 0);
  assert.ok(source.includes("GAME_DATA.appearance.faceMesh") && !source.includes('"PhotoEyes"'));
  assert.equal(baseline.constantTables["finisher-presentation.js"], undefined);
});

test("the modules read the data; the drone row and the reaper rule names stay in code with a reason", () => {
  assert.equal(countConstantTables(text("crooked-hollow.js")), 0);
  assert.equal(baseline.constantTables["crooked-hollow.js"], undefined);
  assert.ok(text("crooked-hollow.js").includes("GAME_DATA.appearance.crookedHollow"));
  assert.ok(text("low-hover-drone.js").includes("GAME_DATA.appearance.droneSupport"));
  assert.deepEqual(baseline.keepInCode["low-hover-drone.js"].map((r) => r.name), ["DRONE_SUPPORT"]);
  assert.deepEqual(baseline.keepInCode["engine/reaper.js"].map((r) => r.name), ["RULE_KEYS"]);
});
