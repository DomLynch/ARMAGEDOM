import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures } from "../src/engine/game-data.js";
import { FERAL_BODY_SHAPES } from "../src/feral-body-shapes.js";
import { FERAL_COAT_PROFILES } from "../src/feral-coat-profiles.js";
import { RIG_CAPABILITIES, rigCapability, rigNumber, rigText } from "../src/rig-capabilities.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move: FERAL_BODY_SHAPES, FERAL_COAT_PROFILES, the gaunt-shape TARGETS/SHAPE tables and RIG_CAPABILITIES moved into
// creatures.json (`feralBodyShapes`, `feralCoatProfiles`, `gauntShape`, `rigCapabilities`). The fixture is the old in-code tables,
// dumped from the old modules before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/feral-gaunt-rig-pre-data.json", import.meta.url)));
const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));

test("every table equals the old in-code table exactly (values and key order) and is frozen", () => {
  for (const [rows, expected, name] of [
    [FERAL_BODY_SHAPES, old.feralBodyShapes, "feralBodyShapes"],
    [FERAL_COAT_PROFILES, old.feralCoatProfiles, "feralCoatProfiles"],
  ]) {
    assert.deepEqual(rows, expected, name);
    assert.equal(GAME_DATA.creatures[name], rows);
    assert(Object.isFrozen(rows), `${name} frozen`);
  }
  // The rig rows keep growing as lanes move more rig behaviour into them: every field the fixture knew keeps its value.
  assert(Object.isFrozen(RIG_CAPABILITIES));
  assert.deepEqual(Object.keys(RIG_CAPABILITIES), Object.keys(old.rigCapabilities));
  for (const [rig, row] of Object.entries(old.rigCapabilities))
    for (const [field, value] of Object.entries(row))
      assert.deepEqual(RIG_CAPABILITIES[rig][field], value, `${rig}.${field}`);
  assert(
    FERAL_BODY_SHAPES.every(Object.isFrozen) &&
      FERAL_COAT_PROFILES.every((r) => Object.isFrozen(r) && Object.isFrozen(r.tint)),
  );
  const { targets, segments } = GAME_DATA.creatures.gauntShape;
  assert.deepEqual(targets, old.gauntTargets);
  assert.deepEqual(segments, old.gauntShape);
  assert.deepEqual(Object.keys(segments), Object.keys(old.gauntShape), "gaunt segment order");
  assert(Object.isFrozen(targets) && Object.isFrozen(segments));
});

test("rigCapability answers as before", () => {
  for (const [rig, row] of Object.entries(old.rigCapabilities)) {
    for (const flag of [
      "lowStrike",
      "tutorialHunt",
      "breathEmitter",
      "hoverTarget",
      "fixedPointerScale",
      "strictAlive",
    ])
      assert.equal(rigCapability(rig, flag), row[flag] === true, `${rig} ${flag}`);
    for (const name of ["targetHeight", "targetHeightReach", "hitTicks", "deathTicks"])
      assert.equal(rigNumber(rig, name), row[name], `${rig} ${name}`);
    for (const name of ["hitClip", "deathClip"]) assert.equal(rigText(rig, name), row[name], `${rig} ${name}`);
  }
  assert.equal(rigCapability("hero", "lowStrike"), false);
});

test("the loader rejects a broken block", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(broken(() => {}));
  for (const key of ["feralBodyShapes", "feralCoatProfiles", "gauntShape", "rigCapabilities"])
    assert.throws(
      broken((d) => {
        delete d[key];
      }),
      key,
    );
  assert.throws(
    broken((d) => {
      d.feralBodyShapes = [];
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralBodyShapes.push({ ...d.feralBodyShapes[0] });
    }),
    "duplicate id",
  );
  assert.throws(
    broken((d) => {
      d.feralBodyShapes[0].width = "0.6";
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralBodyShapes[0].extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralCoatProfiles[0].tint = [1, 1];
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralCoatProfiles[0].tint[2] = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralCoatProfiles[0].shapePending = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.feralBodyShapes = d.feralBodyShapes.slice(1);
    }),
    "shapePending without a body shape",
  );
  assert.throws(
    broken((d) => {
      d.gauntShape.targets = [];
    }),
  );
  assert.throws(
    broken((d) => {
      d.gauntShape.segments = {};
    }),
  );
  assert.throws(
    broken((d) => {
      d.gauntShape.segments.pelvis = ["spine_01"];
    }),
  );
  assert.throws(
    broken((d) => {
      d.gauntShape.segments.pelvis = ["spine_01", 1.2];
    }),
  );
  assert.throws(
    broken((d) => {
      d.gauntShape.segments["bad name"] = ["spine_01", 0.5];
    }),
  );
  assert.throws(
    broken((d) => {
      d.rigCapabilities = {};
    }),
  );
  assert.throws(
    broken((d) => {
      d.rigCapabilities["original-rat"].lowStrike = "";
    }),
  );
  assert.throws(
    broken((d) => {
      d.rigCapabilities["original-rat"].hitTicks = null;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rigCapabilities["original-rat"].targetHeight = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rigCapabilities["original-rat"]["Bad name"] = true;
    }),
  );
});

test("the four modules keep no constant tables; the baseline no longer lists them", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of ["feral-body-shapes.js", "feral-coat-profiles.js", "gaunt-shape.js", "rig-capabilities.js"]) {
    assert.equal(countConstantTables(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")), 0, file);
    assert.equal(baseline.constantTables[file], undefined, file);
  }
});
